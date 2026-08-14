import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate, isLastFridayOfMonth } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { computeReleaseAt, initialSlotStatus } from "@/lib/slot-engine/release-rules";
import { isManuallyOpenedDay } from "@/lib/slot-engine/reconcile";
import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

// Release-window change (2026-08-14): predhospitalizačné sloty sa otvárajú
// v týždňoch namiesto pár dní:
//
//   07:00 PRE_HOSPITAL → 14 dní (2 týždne) pred termínom   (predtým 5 dní)
//   07:30 PRE_HOSPITAL → 21 dní (3 týždne) pred termínom   (predtým 12 dní)
//
// Obe časy už majú vlastnú (dedikovanú) DAYS_BEFORE politiku z behu
// adjust-release-policies-v2.ts — tá sa upraví na mieste (hodnota + poctivý
// názov). Zdieľané politiky (IMMEDIATE a pod.) sa NIKDY nemenia — poistka
// preskočí čokoľvek zavesené na viac pravidlách, než je šablón.
//
// Už vygenerované BUDÚCE sloty o 7:00/7:30 sa prepočítajú presne engine
// logikou (computeReleaseAt + initialSlotStatus). Rešpektujú sa oba overridy
// z expandTemplateRules:
//   • deň otvorený heslom (streda / posledný piatok, isManuallyOpenedDay) nemá
//     žiadne release okno — jeho sloty sa NEDOTÝKAJÚ,
//   • neotvorený posledný piatok drží last-Friday politiku (30 dní).
// Menia sa VÝHRADNE voľné AVAILABLE/LOCKED sloty bez manuálneho zámku —
// obsadené (BOOKED/COMPLETED), blokované, zrušené, manuálne zamknuté a minulé
// dni sa NIKDY nedotknú. Keďže sa okná len PREDLŽUJÚ, zmena sloty iba otvára
// (LOCKED → AVAILABLE) alebo im posúva dátum otvorenia — nič sa nezamyká.
// Idempotentné — bezpečné opakovať.
//
// Preview:  npx tsx prisma/adjust-release-prehospital-weeks.ts
// Apply:    CONFIRM_ADJUST_PREHOSP=1 npx tsx prisma/adjust-release-prehospital-weeks.ts

const APPLY = process.env.CONFIRM_ADJUST_PREHOSP === "1";

interface Target {
  startTime: string;
  daysBefore: number;
  policyName: string;
  /** Name prefix of the policy this one replaces (rename-in-place anchor). */
  legacyPrefix: string;
}

const TARGETS: Target[] = [
  {
    startTime: "07:00",
    daysBefore: 14,
    policyName: "Predhospitalizačné 7:00 (14 dní)",
    legacyPrefix: "Predhospitalizačné 7:00",
  },
  {
    startTime: "07:30",
    daysBefore: 21,
    policyName: "Predhospitalizačné 7:30 (21 dní)",
    legacyPrefix: "Predhospitalizačné 7:30",
  },
];

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}; 07:00 → 14 dní, 07:30 → 21 dní\n`,
  );

  const templates = await prisma.scheduleTemplate.findMany({
    where: { isActive: true },
    include: { slotRules: { include: { releasePolicy: true } } },
    orderBy: { dayOfWeek: "asc" },
  });
  const templateCount = templates.length;

  // ---- 1) Politiky: update-in-place cez kotvu, s poistkou na zdieľanie ------
  const policyIdByTime = new Map<string, string>();

  for (const t of TARGETS) {
    const byName = await prisma.releasePolicy.findFirst({
      where: { name: t.policyName },
    });
    if (byName) {
      policyIdByTime.set(t.startTime, byName.id);
      const needsFix =
        byName.releaseType !== "DAYS_BEFORE" || byName.daysBefore !== t.daysBefore;
      if (needsFix && APPLY) {
        await prisma.releasePolicy.update({
          where: { id: byName.id },
          data: { releaseType: "DAYS_BEFORE", daysBefore: t.daysBefore },
        });
      }
      console.log(
        needsFix
          ? `${APPLY ? "✓" : "→"} politika „${t.policyName}" opravená na DAYS_BEFORE ${t.daysBefore}`
          : `• politika „${t.policyName}" už existuje a sedí`,
      );
      continue;
    }

    const anchorRule = templates
      .flatMap((tpl) => tpl.slotRules)
      .find((r) => r.startTime === t.startTime && r.appointmentType === "PRE_HOSPITAL");
    const pol = anchorRule?.releasePolicy ?? null;
    if (!pol) {
      console.warn(`⚠ ${t.startTime}: pravidlo bez politiky — PRESKAKUJEM`);
      continue;
    }
    const usedBy = await prisma.slotRule.count({ where: { releasePolicyId: pol.id } });
    const adoptable =
      pol.releaseType === "DAYS_BEFORE" &&
      usedBy <= templateCount &&
      pol.name.startsWith(t.legacyPrefix);
    if (!adoptable) {
      console.warn(
        `⚠ ${t.startTime}: politika „${pol.name}" (${pol.releaseType}, ${usedBy} pravidiel) ` +
          `nie je dedikovaná DAYS_BEFORE s prefixom „${t.legacyPrefix}" — PRESKAKUJEM, aby som nič nerozbil.`,
      );
      continue;
    }
    policyIdByTime.set(t.startTime, pol.id);
    if (APPLY) {
      await prisma.releasePolicy.update({
        where: { id: pol.id },
        data: { name: t.policyName, releaseType: "DAYS_BEFORE", daysBefore: t.daysBefore },
      });
    }
    console.log(
      `${APPLY ? "✓" : "→"} „${pol.name}" (${pol.daysBefore} dní) → „${t.policyName}" (${t.daysBefore} dní)`,
    );
  }

  // ---- 2) Poistka: všetky 7:00/7:30 pravidlá visia na správnej politike -----
  let repointed = 0;
  for (const tpl of templates) {
    for (const t of TARGETS) {
      const targetId = policyIdByTime.get(t.startTime);
      if (!targetId) continue;
      const rules = tpl.slotRules.filter(
        (r) => r.startTime === t.startTime && r.appointmentType === "PRE_HOSPITAL",
      );
      if (rules.length === 0) {
        console.warn(`⚠ ${tpl.name}: chýba PRE_HOSPITAL pravidlo o ${t.startTime}`);
        continue;
      }
      for (const rule of rules) {
        if (rule.releasePolicyId === targetId) continue;
        repointed++;
        if (APPLY) {
          await prisma.slotRule.update({
            where: { id: rule.id },
            data: { releasePolicyId: targetId },
          });
        }
        console.log(
          `${APPLY ? "✓" : "→"} ${tpl.name} ${t.startTime}: „${rule.releasePolicy?.name ?? "—"}" → „${t.policyName}"`,
        );
      }
    }
  }
  if (repointed === 0) console.log("• všetky 7:00/7:30 pravidlá už visia na správnych politikách");

  // ---- 3) Prepočet už vygenerovaných BUDÚCICH slotov ------------------------
  const days = await prisma.calendarDay.findMany({
    where: { date: { gte: today } },
    select: {
      date: true,
      dayType: true,
      openedByUserId: true,
      slots: {
        select: {
          id: true,
          startAt: true,
          status: true,
          releaseAt: true,
          manualLock: true,
          appointmentType: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const buckets = new Map<string, { ids: string[]; status: SlotStatusLit; releaseAt: Date | null }>();
  const preview: string[] = [];
  let opens = 0;
  let closes = 0;
  let dateFixed = 0;
  let unchanged = 0;
  let keptBooked = 0;
  let keptOther = 0;
  let keptManual = 0;
  let keptOpenDay = 0;

  for (const day of days) {
    // Deň otvorený heslom nemá release okná — jeho sloty nechávame tak.
    const manuallyOpened = isManuallyOpenedDay(day);
    const lastFri = isLastFridayOfMonth(day.date);
    const byStart = new Map(day.slots.map((s) => [s.startAt.getTime(), s]));

    for (const t of TARGETS) {
      const slot = byStart.get(wallClockToUtc(day.date, t.startTime).getTime());
      if (!slot) continue;
      if (slot.appointmentType !== "PRE_HOSPITAL") continue;

      if (manuallyOpened) {
        keptOpenDay++;
        continue;
      }
      if (slot.status === "BOOKED" || slot.status === "COMPLETED") {
        keptBooked++;
        continue;
      }
      if (slot.status !== "AVAILABLE" && slot.status !== "LOCKED") {
        keptOther++; // BLOCKED (sviatok / dovolenka / zatvorený deň) alebo CANCELLED
        continue;
      }
      if (slot.manualLock) {
        keptManual++;
        continue;
      }

      // Presne to, čo urobí expandTemplateRules pri re-apply šablóny.
      const policyInput: ReleasePolicyInput = lastFri
        ? { type: "LAST_FRIDAY_30_DAYS_BEFORE" }
        : { type: "DAYS_BEFORE", daysBefore: t.daysBefore };
      const releaseAt = computeReleaseAt(day.date, policyInput, lastFri);
      const status = initialSlotStatus(
        slot.appointmentType as AppointmentTypeLit,
        releaseAt,
        now,
      );

      if (
        slot.status === status &&
        (slot.releaseAt?.getTime() ?? null) === (releaseAt?.getTime() ?? null)
      ) {
        unchanged++;
        continue;
      }

      if (slot.status === status) dateFixed++;
      else if (status === "AVAILABLE") opens++;
      else closes++; // nečakané pri predlžovaní okna — len poctivý counter

      if (preview.length < 12) {
        const before = slot.releaseAt ? toIsoDate(slot.releaseAt) : "—";
        const after = releaseAt ? toIsoDate(releaseAt) : "—";
        preview.push(
          `   ${toIsoDate(day.date)} ${t.startTime}  otvorenie ${before} → ${after}   ${slot.status} → ${status}`,
        );
      }

      const bk = `${status}|${releaseAt?.getTime() ?? "null"}`;
      const b = buckets.get(bk) ?? { ids: [], status, releaseAt };
      b.ids.push(slot.id);
      buckets.set(bk, b);
    }
  }

  if (preview.length > 0) {
    console.log("\nUkážka prvých zmien:");
    for (const line of preview) console.log(line);
  }

  const toChange = [...buckets.values()].reduce((n, b) => n + b.ids.length, 0);
  console.log(
    `\n→ sloty na zmenu: ${toChange} (otvorí sa: ${opens}, zamkne sa: ${closes}, len posun dátumu: ${dateFixed}); ` +
      `bez zmeny: ${unchanged}` +
      `\n→ NEDOTKNUTÉ — obsadené: ${keptBooked}, blokované/zrušené: ${keptOther}, ` +
      `manuálny zámok: ${keptManual}, dni otvorené heslom: ${keptOpenDay}`,
  );

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADJUST_PREHOSP=1 pre aplikovanie.");
    return;
  }

  // Status guard vo where: keby si medzi načítaním a zápisom niekto stihol slot
  // objednať alebo zamknúť, zápis ho preskočí namiesto prepísania.
  let written = 0;
  for (const b of buckets.values()) {
    const r = await prisma.appointmentSlot.updateMany({
      where: {
        id: { in: b.ids },
        status: { in: ["AVAILABLE", "LOCKED"] },
        manualLock: false,
      },
      data: { status: b.status, releaseAt: b.releaseAt },
    });
    written += r.count;
  }
  console.log(
    `\n✓ done — ${written} slotov upravených. 07:00 sa odteraz otvára 14 dní a 07:30 21 dní pred termínom.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
