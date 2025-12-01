-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "participants" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "playersPerTeam" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "DraftPick" ADD COLUMN     "ownerIndex" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "DraftPick_draftId_ownerIndex_idx" ON "DraftPick"("draftId", "ownerIndex");

-- CreateIndex
CREATE INDEX "DraftPick_draftId_slot_idx" ON "DraftPick"("draftId", "slot");
