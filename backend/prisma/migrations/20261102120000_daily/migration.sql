-- CreateTable
CREATE TABLE "DailyPuzzle" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyResult" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPuzzle_game_day_key" ON "DailyPuzzle"("game", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyResult_game_day_player_key" ON "DailyResult"("game", "day", "player");

-- CreateIndex
CREATE INDEX "DailyResult_game_day_idx" ON "DailyResult"("game", "day");
