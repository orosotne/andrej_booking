import "dotenv/config";
import { prisma } from "@/lib/db";

// Removes duplicate slot rules within a template (same appointmentType + start
// time). Such duplicates can appear if a block was added manually in the editor
// and later collides with a shifted canonical rule. They are harmless to
// already-generated days (sync inserts with skipDuplicates) but WOULD break a
// future generateDay (its createMany has no skipDuplicates → unique violation
// on [calendarDayId, startAt]).
//
// For each duplicate group the canonical DAYS_BEFORE rule is kept; the rest are
// deleted. Refuses to delete any rule still referenced by a slot.
//
// Preview:  npx tsx prisma/dedupe-slot-rules.ts
// Apply:    CONFIRM_CLEANUP=1 npx tsx prisma/dedupe-slot-rules.ts

const APPLY = process.env.CONFIRM_CLEANUP === "1";

async function main() {
  const templates = await prisma.scheduleTemplate.findMany({
    include: { slotRules: { include: { releasePolicy: true } } },
    orderBy: { dayOfWeek: "asc" },
  });

  const toDelete: string[] = [];
  for (const t of templates) {
    const groups = new Map<string, typeof t.slotRules>();
    for (const r of t.slotRules) {
      const key = `${r.appointmentType}@${r.startTime}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const [key, group] of groups) {
      if (group.length <= 1) continue;
      console.log(`\n⚠ ${t.name}: ${group.length}× ${key}`);
      const keep = group.find((r) => r.releasePolicy?.releaseType === "DAYS_BEFORE") ?? group[0];
      for (const r of group) {
        if (r.id !== keep.id) toDelete.push(r.id);
        console.log(
          `   [${r.id === keep.id ? "KEEP" : "DELETE"}] ${r.id} name="${r.name}" prio=${r.priority} policy=${r.releasePolicy?.releaseType ?? "NULL"}`,
        );
      }
    }
  }

  if (toDelete.length === 0) {
    console.log("\n✓ no duplicate rules — nothing to clean up.");
    return;
  }

  const referencing = await prisma.appointmentSlot.count({ where: { ruleId: { in: toDelete } } });
  console.log(`\nslots referencing rules-to-delete: ${referencing}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — re-run with CONFIRM_CLEANUP=1 to delete the duplicate(s).");
    return;
  }
  if (referencing > 0) {
    console.error("✗ refusing: some slots still reference a rule slated for deletion.");
    process.exit(1);
  }

  const res = await prisma.slotRule.deleteMany({ where: { id: { in: toDelete } } });
  console.log(`✓ deleted ${res.count} duplicate rule(s)`);

  for (const t of await prisma.scheduleTemplate.findMany({
    include: { slotRules: true },
    orderBy: { dayOfWeek: "asc" },
  })) {
    const firsts = t.slotRules.filter(
      (r) => r.appointmentType === "PRE_HOSPITAL" && r.startTime === "07:00",
    ).length;
    console.log(`   ${t.name}: ${t.slotRules.length} rules, PRE_HOSPITAL@07:00 = ${firsts}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
