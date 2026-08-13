-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "recurringJobId" TEXT;

-- CreateTable
CREATE TABLE "RecurringJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "technicianId" TEXT,
    "equipmentId" TEXT,
    "equipmentType" TEXT,
    "serviceType" TEXT,
    "intervalDays" INTEGER NOT NULL,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "lastJobAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringJob_organizationId_idx" ON "RecurringJob"("organizationId");

-- CreateIndex
CREATE INDEX "RecurringJob_customerId_idx" ON "RecurringJob"("customerId");

-- CreateIndex
CREATE INDEX "RecurringJob_nextDueAt_idx" ON "RecurringJob"("nextDueAt");

-- CreateIndex
CREATE INDEX "Job_recurringJobId_idx" ON "Job"("recurringJobId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_recurringJobId_fkey" FOREIGN KEY ("recurringJobId") REFERENCES "RecurringJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringJob" ADD CONSTRAINT "RecurringJob_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
