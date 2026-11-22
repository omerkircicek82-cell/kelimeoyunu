BEGIN;

ALTER TABLE "GameRoom"
  ADD COLUMN "gameMode" TEXT NOT NULL DEFAULT 'ffa',
  ADD COLUMN "roundCount" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "roundSeconds" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "GameMatch"
  ADD COLUMN "gameMode" TEXT NOT NULL DEFAULT 'ffa',
  ADD COLUMN "roundCount" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "roundSeconds" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "winnerTeamId" TEXT,
  ADD COLUMN "teamResults" JSONB;

ALTER TABLE "RoundPlayerResult"
  ADD COLUMN "elapsedMs" INTEGER,
  ADD COLUMN "teamId" TEXT;

UPDATE "RoundPlayerResult" SET "elapsedMs" = "solveMs" WHERE "solveMs" IS NOT NULL;

ALTER TABLE "MatchResult" ADD COLUMN "teamId" TEXT;

ALTER TABLE "Account"
  ADD COLUMN "wins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "winStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "peakRating" INTEGER NOT NULL DEFAULT 1000;

WITH history AS (
  SELECT "accountId", delta, "before", "after",
    COUNT(*) FILTER (WHERE delta <= 0) OVER (
      PARTITION BY "accountId" ORDER BY "createdAt", id ROWS UNBOUNDED PRECEDING
    ) AS losses
  FROM "RatingEvent"
), runs AS (
  SELECT "accountId", losses,
    COUNT(*) FILTER (WHERE delta > 0)::integer AS wins,
    MAX(GREATEST("before", "after")) AS peak
  FROM history
  GROUP BY "accountId", losses
), totals AS (
  SELECT "accountId", SUM(wins)::integer AS wins, MAX(wins) AS best,
    (ARRAY_AGG(wins ORDER BY losses DESC))[1] AS current_streak, MAX(peak) AS peak
  FROM runs
  GROUP BY "accountId"
)
UPDATE "Account" AS account SET
  wins = totals.wins,
  "winStreak" = totals.current_streak,
  "bestWinStreak" = totals.best,
  "peakRating" = GREATEST(1000, account.rating, totals.peak)
FROM totals WHERE account.id = totals."accountId";

CREATE TABLE "DailyChallenge" (
  "date" TEXT NOT NULL,
  "words" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "DailyAttempt" (
  "date" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "round" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 0,
  "rounds" JSONB NOT NULL,
  "solved" INTEGER NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyAttempt_pkey" PRIMARY KEY ("date", "accountId"),
  CONSTRAINT "DailyAttempt_date_fkey" FOREIGN KEY ("date") REFERENCES "DailyChallenge"("date") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DailyAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DailyAttempt_date_solved_points_idx" ON "DailyAttempt" ("date", "solved" DESC, "points" DESC);

COMMIT;
