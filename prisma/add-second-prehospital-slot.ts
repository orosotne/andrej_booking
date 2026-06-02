import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { syncTemplateToFutureDays } from "@/lib/slot-engine/sync";

// One-off, ADDITIVE correction: add a second predhospitalizačné slot at
// 07:30–08:00 to every day, mirroring the canonical 07:00–07:30 slot (same
// PRE_HOSPITAL type, same 6-days-before release policy, same colour). For each
// schedule template it clones the existing PRE_HOSPITAL@07:00 rule into a new
// 07:30 rule (skipped if one already exists), then reconciles every
// already-generated FUTURE day via syncTemplateToFutureDays so the new slot
// also appears on existing Thu/Fri (and open Wed) days.
//
// Purely additive: 07:30 is currently empty, so sync only inserts — no slot is
// ever deleted. Booked slots are never touched. Past days are untouched.
// Idempotent — safe to re-run.
//
// Preview:  npx tsx prisma/add-second-prehospital-slot.ts
// Apply:    CONFIRM_ADD_0730=1 npx tsx prisma/add-second-prehospital-slot.ts

const APPLY = process.env.CONFIRM_ADD_0730 === "1";

async function main() {
  const today = dateOnly(toIsoDate(new Date()));

  const templates = await prisma.scheduleTemplate.findMany({
    include: { slotRules: { include: { releasePolicy: true }, orderBy: { priority: "asc" } } },
    orderBy: { dayOfWeek: "asc" },
  });

  // For each template that lacks a 07:30 PRE_HOSPITAL rule, plan a clone of its
  // canonical 07:00 rule (reusing its policy/colour/duration/type verbatim).
  const planned: { t: (typeof templates)[number]; first: (typeof templates)[number]["slotRules"][number] }[] = [];
  for (const t of templates) {
    const has0730 = t.slotRules.some(
      (r) => r.appointmentType === "PRE_HOSPITAL" && r.startTime === "07:30",
    );
    if (has0730) {
      console.log(`• ${t.name} (dow ${t.dayOfWeek}): 07:30 PRE_HOSPITAL už existuje — preskakujem`);
      continue;
    }
    const first = t.slotRules.find(
      (r) => r.appointmentType === "PRE_HOSPITAL" && r.startTime === "07:00",
    );
    if (!first) {
      console.warn(`⚠ ${t.name} (dow ${t.dayOfWeek}): chýba PRE_HOSPITAL@07:00 — preskakujem`);
      continue;
    }
    planned.push({ t, first });
    console.log(
      `→ ${t.name} (dow ${t.dayOfWeek}): vytvorím 07:30–08:00 PRE_HOSPITAL ` +
        `(policy ${first.releasePolicy?.name ?? first.releasePolicyId}, prio ${first.priority + 1})`,
    );
  }

  // Read-only projection: how many future days of the affected weekdays exist
  // (each gets exactly one new 07:30 slot — that time is currently empty).
  const affectedDows = new Set(planned.map(({ t }) => t.dayOfWeek));
  let projected = 0;
  if (affectedDows.size > 0) {
    const futureDays = await prisma.calendarDay.findMany({
      where: { date: { gte: today } },
      select: { date: true },
    });
    projected = futureDays.filter((d) => affectedDows.has(d.date.getUTCDay())).length;
  }
  console.log(`\n→ nových pravidiel: ${planned.length}; budúcich dní dotknutých: ~${projected}`);

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADD_0730=1 pre pridanie 07:30–08:00.",
    );
    return;
  }

  if (planned.length > 0) {
    const res = await prisma.slotRule.createMany({
      data: planned.map(({ t, first }) => ({
        templateId: t.id,
        name: "07:30–08:00 PRE_HOSPITAL",
        startTime: "07:30",
        endTime: "08:00",
        appointmentType: first.appointmentType,
        color: first.color,
        isBookable: first.isBookable,
        slotDurationMinutes: first.slotDurationMinutes,
        releasePolicyId: first.releasePolicyId,
        priority: first.priority + 1,
      })),
    });
    console.log(`\n✓ vytvorených ${res.count} nových 07:30 pravidiel`);
  } else {
    console.log("\n• žiadne nové pravidlá netreba vytvoriť");
  }

  console.log("→ reconciliujem existujúce budúce dni (rezervácie ostávajú nedotknuté)");
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
    `\n✓ done — created ${created}, deleted ${deleted}, kept booked ${keptBooked} naprieč budúcimi dňami`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
