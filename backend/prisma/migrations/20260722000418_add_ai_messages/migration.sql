-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiMessage_jobId_idx" ON "AiMessage"("jobId");

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
