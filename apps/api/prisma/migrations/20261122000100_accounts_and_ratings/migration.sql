BEGIN;
CREATE TABLE "Account" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 1000 CHECK ("rating" >= 0),
  "ratedGames" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Account_rating_username_idx" ON "Account" ("rating" DESC, "username");
CREATE TABLE "AccountSession" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AccountSession_accountId_idx" ON "AccountSession" ("accountId");
CREATE INDEX "AccountSession_expiresAt_idx" ON "AccountSession" ("expiresAt");
CREATE TABLE "RatingEvent" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "source" TEXT NOT NULL CHECK ("source" IN ('online', 'offline')),
  "before" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "after" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RatingEvent_accountId_createdAt_idx" ON "RatingEvent" ("accountId", "createdAt");
CREATE TABLE "SoloChallenge" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "answer" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "playedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SoloChallenge_accountId_playedAt_expiresAt_idx" ON "SoloChallenge" ("accountId", "playedAt", "expiresAt");
ALTER TABLE "Player" ADD COLUMN "accountId" TEXT REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
