-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "heightInches" INTEGER NOT NULL,
    "primaryTeam" TEXT,
    "primaryEraFrom" INTEGER,
    "primaryEraTo" INTEGER,
    "isHallOfFamer" BOOLEAN NOT NULL DEFAULT false,
    "totalTeams" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSeasonStat" (
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

    CONSTRAINT "PlayerSeasonStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "league" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "randomEra" BOOLEAN NOT NULL DEFAULT true,
    "eraFrom" INTEGER,
    "eraTo" INTEGER,
    "randomTeam" BOOLEAN NOT NULL DEFAULT true,
    "teamConstraint" TEXT,
    "maxPlayers" INTEGER NOT NULL DEFAULT 5,
    "requirePositions" BOOLEAN NOT NULL DEFAULT true,
    "scoringMethod" TEXT NOT NULL DEFAULT 'system',
    "rules" JSONB NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "position" TEXT NOT NULL,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerSeasonStat_playerId_idx" ON "PlayerSeasonStat"("playerId");

-- CreateIndex
CREATE INDEX "PlayerSeasonStat_season_idx" ON "PlayerSeasonStat"("season");

-- CreateIndex
CREATE INDEX "PlayerSeasonStat_team_idx" ON "PlayerSeasonStat"("team");

-- CreateIndex
CREATE INDEX "Vote_draftId_idx" ON "Vote"("draftId");

-- AddForeignKey
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
