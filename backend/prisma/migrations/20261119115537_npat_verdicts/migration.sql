-- CreateTable
CREATE TABLE "NpatVerdict" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "niche" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpatVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpatDispute" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "typed" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "tier" TEXT,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpatDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NpatVerdict_category_letter_answer_key" ON "NpatVerdict"("category", "letter", "answer");

-- CreateIndex
CREATE INDEX "NpatDispute_category_letter_answer_idx" ON "NpatDispute"("category", "letter", "answer");
