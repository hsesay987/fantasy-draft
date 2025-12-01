/*
  Warnings:

  - A unique constraint covering the columns `[draftId,slot]` on the table `DraftPick` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_slot_key" ON "DraftPick"("draftId", "slot");
