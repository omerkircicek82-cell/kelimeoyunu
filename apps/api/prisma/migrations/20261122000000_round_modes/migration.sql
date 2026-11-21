BEGIN;
CREATE TYPE "RoundMode" AS ENUM ('timed', 'untimed');
ALTER TABLE "GameRoom" ADD COLUMN "roundMode" "RoundMode" NOT NULL DEFAULT 'timed';
ALTER TABLE "GameMatch" ADD COLUMN "roundMode" "RoundMode" NOT NULL DEFAULT 'timed';
COMMIT;
