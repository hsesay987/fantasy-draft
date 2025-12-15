-- AlterTable
ALTER TABLE "NBAPlayer" ADD COLUMN     "fitTopPicEligible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NFLPlayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "rawPosition" TEXT,
    "normalizedPos" TEXT NOT NULL,
    "positionTags" TEXT[],
    "primaryEraFrom" INTEGER,
    "primaryEraTo" INTEGER,
    "teams" TEXT[],
    "hallOfFame" BOOLEAN NOT NULL DEFAULT false,
    "proBowls" INTEGER NOT NULL DEFAULT 0,
    "allPros" INTEGER NOT NULL DEFAULT 0,
    "championships" INTEGER NOT NULL DEFAULT 0,
    "careerAV" DOUBLE PRECISION,
    "fitTopPicEligible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NFLPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NFLPlayerSeasonStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "games" INTEGER,
    "yards" INTEGER,
    "touchdowns" INTEGER,
    "receptions" INTEGER,
    "sacks" DOUBLE PRECISION,
    "interceptions" INTEGER,
    "fantasyPoints" DOUBLE PRECISION,
    "approximateValue" DOUBLE PRECISION,

    CONSTRAINT "NFLPlayerSeasonStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NFLPlayerSeasonStat_playerId_season_key" ON "NFLPlayerSeasonStat"("playerId", "season");

-- AddForeignKey
ALTER TABLE "NFLPlayerSeasonStat" ADD CONSTRAINT "NFLPlayerSeasonStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "NFLPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
