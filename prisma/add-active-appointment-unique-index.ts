import "dotenv/config";
import { prisma } from "@/lib/db";

// DB-level safety net against double-booking. The booking path already prevents
// it at the application layer (atomic conditional UPDATE on the slot), but a
// code bug or manual DB edit could still attach two live appointments to one
// slot. This partial unique index makes that impossible at the database.
//
// The predicate excludes CANCELLED and RESCHEDULED because those are exactly the
// statuses that RELEASE the slot back for re-booking: after a cancel/reschedule
// the old row stays on the same slot_id while a brand-new appointment is created
// on it, which is legitimate. Every other status (SCHEDULED / ARRIVED / NO_SHOW
// / COMPLETED) still occupies the slot, so at most one such row may exist.
//
// Postgres can't express a filtered/partial unique index via the Prisma schema,
// so this is applied as a manual migration script (gated, like the others here).
//
// Preview:  npx tsx prisma/add-active-appointment-unique-index.ts
// Apply:    CONFIRM_INDEX=1 npx tsx prisma/add-active-appointment-unique-index.ts

const APPLY = process.env.CONFIRM_INDEX === "1";
const INDEX_NAME = "appointments_active_slot_uq";

async function main() {
  // Any slot already carrying >1 live appointment would make the unique index
  // creation fail — surface those rows first with a clear message.
  const dupes = await prisma.$queryRaw<{ slot_id: string; n: bigint }[]>`
    SELECT slot_id, COUNT(*) AS n
    FROM appointments
    WHERE status NOT IN ('CANCELLED', 'RESCHEDULED')
    GROUP BY slot_id
    HAVING COUNT(*) > 1
  `;

  if (dupes.length > 0) {
    console.error(
      `✗ refusing: ${dupes.length} slot(s) already have multiple live appointments. ` +
        `Resolve these before adding the unique index:`,
    );
    for (const d of dupes) console.error(`   slot_id=${d.slot_id} → ${d.n} live appts`);
    process.exit(1);
  }

  console.log("✓ no slot has multiple live appointments — safe to add the index.");

  if (!APPLY) {
    console.log("\nDRY-RUN — re-run with CONFIRM_INDEX=1 to create the unique index.");
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}" ` +
      `ON appointments (slot_id) ` +
      `WHERE status NOT IN ('CANCELLED', 'RESCHEDULED')`,
  );
  console.log(`✓ created partial unique index "${INDEX_NAME}".`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
