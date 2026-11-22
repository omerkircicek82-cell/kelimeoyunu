import { BadRequestException, ConflictException, HttpException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { evaluateGuess } from "@arena/game-engine";
import {
  INITIAL_RATING, LEAGUES, LEAGUE_DETAILS, MAX_ATTEMPTS, normalizeWord, progressionFor,
  ratedRoundDelta, SOLO_TICKET_LIMIT,
  type AccountProfile, type AuthReply, type LeagueId, type LeaderboardEntry, type SoloResultRequest,
} from "@arena/shared";
import { Prisma, type PrismaClient } from "./generated/prisma/client";

const deriveKey = promisify(scrypt);
const profileFields = {
  id: true, username: true, rating: true, ratedGames: true,
  wins: true, winStreak: true, bestWinStreak: true, peakRating: true,
} as const;
type ProfileRow = Prisma.AccountGetPayload<{ select: typeof profileFields }>;
type LockedAccount = Pick<ProfileRow, "rating" | "winStreak" | "bestWinStreak" | "peakRating">;

function toProfile(account: ProfileRow): AccountProfile {
  const { id, username, rating, ratedGames } = account;
  return { id, username, rating, ratedGames, progression: progressionFor(account) };
}

function leaderboardEntry(profile: AccountProfile, rank: number): LeaderboardEntry {
  const { username, rating, ratedGames, progression } = profile;
  return { rank, username, rating, ratedGames, progression };
}

function leaderboardRange(league?: LeagueId): Prisma.AccountWhereInput {
  const ratedGames = { gt: 0 };
  if (!league) return { ratedGames };
  const next = LEAGUES[LEAGUES.indexOf(league) + 1];
  return {
    ratedGames,
    rating: { gte: LEAGUE_DETAILS[league].minRating, lt: next ? LEAGUE_DETAILS[next].minRating : undefined },
  };
}
const sessionMs = 30 * 24 * 60 * 60_000;
const ticketMs = 7 * 24 * 60 * 60_000;
const dummyHash = "00000000000000000000000000000000:" + "00".repeat(64);

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function bearer(value?: string) {
  return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(value ?? "")?.[1];
}

async function lockAccount(db: Prisma.TransactionClient, accountId: string) {
  const rows = await db.$queryRaw<LockedAccount[]>`
    SELECT rating, "winStreak", "bestWinStreak", "peakRating"
    FROM "Account" WHERE id = ${accountId} FOR UPDATE
  `;
  return rows.at(0);
}

async function applyLockedRating(
  db: Prisma.TransactionClient,
  accountId: string,
  id: string,
  source: "online" | "offline",
  account: LockedAccount,
  delta: number,
) {
  const before = account.rating;
  const after = Math.max(0, before + delta);
  const event = await db.ratingEvent.create({
    data: { id, accountId, source, before, after, delta: after - before },
  });
  const won = delta > 0;
  const winStreak = won ? account.winStreak + 1 : 0;
  await db.account.update({
    where: { id: accountId },
    data: {
      rating: after,
      ratedGames: { increment: 1 },
      wins: { increment: won ? 1 : 0 },
      winStreak,
      bestWinStreak: Math.max(account.bestWinStreak, winStreak),
      peakRating: Math.max(account.peakRating, after),
    },
  });
  return event;
}

export async function recordOnlineRating(db: Prisma.TransactionClient, accountId: string, roundId: string, delta: number) {
  const id = `online:${roundId}:${accountId}`;
  const account = await lockAccount(db, accountId);
  if (!account || await db.ratingEvent.findUnique({ where: { id }, select: { id: true } })) return;
  await applyLockedRating(db, accountId, id, "online", account, delta);
}

export class Membership {
  private readonly authAttempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly db: PrismaClient) {}

  limitAuth(address: string) {
    const now = Date.now();
    if (this.authAttempts.size > 512) {
      for (const [key, attempt] of this.authAttempts) {
        if (attempt.expiresAt <= now) this.authAttempts.delete(key);
      }
    }
    let attempt = this.authAttempts.get(address);
    if (!attempt || attempt.expiresAt <= now) {
      if (this.authAttempts.size >= 4_096 && !attempt) throw new HttpException("Çok fazla giriş denemesi. Bir dakika sonra tekrar dene.", 429);
      attempt = { count: 0, expiresAt: now + 60_000 };
      this.authAttempts.set(address, attempt);
    }
    if (++attempt.count > 12) throw new HttpException("Çok fazla giriş denemesi. Bir dakika sonra tekrar dene.", 429);
  }

  async register(username: string, password: string): Promise<AuthReply> {
    const salt = randomBytes(16).toString("hex");
    const hash = (await deriveKey(password, salt, 64) as Buffer).toString("hex");
    try {
      const profile = await this.db.account.create({
        data: { username, passwordHash: `${salt}:${hash}`, rating: INITIAL_RATING }, select: profileFields,
      });
      return this.issueSession(toProfile(profile));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Bu kullanıcı adı kullanımda.");
      }
      throw error;
    }
  }

  async login(username: string, password: string): Promise<AuthReply> {
    const account = await this.db.account.findUnique({
      where: { username }, select: { ...profileFields, passwordHash: true },
    });
    const [salt, hash] = (account?.passwordHash ?? dummyHash).split(":");
    const computed = await deriveKey(password, salt, 64) as Buffer;
    if (!timingSafeEqual(computed, Buffer.from(hash, "hex")) || !account) {
      throw new UnauthorizedException("Kullanıcı adı veya parola hatalı.");
    }
    return this.issueSession(toProfile(account));
  }

  private async issueSession(profile: AuthReply["profile"]): Promise<AuthReply> {
    const token = randomBytes(32).toString("base64url");
    await this.db.accountSession.create({
      data: { id: digest(token), accountId: profile.id, expiresAt: new Date(Date.now() + sessionMs) },
    });
    return { token, profile };
  }

  async getProfile(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await this.db.accountSession.findUnique({
      where: { id: digest(token) }, select: { expiresAt: true, account: { select: profileFields } },
    });
    return session && session.expiresAt.getTime() > Date.now() ? toProfile(session.account) : null;
  }

  async requireProfile(token: string | undefined) {
    const profile = await this.getProfile(token);
    if (!profile) throw new UnauthorizedException("Hesabına yeniden giriş yap.");
    return profile;
  }

  async logout(token: string) {
    await this.db.accountSession.deleteMany({ where: { id: digest(token) } });
  }

  async leaderboard(session?: string, league?: LeagueId) {
    const profile = await this.getProfile(session);
    const where = leaderboardRange(league);
    const accounts = await this.db.account.findMany({
      where,
      orderBy: [{ rating: "desc" }, { username: "asc" }], take: 100, select: profileFields,
    });
    const entries = accounts.map((account, index) => leaderboardEntry(toProfile(account), index + 1));
    if (!profile?.ratedGames || (league && profile.progression?.league !== league) || accounts.some(account => account.id === profile.id)) {
      return { entries };
    }
    const ahead = await this.db.account.count({
      where: { ...where, OR: [
        { rating: { gt: profile.rating } },
        { rating: profile.rating, username: { lt: profile.username } },
      ] },
    });
    entries.push(leaderboardEntry(profile, ahead + 1));
    return { entries };
  }

  async challenges(accountId: string) {
    return this.db.$transaction(async tx => {
      await lockAccount(tx, accountId);
      const now = new Date();
      const open = await tx.soloChallenge.findMany({
        where: { accountId, playedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" }, take: SOLO_TICKET_LIMIT,
      });
      const needed = SOLO_TICKET_LIMIT - open.length;
      if (needed > 0) {
        const pool = await tx.dictionaryWord.findMany({ where: { isAnswer: true }, select: { word: true } });
        const available = pool.map(({ word }) => word).filter(word => !open.some(ticket => ticket.answer === word));
        const expiresAt = new Date(now.getTime() + ticketMs);
        for (let index = 0; index < needed && available.length; index++) {
          const [answer] = available.splice(randomInt(available.length), 1);
          open.push(await tx.soloChallenge.create({ data: { accountId, answer, expiresAt } }));
        }
      }
      return open.map(({ id, answer, expiresAt }) => ({ id, answer, expiresAt: expiresAt.getTime() }));
    });
  }

  async submitSolo(accountId: string, input: SoloResultRequest) {
    return this.db.$transaction(async tx => {
      const account = await lockAccount(tx, accountId);
      if (!account) throw new UnauthorizedException("Hesap bulunamadı.");
      const id = `offline:${input.challengeId}`;
      const ticket = await tx.soloChallenge.findFirst({ where: { id: input.challengeId, accountId } });
      if (!ticket) throw new BadRequestException("Çevrimdışı oyun bileti bu hesaba ait değil.");
      const existing = await tx.ratingEvent.findUnique({ where: { id } });
      if (existing) return { delta: existing.delta, rating: account.rating };
      if (ticket.expiresAt.getTime() <= Date.now()) throw new BadRequestException("Çevrimdışı oyun biletinin süresi dolmuş.");

      const words = input.guesses.map(normalizeWord);
      const solvedAt = words.indexOf(ticket.answer);
      const solved = solvedAt !== -1 && solvedAt === words.length - 1;
      const validLoss = words.length === MAX_ATTEMPTS || (input.roundMode === "timed" && input.expired);
      if (solvedAt !== -1 ? !solved || input.expired : !validLoss) {
        throw new BadRequestException("Oyun tamamlanmamış.");
      }
      const eligible = new Set((await tx.dictionaryWord.findMany({
        where: { word: { in: words } }, select: { word: true },
      })).map(row => row.word));
      if (words.some(word => !eligible.has(word) && word !== ticket.answer)) {
        throw new BadRequestException("Bir tahmin sözlükte bulunamadı.");
      }

      const guesses = words.map(word => ({ word, marks: evaluateGuess(ticket.answer, word) }));
      const event = await applyLockedRating(tx, accountId, id, "offline", account, ratedRoundDelta(guesses, solved));
      await tx.soloChallenge.update({ where: { id: ticket.id }, data: { playedAt: new Date() } });
      return { delta: event.delta, rating: event.after };
    });
  }
}
