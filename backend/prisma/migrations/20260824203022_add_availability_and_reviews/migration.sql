-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "availabilitySchedule" JSONB;

-- CreateTable
CREATE TABLE "BlockedDate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReview" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedDate_organizationId_idx" ON "BlockedDate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDate_organizationId_date_key" ON "BlockedDate"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JobReview_jobId_key" ON "JobReview"("jobId");

-- CreateIndex
CREATE INDEX "JobReview_organizationId_idx" ON "JobReview"("organizationId");

-- CreateIndex
CREATE INDEX "JobReview_customerId_idx" ON "JobReview"("customerId");

-- AddForeignKey
ALTER TABLE "BlockedDate" ADD CONSTRAINT "BlockedDate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReview" ADD CONSTRAINT "JobReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReview" ADD CONSTRAINT "JobReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReview" ADD CONSTRAINT "JobReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
