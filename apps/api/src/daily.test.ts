import assert from "node:assert/strict";
import test from "node:test";
import { ROUND_COUNT, type DailyGuessRequest } from "@arena/shared";
import { DailyService, istanbulDate } from "./daily";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

const answers = ["KALEM", "KİTAP", "ORMAN", "MERAK", "ZERRE"];
const wrong = "BİBER";
const accountOne = "elif";
const accountTwo = "deniz";
const day = "2026-11-24";

type Challenge = { date: string; words: string[] };
type Attempt = Prisma.DailyAttemptGetPayload<Record<never, never>>;

function fixture() {
  let now = new Date("2026-11-24T19:00:00Z");
  const challenges = new Map<string, Challenge>();
  const attempts = new Map<string, Attempt>();
  const key = (date: string, accountId: string) => date + ":" + accountId;
  const db = {
    dailyChallenge: {
      async findUnique({ where: { date } }: { where: { date: string } }) {
        return challenges.get(date) ?? null;
      },
      async createMany({ data }: { data: Challenge }) {
        if (!challenges.has(data.date)) challenges.set(data.date, data);
      },
    },
    dailyAttempt: {
      async findUnique({ where: { date_accountId: { date, accountId } } }: {
        where: { date_accountId: { date: string; accountId: string } };
      }) {
        const attempt = attempts.get(key(date, accountId));
        return attempt ? structuredClone({ ...attempt, challenge: challenges.get(date) }) : null;
      },
      async createMany({ data }: { data: Pick<Attempt, "date" | "accountId" | "rounds"> }) {
        const id = key(data.date, data.accountId);
        if (!attempts.has(id)) attempts.set(id, {
          ...data, round: 1, version: 0, solved: 0, points: 0, completedAt: null, createdAt: now, updatedAt: now,
        });
      },
      async updateMany({ where, data }: {
        where: { date: string; accountId: string; version: number };
        data: Partial<Attempt>;
      }) {
        const id = key(where.date, where.accountId);
        const attempt = attempts.get(id);
        if (attempt?.version !== where.version) return { count: 0 };
        attempts.set(id, { ...attempt, ...data, version: where.version + 1 });
        return { count: 1 };
      },
      async findMany({ where: { date }, take }: { where: { date: string }; take: number }) {
        return [...attempts.values()]
          .filter(attempt => attempt.date === date && attempt.completedAt)
          .sort((a, b) => b.solved - a.solved || b.points - a.points || a.accountId.localeCompare(b.accountId))
          .slice(0, take)
          .map(attempt => ({ ...attempt, account: { username: attempt.accountId } }));
      },
    },
  };
  return {
    service: new DailyService(db as unknown as PrismaClient, { answers, accepted: new Set([...answers, wrong]) }, () => now),
    challenges,
    attempts,
    setTime: (instant: string) => { now = new Date(instant); },
  };
}

function request(round: number, word: string, attempt = 1): DailyGuessRequest {
  return { date: day, round, word, requestId: `round-${round}-guess-${attempt}` };
}

test("uses the Istanbul calendar and rejects writes to yesterday's attempt", async () => {
  assert.equal(istanbulDate(new Date("2026-11-24T20:59:59Z")), day);
  assert.equal(istanbulDate(new Date("2026-11-24T21:00:00Z")), "2026-11-25");

  const { service, setTime } = fixture();
  await service.start(accountOne, day);
  setTime("2026-11-24T21:00:00Z");
  assert.deepEqual(await service.get(accountOne), {
    date: "2026-11-25", attempt: null, leaderboard: [], rank: null,
  });
  await assert.rejects(service.guess(accountOne, request(1, wrong)), /Yeni günlük oyun başladı/);
  await assert.rejects(service.start(accountOne, day), /Yeni günlük oyun başladı/);
  await assert.rejects(service.next(accountOne, { date: day, round: 1 }), /Yeni günlük oyun başladı/);
  assert.equal((await service.start(accountOne, "2026-11-25")).attempt?.round, 1);
});

test("same five distinct words, one attempt, idempotent guesses, and private unrevealed answers", async () => {
  const { service, challenges, attempts } = fixture();
  const [one, duplicate, other] = await Promise.all([
    service.start(accountOne, day), service.start(accountOne, day), service.start(accountTwo, day),
  ]);
  assert.deepEqual(one.attempt, duplicate.attempt);
  assert.deepEqual(one.attempt, other.attempt);
  assert.equal(attempts.size, 2);
  assert.equal(challenges.size, 1);
  const words = challenges.get(day)!.words;
  assert.equal(new Set(words).size, ROUND_COUNT);
  for (const word of words) assert.equal(JSON.stringify(one).includes(word), false);
  await assert.rejects(service.next(accountOne, { date: day, round: 1 }), /Önce bu kelimeyi tamamla/);
  await assert.rejects(service.guess(accountOne, request(1, "QQQQQ")), /Sözlükte bulunan/);

  const guess = request(1, wrong);
  const results = await Promise.all(Array.from({ length: 4 }, () => service.guess(accountOne, guess)));
  for (const result of results) {
    assert.equal(result.attempt?.rounds[0].guesses.length, 1);
    assert.equal(result.attempt?.rounds[0].answer, null);
    assert.equal(JSON.stringify(result).includes(guess.requestId), false);
  }
  await assert.rejects(service.guess(accountOne, { ...guess, word: words[0] }), /Bu istek kimliği/);
  const solved = await service.guess(accountOne, request(1, words[0], 2));
  assert.equal(solved.attempt?.rounds[0].answer, words[0]);
  assert.equal(solved.attempt?.rounds[0].points, 650);
  assert.equal(solved.attempt?.phase, "roundEnd");
  const otherPlayer = await service.get(accountTwo);
  assert.equal(otherPlayer.attempt?.rounds[0].answer, null);
  assert.deepEqual(otherPlayer.attempt?.rounds[0].guesses, []);
  assert.deepEqual(otherPlayer.leaderboard, []);
  await Promise.all([
    service.next(accountOne, { date: day, round: 1 }),
    service.next(accountOne, { date: day, round: 1 }),
  ]);
  const resumed = await service.get(accountOne);
  assert.equal(resumed.attempt?.round, 2);
  assert.equal(resumed.attempt?.rounds[0].answer, words[0]);
  assert.equal(resumed.attempt?.rounds[1].answer, null);
  assert.deepEqual((await service.start(accountOne, day)).attempt, resumed.attempt);
});

test("finishes after five wins or exhausted rounds and ranks completed attempts by wins and score", async () => {
  const { service, challenges } = fixture();
  for (const account of ["samet", accountOne, accountTwo, "ece", "yarim"]) await service.start(account, day);
  const words = challenges.get(day)!.words;
  for (let round = 1; round <= ROUND_COUNT; round++) {
    const word = words[round - 1];
    await service.guess(accountOne, request(round, word));
    await service.guess("ece", request(round, word));
    for (let attempt = 1; attempt <= 4; attempt++) await service.guess(accountTwo, request(round, wrong, attempt));
    await service.guess(accountTwo, request(round, word, 5));
    if (round < ROUND_COUNT) {
      await service.guess("samet", request(round, word));
    } else {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const result = await service.guess("samet", request(round, wrong, attempt));
        assert.equal(result.attempt?.rounds.at(-1)?.answer, attempt === 5 ? word : null);
      }
    }
    if (round === ROUND_COUNT) break;
    for (const account of ["samet", accountOne, accountTwo, "ece"]) await service.next(account, { date: day, round });
  }

  const finished = await service.get(accountTwo);
  assert.equal(finished.attempt?.phase, "finished");
  assert.equal(finished.attempt?.points, 2_500);
  assert.equal(finished.rank, 3);
  assert.deepEqual(finished.leaderboard, [
    { username: "ece", rank: 1, solved: 5, points: 3500 },
    { username: accountOne, rank: 1, solved: 5, points: 3500 },
    { username: accountTwo, rank: 3, solved: 5, points: 2500 },
    { username: "samet", rank: 4, solved: 4, points: 2800 },
  ]);
  await assert.rejects(service.guess("samet", request(5, wrong, 6)), /Bu tur artık tahmine açık değil/);
  assert.equal((await service.start(accountTwo, day)).attempt?.phase, "finished");
});
