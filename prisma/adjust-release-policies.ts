import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate, isLastFridayOfMonth } from "@/lib/calendar-date";
import { computeReleaseAt, initialSlotStatus } from "@/lib/slot-engine/release-rules";
import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

// One-off release-policy correction (items 2/3 + 7 of the change batch):
//   • 07:00 PRE_HOSPITAL → voľné HNEĎ (IMMEDIATE). Previously it opened 6 days
//     before; now it stays open. (07:30 keeps the 6-days-before policy.)
//   • 15:00 ECHO → otvorí sa 20 dní pred termínom (DAYS_BEFORE 20). Previously
//     it was free immediately.
//
// For each schedule template it repoints the matching slot rule at the right
// policy, then recomputes the status + release_at of every ALREADY-GENERATED
// FUTURE slot from that rule, using the exact engine logic (so a manually-opened
// last Friday keeps its 30-days-before override). Only AVAILABLE/LOCKED slots
// are touched — BOOKED/BLOCKED/COMPLETED/CANCELLED are never modified. Past days
// are untouched. Idempotent — safe to re-run.
//
// Preview:  npx tsx prisma/adjust-release-policies.ts
// Apply:    CONFIRM_ADJUST_RELEASE=1 npx tsx prisma/adjust-release-policies.ts

const APPLY = process.env.CONFIRM_ADJUST_RELEASE === "1";

// The new BASE policy for each rule (start time → policy). The last-Friday
// override is layered on per-slot below, mirroring expandTemplateRules.
const RULES: {
  startTime: string;
  type: AppointmentTypeLit;
  base: ReleasePolicyInput;
  label: string;
}[] = [
  { startTime: "07:00", type: "PRE_HOSPITAL", base: { type: "IMMEDIATE" }, label: "07:00 voľné hneď" },
  { startTime: "15:00", type: "ECHO", base: { type: "DAYS_BEFORE", daysBefore: 20 }, label: "15:00 → 20 dní" },
];

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));

  // ---- 1) Resolve the target policies (create ECHO_20D if missing) ----------
  const immediate = await prisma.releasePolicy.findFirst({
    where: { releaseType: "IMMEDIATE" },
  });
  if (!immediate) throw new Error("Chýba IMMEDIATE policy — najprv seed/bootstrap.");

  let echo20 = await prisma.releasePolicy.findFirst({
    where: { name: "ECHO 15:00 (20 dní)" },
  });
  if (!echo20) {
    if (APPLY) {
      echo20 = await prisma.releasePolicy.create({
        data: { name: "ECHO 15:00 (20 dní)", releaseType: "DAYS_BEFORE", daysBefore: 20 },
      });
      console.log("✓ vytvorená policy „ECHO 15:00 (20 dní)“");
    } else {
      console.log("→ vytvorila by sa policy „ECHO 15:00 (20 dní)“ (DAYS_BEFORE 20)");
    }
  } else {
    console.log("• policy „ECHO 15:00 (20 dní)“ už existuje");
  }
  const policyIdFor: Record<string, string | null> = {
    "07:00": immediate.id,
    "15:00": echo20?.id ?? null, // null only in dry-run when it doesn't exist yet
  };

  // Cosmetic: the 6-days policy now applies to 07:30, not 07:00.
  const stale6d = await prisma.releasePolicy.findFirst({
    where: { name: "Predhospitalizačné 7:00 (6 dní)" },
  });
  if (stale6d) {
    if (APPLY) {
      await prisma.releasePolicy.update({
        where: { id: stale6d.id },
        data: { name: "Predhospitalizačné 7:30 (6 dní)" },
      });
      console.log("✓ premenovaná policy 7:00 → „Predhospitalizačné 7:30 (6 dní)“");
    } else {
      console.log("→ premenovala by sa „Predhospitalizačné 7:00 (6 dní)“ → „… 7:30 …“");
    }
  }

  // ---- 2) Repoint the slot rules + recompute their future slots -------------
  const templates = await prisma.scheduleTemplate.findMany({
    include: { slotRules: true },
    orderBy: { dayOfWeek: "asc" },
  });

  let rulesRepointed = 0;
  let toAvailable = 0;
  let toLocked = 0;
  let unchanged = 0;
  let keptBooked = 0;

  for (const cfg of RULES) {
    const targetPolicyId = policyIdFor[cfg.startTime];

    for (const t of templates) {
      const rule = t.slotRules.find(
        (r) => r.startTime === cfg.startTime && r.appointmentType === cfg.type,
      );
      if (!rule) {
        console.warn(`⚠ ${t.name} (dow ${t.dayOfWeek}): chýba pravidlo ${cfg.startTime} ${cfg.type} — preskakujem`);
        continue;
      }

      // 2a) repoint the rule (affects FUTURE generation)
      if (rule.releasePolicyId !== targetPolicyId) {
        if (APPLY && targetPolicyId) {
          await prisma.slotRule.update({
            where: { id: rule.id },
            data: { releasePolicyId: targetPolicyId },
          });
        }
        rulesRepointed++;
      }

      // 2b) recompute existing future slots from this rule
      const slots = await prisma.appointmentSlot.findMany({
        where: {
          ruleId: rule.id,
          status: { in: ["AVAILABLE", "LOCKED"] },
          calendarDay: { date: { gte: today } },
        },
        select: {
          id: true,
          status: true,
          releaseAt: true,
          appointmentType: true,
          calendarDay: { select: { date: true } },
        },
      });

      // Booked/blocked slots from this rule are reported but never touched.
      keptBooked += await prisma.appointmentSlot.count({
        where: {
          ruleId: rule.id,
          status: { in: ["BOOKED", "COMPLETED"] },
          calendarDay: { date: { gte: today } },
        },
      });

      // Bucket by identical target (status|releaseAt) for batched updateMany.
      const buckets = new Map<string, { ids: string[]; status: SlotStatusLit; releaseAt: Date | null }>();
      for (const s of slots) {
        const date = s.calendarDay.date;
        const lastFri = isLastFridayOfMonth(date);
        const policyInput: ReleasePolicyInput = lastFri
          ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
          : cfg.base;
        const releaseAt = computeReleaseAt(date, policyInput, lastFri);
        const status = initialSlotStatus(s.appointmentType as AppointmentTypeLit, releaseAt, now);

        const same =
          s.status === status &&
          (s.releaseAt?.getTime() ?? null) === (releaseAt?.getTime() ?? null);
        if (same) {
          unchanged++;
          continue;
        }
        if (status === "AVAILABLE") toAvailable++;
        else if (status === "LOCKED") toLocked++;

        const key = `${status}|${releaseAt?.getTime() ?? "null"}`;
        const b = buckets.get(key) ?? { ids: [], status, releaseAt };
        b.ids.push(s.id);
        buckets.set(key, b);
      }

      if (APPLY) {
        for (const b of buckets.values()) {
          await prisma.appointmentSlot.updateMany({
            where: { id: { in: b.ids } },
            data: { status: b.status, releaseAt: b.releaseAt },
          });
        }
      }

      console.log(
        `   • ${t.name} (${cfg.label}): pravidlo ${rule.id.slice(0, 8)} → ` +
          `${slots.length} budúcich slotov, ${[...buckets.values()].reduce((n, b) => n + b.ids.length, 0)} na zmenu`,
      );
    }
  }

  console.log(
    `\n→ pravidlá na prepojenie: ${rulesRepointed}; sloty → AVAILABLE: ${toAvailable}, ` +
      `→ LOCKED: ${toLocked}, bez zmeny: ${unchanged}, ponechané (booked): ${keptBooked}`,
  );

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADJUST_RELEASE=1 pre aplikovanie.",
    );
    return;
  }
  console.log("\n✓ done — release politiky 07:00/15:00 upravené naprieč budúcimi dňami.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
