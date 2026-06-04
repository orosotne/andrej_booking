/**
 * One-time backfill: the old "Dovolenka" button (pre-vacation-admin) closed day
 * ranges via the legacy `close-range` endpoint WITHOUT creating a Vacation
 * record, so those days are invisible/unmanageable in the new admin section.
 *
 * This reconstructs each legacy range from its audit entry
 * (entityType="calendar_day_range", action="close_range", entityId="from_to"),
 * creates a proper Vacation, and stamps `closedByVacationId` on the days it
 * actually owns — so the old vacation now shows in admin and deletes/reopens
 * exactly like a new one.
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   npx tsx scripts/backfill-legacy-vacations.ts          # preview
 *   npx tsx scripts/backfill-legacy-vacations.ts --apply  # commit
 */
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { holidayName } from "@/lib/holidays-sk";

const APPLY = process.argv.includes("--apply");

function parseRange(entityId: string): { from: string; to: string } | null {
  const parts = entityId.split("_");
  if (parts.length !== 2) return null;
  const [from, to] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  return { from, to };
}

async function main() {
  const audits = await prisma.auditLog.findMany({
    where: { entityType: "calendar_day_range", action: "close_range" },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Legacy close_range audit entries: ${audits.length}`);

  // Collapse duplicate ranges (same from/to closed more than once).
  const ranges = new Map<
    string,
    { from: string; to: string; reason: string | null; actorUserId: string | null }
  >();
  for (const a of audits) {
    const r = parseRange(a.entityId);
    if (!r) {
      console.log(`  ! skipping unparseable entityId: ${a.entityId}`);
      continue;
    }
    const key = `${r.from}_${r.to}`;
    if (!ranges.has(key)) {
      ranges.set(key, {
        ...r,
        reason: a.reason ?? null,
        actorUserId: a.actorUserId ?? null,
      });
    }
  }
  console.log(`Distinct ranges: ${ranges.size}\n`);

  let createdVacations = 0;
  let stampedDays = 0;

  for (const { from, to, reason, actorUserId } of ranges.values()) {
    const gte = dateOnly(from);
    const lte = dateOnly(to);

    const existing = await prisma.vacation.findFirst({
      where: { startDate: gte, endDate: lte },
    });
    if (existing) {
      console.log(`= ${from} → ${to}: Vacation already exists (${existing.id}), skip create`);
    }

    // Days this legacy range still owns: closed, orphaned, not a holiday/manual.
    const candidateDays = await prisma.calendarDay.findMany({
      where: {
        date: { gte, lte },
        status: "CLOSED",
        closedByVacationId: null,
        dayType: { notIn: ["CLOSED", "MANUAL_WEDNESDAY"] },
      },
      select: { id: true, date: true },
      orderBy: { date: "asc" },
    });
    const ownDays = candidateDays.filter(
      (d) => holidayName(toIsoDate(d.date)) === null,
    );
    const skippedHolidays = candidateDays.length - ownDays.length;

    console.log(
      `• ${from} → ${to}  reason=${reason ?? "—"}  ` +
        `days=${ownDays.length}${skippedHolidays ? ` (skip ${skippedHolidays} sviatok)` : ""}`,
    );
    for (const d of ownDays) console.log(`    ${toIsoDate(d.date)}`);

    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      const vacation =
        existing ??
        (await tx.vacation.create({
          data: {
            startDate: gte,
            endDate: lte,
            reason,
            createdByUserId: actorUserId,
          },
        }));
      if (!existing) createdVacations += 1;

      if (ownDays.length > 0) {
        const res = await tx.calendarDay.updateMany({
          where: { id: { in: ownDays.map((d) => d.id) } },
          data: { closedByVacationId: vacation.id },
        });
        stampedDays += res.count;
      }
    });
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ` +
      `${APPLY ? createdVacations : "(would create)"} vacations, ` +
      `${APPLY ? stampedDays : "(would stamp)"} days linked.`,
  );
  if (!APPLY) console.log("Re-run with --apply to commit.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
