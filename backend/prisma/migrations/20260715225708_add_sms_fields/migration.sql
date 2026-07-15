-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "smsOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "smsEnabled" BOOLEAN NOT NULL DEFAULT false;
