-- Release windows expressed in whole calendar months instead of a day count, so
-- "opens exactly 6 months before the appointment" lands on the same day-of-month
-- (15 Mar → 15 Sep) instead of drifting with month lengths.
--
-- Additive and non-destructive: a new enum value plus a new nullable column.
-- No existing row changes; DAYS_BEFORE policies keep working untouched.
-- The new enum value is only ADDED here, never used in this same transaction
-- (Postgres forbids that), so the data migration runs as a separate script.

-- AlterEnum
ALTER TYPE "ReleaseType" ADD VALUE 'MONTHS_BEFORE';

-- AlterTable
ALTER TABLE "release_policies" ADD COLUMN "months_before" INTEGER;
