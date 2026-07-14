-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "estimateDepositPercent" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "estimateDepositThreshold" DOUBLE PRECISION NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "PricebookItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricebookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "selectedTier" TEXT,
    "signatureData" TEXT,
    "signedAt" TIMESTAMP(3),
    "depositAmount" DOUBLE PRECISION,
    "depositPaidAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "pricebookItemId" TEXT,
    "tier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricebookItem_organizationId_idx" ON "PricebookItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_token_key" ON "Estimate"("token");

-- CreateIndex
CREATE INDEX "Estimate_jobId_idx" ON "Estimate"("jobId");

-- CreateIndex
CREATE INDEX "Estimate_organizationId_idx" ON "Estimate"("organizationId");

-- CreateIndex
CREATE INDEX "Estimate_token_idx" ON "Estimate"("token");

-- AddForeignKey
ALTER TABLE "PricebookItem" ADD CONSTRAINT "PricebookItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_pricebookItemId_fkey" FOREIGN KEY ("pricebookItemId") REFERENCES "PricebookItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
