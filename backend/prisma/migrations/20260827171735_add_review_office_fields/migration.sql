-- AlterTable
ALTER TABLE "JobReview" ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "officeResponse" TEXT;
