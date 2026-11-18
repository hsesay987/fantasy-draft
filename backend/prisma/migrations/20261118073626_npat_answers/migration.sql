-- CreateTable
CREATE TABLE "NpatAnswer" (
    "category" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpatAnswer_pkey" PRIMARY KEY ("category","answer")
);
