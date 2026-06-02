import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { syncTemplateToFutureDays } from "@/lib/slot-engine/sync";

// One-off, NON-DESTRUCTIVE correction: the first free slot (predhospitalizačné)
// moves from 07:30–08:00 to 07:00–07:30, keeping its 6-days-before release
// window. Updates the saved slot rules + policy label + template metadata, then
// reconciles every already-generated future day via syncTemplateToFutureDays.
//
// Booked slots are NEVER deleted (a day with a booked 07:30 keeps it and also
// gets the new 07:00). Past days are untouched. Safe to re-run (idempotent).
//
// Preview:   npx tsx prisma/shift-first-slot.ts
// Apply:     CONFIRM_SHIFT=1 npx tsx prisma/shift-first-slot.ts

const APPLY = process.env.CONFIRM_SHIFT === "1";

async function main() {
  const today = dateOnly(toIsoDate(new Date()));

  // The first-slot rules still sitting at 07:30 (one per Wed/Thu/Fri template).
  const rules = await prisma.slotRule.findMany({
    where: { appointmentType: "PRE_HOSPITAL", startTime: "07:30" },
    include: { template: { select: { id: true, name: true, dayOfWeek: true } } },
  });

  console.log(`→ PRE_HOSPITAL rules at 07:30: ${rules.length}`);
  for (const r of rules) {
    console.log(`   • ${r.template.name} (dow ${r.template.dayOfWeek}) — rule ${r.id}`);
  }

  // Read-only projection: existing 07:30 first-slots in future days, and how
  // many of them are booked (those stay; the rest get replaced by 07:00).
  const ruleIds = rules.map((r) => r.id);
  const existingFirstSlots = ruleIds.length
    ? await prisma.appointmentSlot.findMany({
        where: { ruleId: { in: ruleIds }, calendarDay: { date: { gte: today } } },
        select: {
          id: true,
          appointments: {
            where: { status: { notIn: ["CANCELLED", "RESCHEDULED"] } },
            select: { id: true },
          },
        },
      })
    : [];
  const booked = existingFirstSlots.filter((s) => s.appointments.length > 0).length;
  console.log(
    `→ future 07:30 first-slots: ${existingFirstSlots.length} (booked ${booked}, unbooked ${
      existingFirstSlots.length - booked
    })`,
  );

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nothing written. Re-run with CONFIRM_SHIFT=1 to shift to 07:00–07:30.",
    );
    return;
  }

  console.log("\n→ updating policy label, template start, and slot rules → 07:00");
  await prisma.$transaction([
    prisma.releasePolicy.updateMany({
      where: { name: "Predhospitalizačné 7:30 (6 dní)" },
      data: { name: "Predhospitalizačné 7:00 (6 dní)" },
    }),
    prisma.scheduleTemplate.updateMany({
      where: { startTime: "07:30" },
      data: { startTime: "07:00" },
    }),
    prisma.slotRule.updateMany({
      where: { appointmentType: "PRE_HOSPITAL", startTime: "07:30" },
      data: { startTime: "07:00", endTime: "07:30", name: "07:00–07:30 PRE_HOSPITAL" },
    }),
  ]);

  console.log("→ reconciling existing future days (booked slots preserved)");
  const templates = await prisma.scheduleTemplate.findMany({ select: { id: true, name: true } });
  let created = 0;
  let deleted = 0;
  let keptBooked = 0;
  for (const t of templates) {
    const report = await syncTemplateToFutureDays(t.id, { dryRun: false });
    created += report.created;
    deleted += report.deleted;
    keptBooked += report.keptBooked;
    console.log(
      `   • ${t.name}: ${report.days} dní → +${report.created} / -${report.deleted}, ponechané ${report.keptBooked}`,
    );
  }

  console.log(
    `✓ done — created ${created}, deleted ${deleted}, kept booked ${keptBooked} across future days`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
