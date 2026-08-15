-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "reminder24hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder2hSentAt" TIMESTAMP(3);
