-- AlterTable
ALTER TABLE "TriviaCategory" ADD COLUMN "retired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TriviaSurvey" ADD COLUMN "retired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TriviaRating" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "clue" INTEGER NOT NULL DEFAULT -1,
    "voter" TEXT NOT NULL,
    "quality" INTEGER,
    "difficulty" INTEGER,
    "wrong" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriviaRating_kind_targetId_clue_voter_key" ON "TriviaRating"("kind", "targetId", "clue", "voter");

-- CreateIndex
CREATE INDEX "TriviaRating_kind_targetId_idx" ON "TriviaRating"("kind", "targetId");
