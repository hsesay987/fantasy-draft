-- CreateTable
CREATE TABLE "DraftStyle" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "settings" JSONB NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "thumbsUp" INTEGER NOT NULL DEFAULT 0,
    "thumbsDown" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "draftId" TEXT,

    CONSTRAINT "DraftStyle_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DraftStyle" ADD CONSTRAINT "DraftStyle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftStyle" ADD CONSTRAINT "DraftStyle_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
