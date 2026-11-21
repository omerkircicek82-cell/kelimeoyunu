import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import type { ArenaEvent } from "./arena";

type SessionEvent = {
  type: "session:save";
  id: string;
  playerId: string;
  expiresAt: number;
} | { type: "session:remove"; id: string };

type HistoryEvent = ArenaEvent | SessionEvent;

export class History {
  private readonly db: PrismaClient;
  private tail = Promise.resolve();
  private failed = false;

  constructor(url: string) {
    this.db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 3_000 }),
    });
  }

  async loadDictionary() {
    const rows = await this.db.dictionaryWord.findMany({ select: { word: true, isAnswer: true } });
    return {
      answers: rows.filter(row => row.isAnswer).map(row => row.word),
      accepted: new Set(rows.map(row => row.word)),
    };
  }

  async check() {
    await this.db.$queryRaw`SELECT "roundMode" FROM "GameRoom" LIMIT 1`;
    if (this.failed) throw new Error("Maç geçmişi yazılamadı.");
    return "postgresql" as const;
  }

  enqueue(event: HistoryEvent) {
    const db = this.db;
    this.tail = this.tail.then(async () => {
      for (const delay of [0, 250, 1_000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        try {
          await write(db, event);
          return;
        } catch {
          // All writes are idempotent. Retry transient connection failures in order.
        }
      }
      this.failed = true;
      console.error("Kalıcı kayıt yazılamadı", event.type);
    });
  }

  async close() {
    await this.tail;
    await this.db.$disconnect();
  }
}

async function write(db: PrismaClient, event: HistoryEvent) {
  switch (event.type) {
    case "player:create":
      await db.player.upsert({
        where: { id: event.player.id }, create: event.player, update: { name: event.player.name },
      });
      break;
    case "session:save": {
      const expiresAt = new Date(event.expiresAt);
      await db.playerSession.upsert({
        where: { id: event.id },
        create: { id: event.id, playerId: event.playerId, expiresAt },
        update: { expiresAt },
      });
      break;
    }
    case "session:remove":
      await db.playerSession.deleteMany({ where: { id: event.id } });
      break;
    case "room:create":
    case "room:update":
      await db.gameRoom.upsert({
        where: { id: event.room.id }, create: event.room, update: event.room,
      });
      break;
    case "room:participant":
      await db.roomParticipant.createMany({
        data: [{ roomId: event.roomId, playerId: event.playerId }],
        skipDuplicates: true,
      });
      break;
    case "match:start":
      await db.gameMatch.createMany({
        data: [{ id: event.matchId, roomId: event.roomId, roundMode: event.roundMode }],
        skipDuplicates: true,
      });
      break;
    case "round:end": {
      const { roundId, matchId, number, answer, startedAt, endedAt, guesses, results } = event;
      await db.$transaction([
        db.gameRound.createMany({
          data: [{
            id: roundId, matchId, number, answer,
            startedAt: new Date(startedAt), endedAt: new Date(endedAt),
          }],
          skipDuplicates: true,
        }),
        db.roundGuess.createMany({
          data: guesses.map(({ atMs, ...guess }) => ({ ...guess, roundId, createdAt: new Date(atMs) })),
          skipDuplicates: true,
        }),
        db.roundPlayerResult.createMany({ data: results.map(result => ({ ...result, roundId })), skipDuplicates: true }),
      ]);
      break;
    }
    case "match:end":
      await db.$transaction([
        db.gameMatch.update({ where: { id: event.matchId }, data: { endedAt: new Date(event.endedAt) } }),
        db.matchResult.createMany({
          data: event.results.map(result => ({ ...result, matchId: event.matchId })),
          skipDuplicates: true,
        }),
      ]);
      break;
  }
}
