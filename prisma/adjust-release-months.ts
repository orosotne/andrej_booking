import "dotenv/config";
import { prisma } from "@/lib/db";
import {
  dateOnly,
  isLastFridayOfMonth,
  toIsoDate,
  WEEKDAY,
} from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { computeReleaseAt, initialSlotStatus } from "@/lib/slot-engine/release-rules";
import type {
  AppointmentTypeLit,
  ReleasePolicyInput,
  SlotStatusLit,
} from "@/lib/slot-engine/types";

// Release-window change (2026-08-11): dispenzárne okná sa prestávajú počítať v
// dňoch a prechádzajú na CELÉ KALENDÁRNE MESIACE (ReleaseType MONTHS_BEFORE):
//
//   09:00 + 09:30  → presne 6 mesiacov pred termínom (predtým 180 dní)
//   11:30          → presne 6 mesiacov pred termínom (predtým 30/90 dní, viď nižšie)
//   12:00 streda   → 3 mesiace  \  (predtým 90/30 dní)
//   12:00 štvrtok  → 3 mesiace  /
//   12:00 piatok   → 1 mesiac
//
// „Presne 6 mesiacov“ = rovnaký deň v mesiaci: termín 15. 3. 2027 sa otvorí
// 15. 9. 2026. Deň sa oreže na dĺžku cieľového mesiaca (31. 8. − 6 mesiacov =
// 28./29. 2.), pozri computeReleaseAt v release-rules.ts.
//
// POZOR — v produkčnej DB sú 11:30 a 12:00 v ŠTVRTOK a PIATOK prehodené oproti
// kanonickej šablóne (DEFAULT_DAY_BLOCKS): štvrtkové/piatkové 11:30 visí na
// politike „Dispenzár 12:00 (93 dní)“ a 12:00 na „Dispenzár 11:30 (32 dní)“.
// Preto sa tu politiky priraďujú VÝHRADNE podľa dvojice (deň v týždni, čas) —
// nikdy podľa názvu politiky. Tento beh zároveň to prehodenie naprávza.
//
// Existujúce vygenerované BUDÚCE sloty sa prepočítajú presne engine logikou
// (computeReleaseAt + initialSlotStatus, vrátane last-Friday override). Menia sa
// VÝHRADNE voľné AVAILABLE/LOCKED sloty bez manuálneho zámku — obsadené
// (BOOKED/COMPLETED), blokované, zrušené, manuálne zamknuté a minulé dni sa
// NIKDY nedotknú. Idempotentné — bezpečné opakovať.
//
// Predpoklad: migrácia 20260811090000_add_release_months_before je už nasadená.
//
// Preview:  npx tsx prisma/adjust-release-months.ts
// Apply:    CONFIRM_ADJUST_MONTHS=1 npx tsx prisma/adjust-release-months.ts

const APPLY = process.env.CONFIRM_ADJUST_MONTHS === "1";

type PolicyKey = "P9" | "P1130" | "P12_WED_THU" | "P12_FRI";

interface PolicyTarget {
  name: string;
  monthsBefore: number;
  /**
   * Where to look for the policy this one replaces, so a rename converts the
   * existing row in place instead of leaving an unused one behind in the admin
   * settings list. Wednesday is the anchor because it is the only template
   * whose 11:30/12:00 policies are not swapped. null → always create fresh.
   */
  adoptFrom: { dayOfWeek: number; startTime: string; legacyNamePrefix: string } | null;
}

const POLICIES: Record<PolicyKey, PolicyTarget> = {
  P9: {
    name: "Dispenzár 9:00–9:30 (6 mesiacov)",
    monthsBefore: 6,
    adoptFrom: { dayOfWeek: WEEKDAY.WED, startTime: "09:00", legacyNamePrefix: "Dispenzár 9:00" },
  },
  P1130: {
    name: "Dispenzár 11:30 (6 mesiacov)",
    monthsBefore: 6,
    adoptFrom: { dayOfWeek: WEEKDAY.WED, startTime: "11:30", legacyNamePrefix: "Dispenzár 11:30" },
  },
  P12_WED_THU: {
    name: "Dispenzár 12:00 streda+štvrtok (3 mesiace)",
    monthsBefore: 3,
    adoptFrom: { dayOfWeek: WEEKDAY.WED, startTime: "12:00", legacyNamePrefix: "Dispenzár 12:00" },
  },
  P12_FRI: {
    name: "Dispenzár 12:00 piatok (1 mesiac)",
    monthsBefore: 1,
    adoptFrom: null,
  },
};

/** (deň v týždni, začiatok pravidla) → cieľová politika. */
const ASSIGNMENTS: { dayOfWeek: number; ruleStart: string; policy: PolicyKey }[] = [
  { dayOfWeek: WEEKDAY.WED, ruleStart: "09:00", policy: "P9" },
  { dayOfWeek: WEEKDAY.THU, ruleStart: "09:00", policy: "P9" },
  { dayOfWeek: WEEKDAY.FRI, ruleStart: "09:00", policy: "P9" },
  { dayOfWeek: WEEKDAY.WED, ruleStart: "11:30", policy: "P1130" },
  { dayOfWeek: WEEKDAY.THU, ruleStart: "11:30", policy: "P1130" },
  { dayOfWeek: WEEKDAY.FRI, ruleStart: "11:30", policy: "P1130" },
  { dayOfWeek: WEEKDAY.WED, ruleStart: "12:00", policy: "P12_WED_THU" },
  { dayOfWeek: WEEKDAY.THU, ruleStart: "12:00", policy: "P12_WED_THU" },
  { dayOfWeek: WEEKDAY.FRI, ruleStart: "12:00", policy: "P12_FRI" },
];

/** Wall-clock časy slotov, ktoré táto zmena ovplyvňuje, podľa dňa v týždni. */
const TIME_POLICY: Record<string, PolicyKey | Record<number, PolicyKey>> = {
  "09:00": "P9",
  "09:30": "P9",
  "11:30": "P1130",
  "12:00": {
    [WEEKDAY.WED]: "P12_WED_THU",
    [WEEKDAY.THU]: "P12_WED_THU",
    [WEEKDAY.FRI]: "P12_FRI",
  },
};

function policyForSlot(dayOfWeek: number, hhmm: string): PolicyKey | null {
  const entry = TIME_POLICY[hhmm];
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  return entry[dayOfWeek] ?? null;
}

const CHUNK = 500;
function chunked<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}; ` +
      `9:00/9:30 + 11:30 → 6 mes., 12:00 st+št → 3 mes., 12:00 pi → 1 mes.\n`,
  );

  // ---- 1) Cieľové politiky (find-or-create / adopt-and-rename) --------------
  const templates = await prisma.scheduleTemplate.findMany({
    where: { isActive: true },
    include: { slotRules: { include: { releasePolicy: true } } },
    orderBy: { dayOfWeek: "asc" },
  });
  const templateByDow = new Map(templates.map((t) => [t.dayOfWeek, t]));

  const policyIds = new Map<PolicyKey, string>();

  for (const [key, target] of Object.entries(POLICIES) as [PolicyKey, PolicyTarget][]) {
    const byName = await prisma.releasePolicy.findFirst({ where: { name: target.name } });
    if (byName) {
      policyIds.set(key, byName.id);
      const needsFix =
        byName.releaseType !== "MONTHS_BEFORE" ||
        byName.monthsBefore !== target.monthsBefore ||
        byName.daysBefore !== null;
      if (needsFix && APPLY) {
        await prisma.releasePolicy.update({
          where: { id: byName.id },
          data: { releaseType: "MONTHS_BEFORE", monthsBefore: target.monthsBefore, daysBefore: null },
        });
      }
      console.log(
        needsFix
          ? `${APPLY ? "✓" : "→"} politika „${target.name}“ opravená na MONTHS_BEFORE ${target.monthsBefore}`
          : `• politika „${target.name}“ už existuje a sedí`,
      );
      continue;
    }

    // Nie je podľa názvu → skús adoptovať tú, ktorú nahrádza (kotva = streda).
    const adopt = target.adoptFrom;
    const anchorRule = adopt
      ? templateByDow
          .get(adopt.dayOfWeek)
          ?.slotRules.find(
            (r) => r.startTime === adopt.startTime && r.appointmentType === "DISPENSARY",
          )
      : undefined;
    const anchorPolicy = anchorRule?.releasePolicy ?? null;

    const adoptable =
      adopt !== null &&
      anchorPolicy !== null &&
      anchorPolicy.releaseType !== "IMMEDIATE" &&
      anchorPolicy.releaseType !== "MANUAL_ONLY" &&
      anchorPolicy.name.startsWith(adopt.legacyNamePrefix);

    if (adoptable && anchorPolicy) {
      policyIds.set(key, anchorPolicy.id);
      if (APPLY) {
        await prisma.releasePolicy.update({
          where: { id: anchorPolicy.id },
          data: {
            name: target.name,
            releaseType: "MONTHS_BEFORE",
            monthsBefore: target.monthsBefore,
            daysBefore: null,
          },
        });
      }
      console.log(
        `${APPLY ? "✓" : "→"} „${anchorPolicy.name}“ (${anchorPolicy.releaseType} ${anchorPolicy.daysBefore ?? "-"}) ` +
          `→ „${target.name}“ (MONTHS_BEFORE ${target.monthsBefore})`,
      );
      continue;
    }

    if (adopt && !adoptable) {
      console.warn(
        `⚠ ${target.name}: kotva (dow ${adopt.dayOfWeek} ${adopt.startTime}) má politiku ` +
          `„${anchorPolicy?.name ?? "žiadnu"}“ — neadoptujem, vytvorím novú.`,
      );
    }
    if (APPLY) {
      const created = await prisma.releasePolicy.create({
        data: { name: target.name, releaseType: "MONTHS_BEFORE", monthsBefore: target.monthsBefore },
      });
      policyIds.set(key, created.id);
      console.log(`✓ vytvorená politika „${target.name}“ (MONTHS_BEFORE ${target.monthsBefore})`);
    } else {
      console.log(`→ vytvorila by sa politika „${target.name}“ (MONTHS_BEFORE ${target.monthsBefore})`);
    }
  }

  // ---- 2) Prepojenie pravidiel podľa (deň v týždni, čas) --------------------
  console.log("");
  let repointed = 0;
  for (const a of ASSIGNMENTS) {
    const template = templateByDow.get(a.dayOfWeek);
    if (!template) {
      console.warn(`⚠ chýba aktívna šablóna pre deň ${a.dayOfWeek} — preskakujem`);
      continue;
    }
    const rules = template.slotRules.filter(
      (r) => r.startTime === a.ruleStart && r.appointmentType === "DISPENSARY",
    );
    if (rules.length === 0) {
      console.warn(`⚠ ${template.name}: chýba DISPENSARY pravidlo o ${a.ruleStart} — preskakujem`);
      continue;
    }
    const targetId = policyIds.get(a.policy) ?? null;
    for (const rule of rules) {
      const from = rule.releasePolicy?.name ?? "—";
      if (targetId && rule.releasePolicyId === targetId) {
        console.log(`• ${template.name} ${a.ruleStart}: už na „${POLICIES[a.policy].name}“`);
        continue;
      }
      repointed++;
      if (APPLY && targetId) {
        await prisma.slotRule.update({
          where: { id: rule.id },
          data: { releasePolicyId: targetId },
        });
      }
      console.log(
        `${APPLY ? "✓" : "→"} ${template.name} ${a.ruleStart}: „${from}“ → „${POLICIES[a.policy].name}“`,
      );
    }
  }

  // ---- 3) Prepočet už vygenerovaných BUDÚCICH slotov -----------------------
  const days = await prisma.calendarDay.findMany({
    where: { date: { gte: today } },
    select: {
      date: true,
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
  // Transitions are reported separately from date-only fixes: only `closes` and
  // `opens` change what staff actually see in the calendar.
  let closes = 0;
  let opens = 0;
  let dateFixed = 0;
  let unchanged = 0;
  let keptBooked = 0;
  let keptOther = 0;
  let keptManual = 0;
  const firstClosedByTime = new Map<string, string>();

  for (const day of days) {
    const dow = day.date.getUTCDay();
    if (dow !== WEEKDAY.WED && dow !== WEEKDAY.THU && dow !== WEEKDAY.FRI) continue;
    const lastFri = isLastFridayOfMonth(day.date);
    const byStart = new Map(day.slots.map((s) => [s.startAt.getTime(), s]));

    for (const hhmm of Object.keys(TIME_POLICY)) {
      const key = policyForSlot(dow, hhmm);
      if (!key) continue;
      const slot = byStart.get(wallClockToUtc(day.date, hhmm).getTime());
      if (!slot) continue;
      if (slot.appointmentType !== "DISPENSARY") continue;

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
        : { type: "MONTHS_BEFORE", monthsBefore: POLICIES[key].monthsBefore };
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

      if (slot.status === status) {
        dateFixed++; // rovnaký stav, len iný dátum otvorenia
      } else if (status === "LOCKED") {
        closes++;
        const iso = toIsoDate(day.date);
        const prev = firstClosedByTime.get(hhmm);
        if (!prev || iso < prev) firstClosedByTime.set(hhmm, iso);
      } else if (status === "AVAILABLE") {
        opens++;
      }

      if (preview.length < 12) {
        const before = slot.releaseAt ? toIsoDate(slot.releaseAt) : "—";
        const after = releaseAt ? toIsoDate(releaseAt) : "—";
        preview.push(
          `   ${toIsoDate(day.date)} ${hhmm}  otvorenie ${before} → ${after}   ${slot.status} → ${status}`,
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

  if (APPLY) {
    for (const b of buckets.values()) {
      for (const ids of chunked(b.ids)) {
        await prisma.appointmentSlot.updateMany({
          where: { id: { in: ids } },
          data: { status: b.status, releaseAt: b.releaseAt },
        });
      }
    }
  }

  console.log(`\n→ pravidlá prepojené: ${repointed}`);
  console.log(
    `→ sloty: zatvorí sa ${closes} (zmiznú z ponuky), otvorí sa ${opens} (pribudnú), ` +
      `len oprava dátumu otvorenia ${dateFixed}, bez zmeny ${unchanged}`,
  );
  console.log(
    `→ NEDOTKNUTÉ: obsadené ${keptBooked}, blokované/zrušené ${keptOther}, manuálny zámok ${keptManual}`,
  );
  for (const [hhmm, iso] of [...firstClosedByTime].sort()) {
    console.log(`→ ${hhmm}: prvý deň, ktorý sa zatvorí, je ${iso}`);
  }

  // ---- 4) Kontrola osirených politík ---------------------------------------
  const orphans = await prisma.releasePolicy.findMany({
    where: { slotRules: { none: {} } },
    select: { id: true, name: true, releaseType: true },
  });
  if (orphans.length > 0) {
    console.log("\n⚠ politiky bez pravidiel (zobrazia sa v Nastaveniach, ale nič neriadia):");
    for (const o of orphans) console.log(`   ${o.id} „${o.name}“ (${o.releaseType})`);
  } else {
    console.log("\n✓ žiadne osirené politiky");
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_ADJUST_MONTHS=1 pre aplikovanie.");
    return;
  }
  console.log("\n✓ done — dispenzárne okná bežia na kalendárnych mesiacoch.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
