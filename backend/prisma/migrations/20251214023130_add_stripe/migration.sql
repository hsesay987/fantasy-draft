/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "CommunityAd" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "targetUrl" TEXT NOT NULL,
    "category" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'rail',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedById" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityAd_status_placement_startsAt_endsAt_idx" ON "CommunityAd"("status", "placement", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "CommunityAd" ADD CONSTRAINT "CommunityAd_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
