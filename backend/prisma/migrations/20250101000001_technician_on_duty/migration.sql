-- Add isOnDuty field to Technician for live availability tracking
ALTER TABLE "Technician" ADD COLUMN IF NOT EXISTS "isOnDuty" BOOLEAN NOT NULL DEFAULT true;
