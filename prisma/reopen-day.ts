import "dotenv/config";
import { prisma } from "@/lib/db";
import { reopenDay } from "@/lib/slot-engine/generate";
import { recordAudit } from "@/lib/audit/audit";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";

// Reverses a previously-closed calendar day from the command line — the same
// operation as the calendar UI's "Znovu otvoriť" button. For ops/recovery when
// a day was closed by mistake. Refuses days that are not CLOSED.
//
//   npx tsx prisma/reopen-day.ts <YYYY-MM-DD>

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error("Usage: npx tsx prisma/reopen-day.ts <YYYY-MM-DD>");
  process.exit(1);
}

function tally(slots: { status: string }[]): string {
  const counts: Record<string, number> = {};
  for (const s of slots) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return (
    Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "(no slots)"
  );
}

async function main() {
  const iso = process.argv[2];
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) fail("date must be YYYY-MM-DD");

  const before = await prisma.calendarDay.findUnique({
    where: { date: dateOnly(iso) },
    include: { slots: true },
  });
  if (!before) fail(`no calendar day on ${iso}`);
  console.log(
    `Before: ${toIsoDate(before.date)} status=${before.status} | slots: ${tally(before.slots)}`,
  );
  if (before.status !== "CLOSED") {
    fail(`day is ${before.status}, not CLOSED — nothing to reopen`);
  }

  const day = await reopenDay(iso);
  await recordAudit(prisma, {
    entityType: "calendar_day",
    entityId: day.id,
    action: "reopen",
    reason: "ops: manual reopen via CLI",
  });

  console.log(
    `After:  ${toIsoDate(day.date)} status=${day.status} | slots: ${tally(day.slots)}`,
  );
  console.log(`✓ reopened ${iso}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
