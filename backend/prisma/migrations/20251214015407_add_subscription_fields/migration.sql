-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isFounder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscriptionEnds" TIMESTAMP(3),
ADD COLUMN     "subscriptionTier" TEXT;
