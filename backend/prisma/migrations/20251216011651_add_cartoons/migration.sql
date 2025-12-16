-- CreateEnum
CREATE TYPE "CartoonChannel" AS ENUM ('Disney', 'DisneyXD', 'Nickelodeon', 'CartoonNetwork', 'AdultSwim', 'Netflix', 'Other');

-- CreateEnum
CREATE TYPE "CartoonCategory" AS ENUM ('Comedy', 'Action', 'Superhero', 'Educational', 'AnimeStyle', 'SliceOfLife');

-- CreateEnum
CREATE TYPE "CartoonAgeRating" AS ENUM ('baby', 'kids', 'adult');

-- CreateEnum
CREATE TYPE "CartoonGender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "CartoonDraftEntity" AS ENUM ('SHOW', 'CHARACTER');

-- CreateTable
CREATE TABLE "CartoonShow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CartoonChannel",
    "category" "CartoonCategory" NOT NULL,
    "ageRating" "CartoonAgeRating" NOT NULL,
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER,
    "imdbRating" DOUBLE PRECISION,
    "googleRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartoonShow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartoonCharacter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "gender" "CartoonGender" NOT NULL,
    "isMainCharacter" BOOLEAN NOT NULL,
    "isSuperhero" BOOLEAN NOT NULL,
    "fitTopPicEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartoonCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartoonDraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "showId" TEXT,
    "characterId" TEXT,
    "slot" INTEGER NOT NULL,
    "ownerIndex" INTEGER NOT NULL DEFAULT 1,
    "entityType" "CartoonDraftEntity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartoonDraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartoonShow_name_key" ON "CartoonShow"("name");

-- CreateIndex
CREATE INDEX "CartoonCharacter_showId_idx" ON "CartoonCharacter"("showId");

-- CreateIndex
CREATE UNIQUE INDEX "CartoonCharacter_name_showId_key" ON "CartoonCharacter"("name", "showId");

-- CreateIndex
CREATE INDEX "CartoonDraftPick_draftId_idx" ON "CartoonDraftPick"("draftId");

-- CreateIndex
CREATE INDEX "CartoonDraftPick_showId_idx" ON "CartoonDraftPick"("showId");

-- CreateIndex
CREATE INDEX "CartoonDraftPick_characterId_idx" ON "CartoonDraftPick"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CartoonDraftPick_draftId_slot_key" ON "CartoonDraftPick"("draftId", "slot");

-- AddForeignKey
ALTER TABLE "CartoonCharacter" ADD CONSTRAINT "CartoonCharacter_showId_fkey" FOREIGN KEY ("showId") REFERENCES "CartoonShow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartoonDraftPick" ADD CONSTRAINT "CartoonDraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartoonDraftPick" ADD CONSTRAINT "CartoonDraftPick_showId_fkey" FOREIGN KEY ("showId") REFERENCES "CartoonShow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartoonDraftPick" ADD CONSTRAINT "CartoonDraftPick_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CartoonCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
