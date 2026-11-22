import { BadRequestException, ConflictException } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { calculatePoints, evaluateGuess, isTurkishWord } from "@arena/game-engine";
import {
  MAX_ATTEMPTS, ROUND_COUNT, normalizeWord,
  type DailyAttemptView, type DailyGuessRequest, type DailyRoundRequest, type DailyState, type Guess,
} from "@arena/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

type Dictionary = { answers: readonly string[]; accepted: ReadonlySet<string> };
type StoredGuess = Guess & { requestId: string };
type StoredRound = { guesses: StoredGuess[]; solved: boolean; points: number };
const includeChallenge = { challenge: { select: { words: true } } } as const;
type Attempt = Prisma.DailyAttemptGetPayload<{ include: typeof includeChallenge }>;

const dailyDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function istanbulDate(now: Date) {
  const parts = dailyDateFormat.formatToParts(now);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}

function emptyRound(): StoredRound {
  return { guesses: [], solved: false, points: 0 };
}

function ended(round: StoredRound) {
  return round.solved || round.guesses.length >= MAX_ATTEMPTS;
}

function storedRounds(attempt: Attempt) {
  // Only this service writes the attempt history.
  return attempt.rounds as unknown as StoredRound[];
}

function serialize(rounds: StoredRound[]): Prisma.InputJsonArray {
  return rounds.map(({ guesses, solved, points }) => ({
    guesses: guesses.map(({ requestId, word, marks }) => ({ requestId, word, marks })),
    solved,
    points,
  }));
}

function compare(a: { solved: number; points: number }, b: { solved: number; points: number }) {
  return b.solved - a.solved || b.points - a.points;
}

export class DailyService {
  private readonly answers: string[];

  constructor(
    private readonly db: PrismaClient,
    private readonly dictionary: Dictionary,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.answers = [...new Set(dictionary.answers.map(normalizeWord))].filter(word =>
      isTurkishWord(word) && dictionary.accepted.has(word),
    );
    if (this.answers.length < ROUND_COUNT) throw new Error("Günlük oyun için yeterli cevap kelimesi yok.");
  }

  async get(accountId: string): Promise<DailyState> {
    const date = istanbulDate(this.now());
    return this.state(date, accountId, await this.find(date, accountId));
  }

  async start(accountId: string, date: string): Promise<DailyState> {
    this.requireToday(date);
    const existing = await this.find(date, accountId);
    if (existing) return this.state(date, accountId, existing);

    const challenge = await this.db.dailyChallenge.findUnique({ where: { date }, select: { date: true } });
    if (!challenge) {
      const pool = [...this.answers];
      const words = Array.from({ length: ROUND_COUNT }, () => {
        const index = randomInt(pool.length);
        const word = pool[index];
        pool[index] = pool[pool.length - 1];
        pool.pop();
        return word;
      });
      this.requireToday(date);
      // Both constraints are enforced in PostgreSQL so concurrent starts share one challenge.
      await this.db.dailyChallenge.createMany({ data: { date, words }, skipDuplicates: true });
    }
    this.requireToday(date);
    await this.db.dailyAttempt.createMany({
      data: { date, accountId, rounds: serialize([emptyRound()]) },
      skipDuplicates: true,
    });
    return this.state(date, accountId, await this.find(date, accountId));
  }

  async guess(accountId: string, input: DailyGuessRequest): Promise<DailyState> {
    const word = normalizeWord(input.word);
    return this.change(accountId, input.date, attempt => {
      const rounds = storedRounds(attempt);
      const round = rounds[input.round - 1];
      const duplicate = round?.guesses.find(guess => guess.requestId === input.requestId);
      if (duplicate) {
        if (duplicate.word !== word) throw new ConflictException("Bu istek kimliği başka bir tahmin için kullanıldı.");
        return;
      }
      if (!round || input.round !== attempt.round || ended(round) || attempt.completedAt) {
        throw new ConflictException("Bu tur artık tahmine açık değil.");
      }
      if (!isTurkishWord(word) || !this.dictionary.accepted.has(word)) {
        throw new BadRequestException("Sözlükte bulunan beş harfli bir Türkçe kelime gir.");
      }
      const answer = attempt.challenge.words[input.round - 1];
      round.guesses.push({ word, marks: evaluateGuess(answer, word), requestId: input.requestId });
      round.solved = word === answer;
      round.points = round.solved ? calculatePoints(0, round.guesses.length) : 0;
      return {
        rounds: serialize(rounds),
        solved: attempt.solved + Number(round.solved),
        points: attempt.points + round.points,
        completedAt: input.round === ROUND_COUNT && ended(round) ? this.now() : null,
      };
    });
  }

  async next(accountId: string, input: DailyRoundRequest): Promise<DailyState> {
    return this.change(accountId, input.date, attempt => {
      if (input.round < attempt.round) return;
      if (input.round !== attempt.round || attempt.completedAt) {
        throw new ConflictException("Bir sonraki kelimeye geçilemiyor.");
      }
      const rounds = storedRounds(attempt);
      if (!ended(rounds[attempt.round - 1])) throw new ConflictException("Önce bu kelimeyi tamamla.");
      return { round: attempt.round + 1, rounds: serialize([...rounds, emptyRound()]) };
    });
  }

  private requireToday(date: string) {
    if (date !== istanbulDate(this.now())) {
      throw new ConflictException("Yeni günlük oyun başladı. Güncel listeyi yeniden yükle.");
    }
  }

  private find(date: string, accountId: string) {
    return this.db.dailyAttempt.findUnique({
      where: { date_accountId: { date, accountId } },
      include: includeChallenge,
    });
  }

  private async change(
    accountId: string,
    date: string,
    update: (prior: Attempt) => Prisma.DailyAttemptUpdateManyMutationInput | undefined,
  ): Promise<DailyState> {
    for (let retry = 0; retry < 8; retry++) {
      this.requireToday(date);
      const attempt = await this.find(date, accountId);
      if (!attempt) throw new ConflictException("Önce günlük oyuna başla.");
      const data = update(attempt);
      if (!data) return this.state(date, accountId, attempt);

      this.requireToday(date);
      const saved = await this.db.dailyAttempt.updateMany({
        where: { date, accountId, version: attempt.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (saved.count) return this.state(date, accountId, await this.find(date, accountId));
    }
    throw new ConflictException("Oyun başka bir cihazda güncellendi. Güncel durumu yeniden yükle.");
  }

  private view(attempt: Attempt): DailyAttemptView {
    const rounds = storedRounds(attempt);
    return {
      phase: attempt.completedAt ? "finished" : ended(rounds.at(-1)!) ? "roundEnd" : "guessing",
      round: attempt.round,
      rounds: rounds.map((round, index) => ({
        round: index + 1,
        guesses: round.guesses.map(({ word, marks }) => ({ word, marks })),
        answer: ended(round) ? attempt.challenge.words[index] : null,
        solved: round.solved,
        points: round.points,
      })),
      solved: attempt.solved,
      points: attempt.points,
    };
  }

  private async state(date: string, accountId: string, attempt: Attempt | null): Promise<DailyState> {
    const completed = { date, completedAt: { not: null } };
    const entries = await this.db.dailyAttempt.findMany({
      where: completed,
      orderBy: [{ solved: "desc" }, { points: "desc" }, { account: { username: "asc" } }],
      take: 25,
      select: { accountId: true, solved: true, points: true, account: { select: { username: true } } },
    });
    let rank = 1;
    let personalRank: number | null = null;
    const leaderboard = entries.map((entry, index) => {
      if (index && compare(entries[index - 1], entry) !== 0) rank = index + 1;
      if (attempt?.completedAt && entry.accountId === accountId) personalRank = rank;
      return { rank, username: entry.account.username, solved: entry.solved, points: entry.points };
    });
    if (attempt?.completedAt && personalRank === null) {
      personalRank = 1 + await this.db.dailyAttempt.count({
        where: {
          ...completed,
          OR: [{ solved: { gt: attempt.solved } }, { solved: attempt.solved, points: { gt: attempt.points } }],
        },
      });
    }
    return { date, attempt: attempt ? this.view(attempt) : null, leaderboard, rank: personalRank };
  }
}
