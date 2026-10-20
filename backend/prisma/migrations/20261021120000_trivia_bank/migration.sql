-- CreateTable
CREATE TABLE "TriviaCategory" (
    "id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clues" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaSurvey" (
    "id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "q" TEXT NOT NULL,
    "answers" TEXT[],
    "decoys" TEXT[],
    "source" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriviaCategory_pool_name_key" ON "TriviaCategory"("pool", "name");

-- CreateIndex
CREATE INDEX "TriviaCategory_pool_uses_idx" ON "TriviaCategory"("pool", "uses");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaSurvey_pool_q_key" ON "TriviaSurvey"("pool", "q");

-- CreateIndex
CREATE INDEX "TriviaSurvey_pool_uses_idx" ON "TriviaSurvey"("pool", "uses");
