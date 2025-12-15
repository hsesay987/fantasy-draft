-- CreateTable
CREATE TABLE "NFLDraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "ownerIndex" INTEGER NOT NULL DEFAULT 1,
    "seasonUsed" INTEGER,
    "teamUsed" TEXT,

    CONSTRAINT "NFLDraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NFLDraftPick_draftId_ownerIndex_idx" ON "NFLDraftPick"("draftId", "ownerIndex");

-- CreateIndex
CREATE INDEX "NFLDraftPick_draftId_slot_idx" ON "NFLDraftPick"("draftId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "NFLDraftPick_draftId_slot_key" ON "NFLDraftPick"("draftId", "slot");

-- AddForeignKey
ALTER TABLE "NFLDraftPick" ADD CONSTRAINT "NFLDraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NFLDraftPick" ADD CONSTRAINT "NFLDraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "NFLPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
