/*
  Warnings:

  - You are about to drop the `DraftPick` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Player` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlayerSeasonStat` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_draftId_fkey";

-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_playerId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerSeasonStat" DROP CONSTRAINT "PlayerSeasonStat_playerId_fkey";

-- DropTable
DROP TABLE "DraftPick";

-- DropTable
DROP TABLE "Player";

-- DropTable
DROP TABLE "PlayerSeasonStat";

-- CreateTable
CREATE TABLE "NBAPlayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "eligiblePositions" TEXT,
    "imageUrl" TEXT,
    "heightInches" INTEGER NOT NULL,
    "primaryTeam" TEXT,
    "primaryEraFrom" INTEGER,
    "primaryEraTo" INTEGER,
    "isHallOfFamer" BOOLEAN NOT NULL DEFAULT false,
    "totalTeams" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NBAPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NBAPlayerSeasonStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "ppg" DOUBLE PRECISION NOT NULL,
    "apg" DOUBLE PRECISION NOT NULL,
    "rpg" DOUBLE PRECISION NOT NULL,
    "spg" DOUBLE PRECISION NOT NULL,
    "bpg" DOUBLE PRECISION NOT NULL,
    "tsPct" DOUBLE PRECISION,
    "threeRate" DOUBLE PRECISION,
    "per" DOUBLE PRECISION,
    "ws" DOUBLE PRECISION,
    "usgPct" DOUBLE PRECISION,

    CONSTRAINT "NBAPlayerSeasonStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NBADraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "ownerIndex" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NBADraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NBAPlayerSeasonStat_playerId_idx" ON "NBAPlayerSeasonStat"("playerId");

-- CreateIndex
CREATE INDEX "NBAPlayerSeasonStat_season_idx" ON "NBAPlayerSeasonStat"("season");

-- CreateIndex
CREATE INDEX "NBAPlayerSeasonStat_team_idx" ON "NBAPlayerSeasonStat"("team");

-- CreateIndex
CREATE INDEX "NBADraftPick_draftId_ownerIndex_idx" ON "NBADraftPick"("draftId", "ownerIndex");

-- CreateIndex
CREATE INDEX "NBADraftPick_draftId_slot_idx" ON "NBADraftPick"("draftId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "NBADraftPick_draftId_slot_key" ON "NBADraftPick"("draftId", "slot");

-- AddForeignKey
ALTER TABLE "NBAPlayerSeasonStat" ADD CONSTRAINT "NBAPlayerSeasonStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "NBAPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NBADraftPick" ADD CONSTRAINT "NBADraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NBADraftPick" ADD CONSTRAINT "NBADraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "NBAPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
