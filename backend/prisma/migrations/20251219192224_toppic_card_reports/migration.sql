-- CreateTable
CREATE TABLE "TopPicCardReport" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "rating" TEXT,
    "roomCode" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopPicCardReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopPicCardReport_promptId_createdAt_idx" ON "TopPicCardReport"("promptId", "createdAt");

-- AddForeignKey
ALTER TABLE "TopPicCardReport" ADD CONSTRAINT "TopPicCardReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
