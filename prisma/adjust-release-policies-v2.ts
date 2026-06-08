import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate, isLastFridayOfMonth } from "@/lib/calendar-date";
import { computeReleaseAt, initialSlotStatus } from "@/lib/slot-engine/release-rules";
import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

// Release-window re-tuning (batch 2026-06-08). New target windows:
//   07:00 PRE_HOSPITAL → 5 dní pred termínom  (predtým: voľné HNEĎ / IMMEDIATE)
//   07:30 PRE_HOSPITAL → 12 dní               (už 12 — len zosúladenie názvu)
//   11:30 DISPENSARY   → 32 dní               (predtým 90)
//   12:00 DISPENSARY   → 93 dní               (predtým 21)
//   15:00 ECHO         → 13 dní               (predtým 15)
//
// 07:00 visel na ZDIEĽANEJ politike „Voľné hneď" (spolu s dispenzárom 9–11 a
// ECHO 13:30–14:40). Tú sa NESMIE meniť — preto pre 07:00 vznikne samostatná
// politika a prepoja sa naň len 07:00 pravidlá. Ostatné 4 časy už majú vlastnú
// (dedikovanú) politiku, takže sa len upraví jej daysBefore + názov.
//
// Pre každé pravidlo sa potom prepočíta status + release_at každého UŽ
// VYGENEROVANÉHO BUDÚCEHO slotu presne engine logikou (vrátane last-Friday
// override). Menia sa len AVAILABLE/LOCKED sloty — BOOKED/BLOCKED/COMPLETED/
// CANCELLED a minulé dni sa nikdy nedotknú. Idempotentné — bezpečné opakovať.
//
// Preview:  npx tsx prisma/adjust-release-policies-v2.ts
// Apply:    CONFIRM_ADJUST_RELEASE=1 npx tsx prisma/adjust-release-policies-v2.ts

const APPLY = process.env.CONFIRM_ADJUST_RELEASE === "1";

interface RuleCfg {
  startTime: string;
  type: AppointmentTypeLit;
  daysBefore: number;
  /** Desired (honest) policy name after the change. */
  policyName: string;
  /** true → 07:00: detach from the shared policy onto a fresh dedicated one. */
  fresh?: boolean;
  label: string;
}

const RULES: RuleCfg[] = [
  { startTime: "07:00", type: "PRE_HOSPITAL", daysBefore: 5, policyName: "Predhospitalizačné 7:00 (5 dní)", fresh: true, label: "07:00 → 5 dní (nová politika)" },
  { startTime: "07:30", type: "PRE_HOSPITAL", daysBefore: 12, policyName: "Predhospitalizačné 7:30 (12 dní)", label: "07:30 → 12 dní" },
  { startTime: "11:30", type: "DISPENSARY", daysBefore: 32, policyName: "Dispenzár 11:30 (32 dní)", label: "11:30 → 32 dní" },
  { startTime: "12:00", type: "DISPENSARY", daysBefore: 93, policyName: "Dispenzár 12:00 (93 dní)", label: "12:00 → 93 dní" },
  { startTime: "15:00", type: "ECHO", daysBefore: 13, policyName: "ECHO 15:00 (13 dní)", label: "15:00 → 13 dní" },
];

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));

  const templates = await prisma.scheduleTemplate.findMany({
    include: { slotRules: { include: { releasePolicy: true } } },
    orderBy: { dayOfWeek: "asc" },
  });
  const templateCount = templates.length;

  let rulesRepointed = 0;
  let policiesUpdated = 0;
  let toAvailable = 0;
  let toLocked = 0;
  let unchanged = 0;
  let keptBooked = 0;

  for (const cfg of RULES) {
    const base: ReleasePolicyInput = { type: "DAYS_BEFORE", daysBefore: cfg.daysBefore };

    // ---- 1) Resolve the target policy id ------------------------------------
    let targetPolicyId: string | null = null;

    if (cfg.fresh) {
      // 07:00: must NOT touch the shared IMMEDIATE policy. Find-or-create a
      // dedicated DAYS_BEFORE policy and repoint just the 07:00 rules onto it.
      const existing = await prisma.releasePolicy.findFirst({
        where: { name: cfg.policyName },
      });
      if (existing) {
        targetPolicyId = existing.id;
        if (existing.daysBefore !== cfg.daysBefore || existing.releaseType !== "DAYS_BEFORE") {
          if (APPLY) {
            await prisma.releasePolicy.update({
              where: { id: existing.id },
              data: { releaseType: "DAYS_BEFORE", daysBefore: cfg.daysBefore },
            });
          }
          policiesUpdated++;
        }
        console.log(`• politika „${cfg.policyName}" už existuje`);
      } else if (APPLY) {
        const created = await prisma.releasePolicy.create({
          data: { name: cfg.policyName, releaseType: "DAYS_BEFORE", daysBefore: cfg.daysBefore },
        });
        targetPolicyId = created.id;
        policiesUpdated++;
        console.log(`✓ vytvorená politika „${cfg.policyName}" (DAYS_BEFORE ${cfg.daysBefore})`);
      } else {
        console.log(`→ vytvorila by sa politika „${cfg.policyName}" (DAYS_BEFORE ${cfg.daysBefore})`);
      }
    } else {
      // Dedicated policy already attached to this rule — update in place.
      // Guard: refuse to clobber a shared policy (IMMEDIATE, or used by more
      // rules than there are templates).
      const sample = templates
        .flatMap((t) => t.slotRules)
        .find((r) => r.startTime === cfg.startTime && r.appointmentType === cfg.type);
      const pol = sample?.releasePolicy ?? null;
      if (!pol) {
        console.warn(`⚠ ${cfg.startTime} ${cfg.type}: pravidlo bez politiky — preskakujem`);
        continue;
      }
      const usedBy = await prisma.slotRule.count({ where: { releasePolicyId: pol.id } });
      if (pol.releaseType === "IMMEDIATE" || usedBy > templateCount) {
        console.warn(
          `⚠ ${cfg.startTime}: politika „${pol.name}" je zdieľaná (${usedBy} pravidiel / ${pol.releaseType}) — PRESKAKUJEM, aby som ju nerozbil. Použi fresh:true.`,
        );
        continue;
      }
      targetPolicyId = pol.id;
      const needsValue = pol.daysBefore !== cfg.daysBefore;
      const needsName = pol.name !== cfg.policyName;
      if (needsValue || needsName) {
        if (APPLY) {
          await prisma.releasePolicy.update({
            where: { id: pol.id },
            data: { daysBefore: cfg.daysBefore, name: cfg.policyName },
          });
        }
        policiesUpdated++;
        console.log(
          `${APPLY ? "✓" : "→"} politika „${pol.name}" (${pol.daysBefore} dní) → „${cfg.policyName}" (${cfg.daysBefore} dní)`,
        );
      } else {
        console.log(`• politika „${pol.name}" už sedí (${cfg.daysBefore} dní)`);
      }
    }

    // ---- 2) Repoint rules + recompute their future slots --------------------
    let cfgAvail = 0;
    let cfgLocked = 0;
    let cfgSame = 0;
    for (const t of templates) {
      const rule = t.slotRules.find(
        (r) => r.startTime === cfg.startTime && r.appointmentType === cfg.type,
      );
      if (!rule) {
        console.warn(`⚠ ${t.name} (dow ${t.dayOfWeek}): chýba pravidlo ${cfg.startTime} ${cfg.type} — preskakujem`);
        continue;
      }

      // 2a) repoint (only the fresh 07:00 case actually changes the pointer)
      if (targetPolicyId && rule.releasePolicyId !== targetPolicyId) {
        if (APPLY) {
          await prisma.slotRule.update({
            where: { id: rule.id },
            data: { releasePolicyId: targetPolicyId },
          });
        }
        rulesRepointed++;
      }

      // 2b) recompute existing FUTURE AVAILABLE/LOCKED slots from this rule
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

      keptBooked += await prisma.appointmentSlot.count({
        where: {
          ruleId: rule.id,
          status: { in: ["BOOKED", "COMPLETED"] },
          calendarDay: { date: { gte: today } },
        },
      });

      const buckets = new Map<string, { ids: string[]; status: SlotStatusLit; releaseAt: Date | null }>();
      for (const s of slots) {
        const date = s.calendarDay.date;
        const lastFri = isLastFridayOfMonth(date);
        const policyInput: ReleasePolicyInput = lastFri
          ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
          : base;
        const releaseAt = computeReleaseAt(date, policyInput, lastFri);
        const status = initialSlotStatus(s.appointmentType as AppointmentTypeLit, releaseAt, now);

        const same =
          s.status === status &&
          (s.releaseAt?.getTime() ?? null) === (releaseAt?.getTime() ?? null);
        if (same) {
          unchanged++;
          cfgSame++;
          continue;
        }
        if (status === "AVAILABLE") {
          toAvailable++;
          cfgAvail++;
        } else if (status === "LOCKED") {
          toLocked++;
          cfgLocked++;
        }

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

      const toChange = [...buckets.values()].reduce((n, b) => n + b.ids.length, 0);
      console.log(
        `   • ${t.name} (${cfg.label}): pravidlo ${rule.id.slice(0, 8)} → ${slots.length} budúcich slotov, ${toChange} na zmenu`,
      );
    }
    console.log(
      `   = SPOLU ${cfg.startTime}: → AVAILABLE ${cfgAvail}, → LOCKED ${cfgLocked}, bez zmeny ${cfgSame}`,
    );
  }

  console.log(
    `\n→ politiky upravené/vytvorené: ${policiesUpdated}; pravidlá prepojené: ${rulesRepointed}; ` +
      `sloty → AVAILABLE: ${toAvailable}, → LOCKED: ${toLocked}, bez zmeny: ${unchanged}, ponechané (booked): ${keptBooked}`,
  );

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADJUST_RELEASE=1 pre aplikovanie.");
    return;
  }
  console.log("\n✓ done — release okná 07:00/07:30/11:30/12:00/15:00 upravené naprieč budúcimi dňami.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
