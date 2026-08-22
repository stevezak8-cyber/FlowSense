-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "jobId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "serviceType" TEXT,
    "intervalMonths" INTEGER NOT NULL,
    "recurringJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenancePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlan_invoiceId_key" ON "MaintenancePlan"("invoiceId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_organizationId_idx" ON "MaintenancePlan"("organizationId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_customerId_idx" ON "MaintenancePlan"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlanItem_recurringJobId_key" ON "MaintenancePlanItem"("recurringJobId");

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanItem" ADD CONSTRAINT "MaintenancePlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanItem" ADD CONSTRAINT "MaintenancePlanItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanItem" ADD CONSTRAINT "MaintenancePlanItem_recurringJobId_fkey" FOREIGN KEY ("recurringJobId") REFERENCES "RecurringJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
