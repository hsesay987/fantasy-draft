/*
  Warnings:

  - A unique constraint covering the columns `[playerId,season]` on the table `NBAPlayerSeasonStat` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "NBAPlayerSeasonStat_playerId_season_idx";

-- CreateIndex
CREATE UNIQUE INDEX "NBAPlayerSeasonStat_playerId_season_key" ON "NBAPlayerSeasonStat"("playerId", "season");
