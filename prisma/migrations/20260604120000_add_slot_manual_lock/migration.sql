-- Marks slots that were locked by an explicit admin action (lockSlot), as opposed
-- to the capacity-protection slots the release-rule engine generates as LOCKED.
-- Additive, non-destructive: a new NOT NULL column with a safe default.
ALTER TABLE "appointment_slots" ADD COLUMN "manual_lock" BOOLEAN NOT NULL DEFAULT false;
