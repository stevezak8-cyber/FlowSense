-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'trial',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
