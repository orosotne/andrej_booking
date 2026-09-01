-- Marks a slot whose appointment type ("určenie") was changed by hand through the
-- password-gated per-slot dialog, as opposed to the type the schedule template
-- assigns. Read by diffDaySlots, which skips such slots so a template re-apply
-- ("Použiť na nadchádzajúce dni") never reverts the manual change.
-- Additive, non-destructive: a new NOT NULL column with a safe default, so on
-- PostgreSQL >= 11 this is a metadata-only change that never rewrites a row.
ALTER TABLE "appointment_slots" ADD COLUMN "type_override" BOOLEAN NOT NULL DEFAULT false;
