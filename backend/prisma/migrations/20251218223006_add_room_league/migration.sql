-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "league" TEXT NOT NULL DEFAULT 'NBA',
ADD COLUMN     "settings" JSONB;
