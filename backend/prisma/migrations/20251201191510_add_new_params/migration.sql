-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "eligiblePositions" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "PlayerSeasonStat" ADD COLUMN     "per" DOUBLE PRECISION,
ADD COLUMN     "usgPct" DOUBLE PRECISION,
ADD COLUMN     "ws" DOUBLE PRECISION;
