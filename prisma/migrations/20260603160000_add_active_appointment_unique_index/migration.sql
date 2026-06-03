-- DB-level safety net against double-booking: at most one live appointment per
-- slot. CANCELLED and RESCHEDULED are excluded because those statuses release
-- the slot back for re-booking (the old row keeps its slot_id while a new
-- appointment is created on it). Every other status occupies the slot.
--
-- Postgres partial unique indexes cannot be expressed in the Prisma schema, so
-- this is a manual migration. IF NOT EXISTS makes it idempotent for databases
-- where it was already applied via prisma/add-active-appointment-unique-index.ts.
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_active_slot_uq"
  ON "appointments" ("slot_id")
  WHERE "status" NOT IN ('CANCELLED', 'RESCHEDULED');
