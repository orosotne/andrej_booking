import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate, isLastFridayOfMonth } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { computeReleaseAt, initialSlotStatus } from "@/lib/slot-engine/release-rules";
import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

// Release-window change (2026-07-02): sloty o 09:00 a 09:30 sa uzamykajú a
// otvárajú sa automaticky až 185 dní pred termínom.
//
// 09:00 aj 09:30 dnes NEMAJÚ vlastné pravidlo — sú prvé dva sloty pravidla
// „09:00–11:30 DISPENSARY", ktoré visí na ZDIEĽANEJ politike „Voľné hneď
// (14 mesiacov popredu)" (IMMEDIATE, 15 pravidiel). Tú sa NESMIE meniť.
// Preto sa v každej šablóne pravidlo rozdelí:
//   • nové pravidlo  „09:00–10:00 DISPENSARY" → nová politika DAYS_BEFORE 185
//   • pôvodné pravidlo sa zúži na „10:00–11:30 DISPENSARY" (politika ostáva)
// Sloty 10:00/10:30/11:00 sa tým NEMENIA (rovnaké časy, rovnaká politika).
//
// Už vygenerované BUDÚCE sloty o 9:00/9:30 sa potom prepočítajú presne engine
// logikou (computeReleaseAt + initialSlotStatus, vrátane last-Friday override).
// Menia sa VÝHRADNE voľné AVAILABLE/LOCKED sloty bez manuálneho zámku —
// BOOKED/COMPLETED/BLOCKED/CANCELLED, manualLock a minulé dni sa NIKDY
// nedotknú. Idempotentné — bezpečné opakovať.
//
// Preview:  npx tsx prisma/adjust-release-900-930.ts
// Apply:    CONFIRM_ADJUST_900=1 npx tsx prisma/adjust-release-900-930.ts

const APPLY = process.env.CONFIRM_ADJUST_900 === "1";

const DAYS_BEFORE = 185;
const POLICY_NAME = `Dispenzár 9:00–9:30 (${DAYS_BEFORE} dní)`;
const NEW_RULE = { name: "09:00–10:00 DISPENSARY", startTime: "09:00", endTime: "10:00" };
const SHRUNK_RULE = { name: "10:00–11:30 DISPENSARY", startTime: "10:00" };
const TIMES = ["09:00", "09:30"];

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}, hranica otvorenia: ${DAYS_BEFORE} dní`);

  // ---- 1) Cieľová politika (find-or-create, ako 07:00 vo v2) ----------------
  let policyId: string | null = null;
  const existingPolicy = await prisma.releasePolicy.findFirst({ where: { name: POLICY_NAME } });
  if (existingPolicy) {
    policyId = existingPolicy.id;
    if (existingPolicy.releaseType !== "DAYS_BEFORE" || existingPolicy.daysBefore !== DAYS_BEFORE) {
      if (APPLY) {
        await prisma.releasePolicy.update({
          where: { id: existingPolicy.id },
          data: { releaseType: "DAYS_BEFORE", daysBefore: DAYS_BEFORE },
        });
      }
      console.log(`${APPLY ? "✓" : "→"} politika „${POLICY_NAME}" opravená na DAYS_BEFORE ${DAYS_BEFORE}`);
    } else {
      console.log(`• politika „${POLICY_NAME}" už existuje`);
    }
  } else if (APPLY) {
    const created = await prisma.releasePolicy.create({
      data: { name: POLICY_NAME, releaseType: "DAYS_BEFORE", daysBefore: DAYS_BEFORE },
    });
    policyId = created.id;
    console.log(`✓ vytvorená politika „${POLICY_NAME}" (DAYS_BEFORE ${DAYS_BEFORE})`);
  } else {
    console.log(`→ vytvorila by sa politika „${POLICY_NAME}" (DAYS_BEFORE ${DAYS_BEFORE})`);
  }

  const templates = await prisma.scheduleTemplate.findMany({
    include: { slotRules: { include: { releasePolicy: true } } },
    orderBy: { dayOfWeek: "asc" },
  });

  let rulesSplit = 0;
  let toLocked = 0;
  let toAvailable = 0;
  let unchanged = 0;
  let keptBooked = 0;
  let keptBlocked = 0;
  let keptManual = 0;
  let firstLockedDate: string | null = null;

  for (const t of templates) {
    const nineRules = t.slotRules.filter(
      (r) => r.appointmentType === "DISPENSARY" && r.startTime === "09:00",
    );
    if (nineRules.length > 1) {
      console.warn(`⚠ ${t.name}: ${nineRules.length} pravidiel o 09:00 — nečakané, PRESKAKUJEM`);
      continue;
    }
    const rule = nineRules[0];
    if (!rule) {
      console.warn(`⚠ ${t.name}: chýba DISPENSARY pravidlo o 09:00 — preskakujem`);
      continue;
    }

    // ---- 2) Rozdelenie pravidla (idempotentné) ------------------------------
    let newRuleId: string | null = null;
    const slotRuleIds: string[] = [rule.id];

    if (rule.endTime === "11:30") {
      // Ešte nerozdelené. Poistka: nesmie ísť o dedikovanú politiku (čakáme zdieľanú IMMEDIATE).
      if (rule.releasePolicy?.releaseType !== "IMMEDIATE") {
        console.warn(
          `⚠ ${t.name}: 09:00 pravidlo má nečakanú politiku „${rule.releasePolicy?.name}" (${rule.releasePolicy?.releaseType}) — PRESKAKUJEM`,
        );
        continue;
      }
      rulesSplit++;
      if (APPLY) {
        const [created] = await prisma.$transaction([
          prisma.slotRule.create({
            data: {
              templateId: t.id,
              name: NEW_RULE.name,
              startTime: NEW_RULE.startTime,
              endTime: NEW_RULE.endTime,
              appointmentType: rule.appointmentType,
              color: rule.color,
              isBookable: rule.isBookable,
              slotDurationMinutes: rule.slotDurationMinutes,
              releasePolicyId: policyId,
              priority: rule.priority,
            },
          }),
          prisma.slotRule.update({
            where: { id: rule.id },
            data: { startTime: SHRUNK_RULE.startTime, name: SHRUNK_RULE.name },
          }),
        ]);
        newRuleId = created.id;
        slotRuleIds.push(created.id);
        console.log(`✓ ${t.name}: „${rule.name}" rozdelené → „${NEW_RULE.name}" (185 dní) + „${SHRUNK_RULE.name}"`);
      } else {
        console.log(`→ ${t.name}: „${rule.name}" by sa rozdelilo → „${NEW_RULE.name}" (185 dní) + „${SHRUNK_RULE.name}"`);
      }
    } else if (rule.endTime === "10:00") {
      // Už rozdelené (re-run). Zaisti správnu politiku.
      newRuleId = rule.id;
      if (policyId && rule.releasePolicyId !== policyId) {
        if (APPLY) {
          await prisma.slotRule.update({ where: { id: rule.id }, data: { releasePolicyId: policyId } });
        }
        console.log(`${APPLY ? "✓" : "→"} ${t.name}: „${rule.name}" prepojené na politiku „${POLICY_NAME}"`);
      } else {
        console.log(`• ${t.name}: „${rule.name}" už rozdelené a nastavené`);
      }
      // Sloty ešte môžu visieť na pôvodnom (zúženom) pravidle — zahrň ho do hľadania.
      const shrunk = t.slotRules.find(
        (r) => r.appointmentType === "DISPENSARY" && r.startTime === SHRUNK_RULE.startTime,
      );
      if (shrunk) slotRuleIds.push(shrunk.id);
    } else {
      console.warn(`⚠ ${t.name}: 09:00 pravidlo má nečakaný koniec ${rule.endTime} — PRESKAKUJEM`);
      continue;
    }

    // ---- 3) Prepočet už vygenerovaných BUDÚCICH slotov o 9:00/9:30 ----------
    const slots = await prisma.appointmentSlot.findMany({
      where: {
        ruleId: { in: slotRuleIds },
        calendarDay: { date: { gte: today } },
      },
      select: {
        id: true,
        status: true,
        releaseAt: true,
        manualLock: true,
        startAt: true,
        ruleId: true,
        appointmentType: true,
        calendarDay: { select: { date: true } },
      },
    });

    const nineSlots = slots.filter((s) =>
      TIMES.some((hhmm) => s.startAt.getTime() === wallClockToUtc(s.calendarDay.date, hhmm).getTime()),
    );

    const buckets = new Map<string, { ids: string[]; status: SlotStatusLit; releaseAt: Date | null }>();
    let tLocked = 0;
    let tAvail = 0;
    let tSame = 0;
    for (const s of nineSlots) {
      if (s.status === "BOOKED" || s.status === "COMPLETED") {
        keptBooked++;
        continue;
      }
      if (s.status !== "AVAILABLE" && s.status !== "LOCKED") {
        keptBlocked++;
        continue;
      }
      if (s.manualLock) {
        keptManual++;
        continue;
      }

      const date = s.calendarDay.date;
      const lastFri = isLastFridayOfMonth(date);
      const policyInput: ReleasePolicyInput = lastFri
        ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
        : { type: "DAYS_BEFORE", daysBefore: DAYS_BEFORE };
      const releaseAt = computeReleaseAt(date, policyInput, lastFri);
      const status = initialSlotStatus(s.appointmentType as AppointmentTypeLit, releaseAt, now);

      const same =
        s.status === status &&
        (s.releaseAt?.getTime() ?? null) === (releaseAt?.getTime() ?? null) &&
        (newRuleId === null || s.ruleId === newRuleId);
      if (same) {
        unchanged++;
        tSame++;
        continue;
      }
      if (status === "LOCKED") {
        toLocked++;
        tLocked++;
        const iso = toIsoDate(date);
        if (firstLockedDate === null || iso < firstLockedDate) firstLockedDate = iso;
      } else if (status === "AVAILABLE") {
        toAvailable++;
        tAvail++;
      }

      const key = `${status}|${releaseAt?.getTime() ?? "null"}`;
      const b = buckets.get(key) ?? { ids: [], status, releaseAt };
      b.ids.push(s.id);
      buckets.set(key, b);
    }

    if (APPLY && newRuleId) {
      for (const b of buckets.values()) {
        await prisma.appointmentSlot.updateMany({
          where: { id: { in: b.ids } },
          data: { status: b.status, releaseAt: b.releaseAt, ruleId: newRuleId },
        });
      }
    }
    console.log(
      `   • ${t.name}: ${nineSlots.length} budúcich 9:00/9:30 slotov → LOCKED ${tLocked}, AVAILABLE ${tAvail}, bez zmeny ${tSame}`,
    );
  }

  console.log(
    `\n→ pravidlá rozdelené: ${rulesSplit}; sloty → LOCKED: ${toLocked}, → AVAILABLE (release_at doplnený): ${toAvailable}, ` +
      `bez zmeny: ${unchanged}; NEDOTKNUTÉ: obsadené ${keptBooked}, blokované ${keptBlocked}, manuálny zámok ${keptManual}`,
  );
  if (firstLockedDate) {
    console.log(`→ prvý deň, ktorý sa uzamkne: ${firstLockedDate} (otvorí sa ${DAYS_BEFORE} dní vopred)`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADJUST_900=1 pre aplikovanie.");
    return;
  }
  console.log("\n✓ done — 09:00 a 09:30 sa odteraz otvárajú 185 dní pred termínom.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
