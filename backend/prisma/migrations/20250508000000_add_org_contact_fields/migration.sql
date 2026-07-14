-- Add contact info and notification preferences to Organization
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;
