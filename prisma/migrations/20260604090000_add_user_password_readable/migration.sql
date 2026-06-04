-- Admin-viewable copy of the current password, AES-256-GCM encrypted at rest
-- (never plaintext), plus the timestamp of the last password change.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_readable" TEXT;
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3);
