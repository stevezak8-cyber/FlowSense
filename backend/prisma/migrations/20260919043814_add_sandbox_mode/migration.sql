-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "sandboxEndedAt" TIMESTAMP(3),
ADD COLUMN     "sandboxMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Technician" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;
