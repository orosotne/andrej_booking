import "dotenv/config";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  SCHEDULE_2028_FROM,
  WEEKDAY,
  dateOnly,
  toIsoDate,
} from "@/lib/calendar-date";
import { clinicTime } from "@/lib/format";
import {
  expandTemplateRules,
  isManuallyOpenedDay,
  type RuleForExpansion,
} from "@/lib/slot-engine/reconcile";
import {
  POLICY_DEFS,
  TEMPLATE_VERSIONS,
  rulesFromBlocks,
  type BlockDef,
  type PolicyKey,
} from "@/lib/slot-engine/template";
import type { AppointmentTypeLit, SlotStatusLit } from "@/lib/slot-engine/types";

// Zmena rozvrhu (2026-10-16):
//
//   1) Do konca 2027 sa dispenzár 9:00, 9:30 a 11:30 (štvrtok, piatok) otvára
//      7 mesiacov pred termínom namiesto 6. Politiky sa upravia na mieste
//      (hľadajú sa podľa dvojice deň + čas pravidla, nikdy podľa názvu) a voľné
//      budúce sloty sa prepočítajú — časť z nich sa tým otvorí hneď.
//   2) Streda: celý deň dispenzár po 30 min (7:00–14:30), voľný hneď; zamknutá
//      len porada 8:00/8:30 a ECHO oddelenie 12:30/13:00.
//   3) Od 1. 1. 2028 má štvrtok a piatok novú verziu šablóny (validFrom) s
//      vlastnými politikami „2028 · …“; doterajšie verzie dostanú validTo
//      31. 12. 2027. Už vytvorené dni roku 2028 sa prepočítajú podľa novej verzie.
//
// Definície (rozloženie, názvy a hodnoty politík) sú v src/lib/slot-engine/
// template.ts (TEMPLATE_VERSIONS, POLICY_DEFS) — rovnaké, z akých stavia seed.
//
// Sloty: mení sa VÝHRADNE voľný slot (AVAILABLE/LOCKED, bez objednávky, bez
// ručného zámku, bez ručného preurčenia). Na ZATVORENOM dni (dovolenka, sviatok)
// ostáva BLOCKED a upraví sa len jeho uložený čas otvorenia, aby po
// znovuotvorení dňa platilo nové okno. Obsadené, ručne zamknuté a minulé dni sa
// nikdy nedotknú. Všetky zápisy idú v jednej transakcii. Idempotentné.
//
// ⚠ PORADIE: spúšťať až PO nasadení kódu, ktorý vyberá šablónu podľa dátumu
// (pickTemplate). Starý kód by pri dvoch štvrtkových šablónach vzal náhodnú.
//
// Preview:  npx tsx prisma/update-schedule-2028.ts
// Apply:    CONFIRM_SCHEDULE_2028=1 npx tsx prisma/update-schedule-2028.ts

const APPLY = process.env.CONFIRM_SCHEDULE_2028 === "1";

const UNTIL_2027 = dateOnly("2027-12-31");
const FROM_2028 = dateOnly(SCHEDULE_2028_FROM);

/** Pravidlá štvrtka a piatka do 2027, ktorých politika prechádza na 7 mesiacov. */
const SEVEN_MONTH_RULES: readonly [string, PolicyKey][] = [
  ["09:00", "DISPENSARY_9_7M"], // pravidlo 9:00–10:00 → sloty 9:00 a 9:30
  ["11:30", "DISPENSARY_1130_7M"],
];
const SEVEN_MONTH_TIMES = ["09:00", "09:30", "11:30"];

const CHUNK = 500;
function chunked<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

type Op = (tx: Prisma.TransactionClient) => Promise<unknown>;

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}\n`);

  const templates = await prisma.scheduleTemplate.findMany({
    include: {
      slotRules: { include: { releasePolicy: true }, orderBy: { priority: "asc" } },
    },
    orderBy: { dayOfWeek: "asc" },
  });
  type TemplateRow = (typeof templates)[number];
  type RuleRow = TemplateRow["slotRules"][number];
  const policies = await prisma.releasePolicy.findMany();

  /** Doterajšia (pred-2028) aktívna šablóna dňa — musí byť práve jedna. */
  const current = (dow: number): TemplateRow => {
    const list = templates.filter(
      (t) => t.dayOfWeek === dow && t.isActive && t.validFrom === null,
    );
    if (list.length !== 1) {
      throw new Error(
        `Očakávam práve 1 aktívnu šablónu bez validFrom pre deň ${dow}, je ich ${list.length}.`,
      );
    }
    return list[0];
  };
  const findRule = (t: TemplateRow, start: string, type: AppointmentTypeLit): RuleRow => {
    const rule = t.slotRules.find((r) => r.startTime === start && r.appointmentType === type);
    if (!rule?.releasePolicy) {
      throw new Error(`${t.name}: chýba ${type} pravidlo s politikou o ${start}.`);
    }
    return rule;
  };

  const wed = current(WEEKDAY.WED);
  const thu = current(WEEKDAY.THU);
  const fri = current(WEEKDAY.FRI);

  const ops: Op[] = [];
  /** PolicyKey → id politiky v DB; nové politiky sa doplnia až počas zápisu. */
  const policyIds = new Map<PolicyKey, string>();
  const policyId = (key: PolicyKey): string => {
    const id = policyIds.get(key);
    if (!id) throw new Error(`Politika ${key} nemá id.`);
    return id;
  };
  const rulesData = (templateId: string, blocks: BlockDef[]) =>
    blocks.map((block, i) => ({
      templateId,
      name: `${block.start}–${block.end} ${block.type}`,
      startTime: block.start,
      endTime: block.end,
      appointmentType: block.type,
      color: block.colorKey,
      isBookable: block.bookable,
      slotDurationMinutes: block.slotDurationMinutes ?? 30,
      releasePolicyId: policyId(block.policyKey),
      priority: i,
    }));

  // ---- 1) Dispenzár 9:00/9:30 a 11:30 do konca 2027: 6 → 7 mesiacov ---------
  console.log("1) Dispenzár 9:00, 9:30 a 11:30 (štvrtok, piatok do 31. 12. 2027): 7 mesiacov");
  const sevenMonthPolicyIds = new Set<string>();
  for (const [ruleStart, key] of SEVEN_MONTH_RULES) {
    const found = [thu, fri].map((t) => findRule(t, ruleStart, "DISPENSARY").releasePolicy!);
    const policy = found[0];
    if (found.some((p) => p.id !== policy.id)) {
      throw new Error(`Štvrtok a piatok o ${ruleStart} majú rôzne politiky — skontroluj ručne.`);
    }
    if (policy.releaseType !== "MONTHS_BEFORE" || ![6, 7].includes(policy.monthsBefore ?? -1)) {
      throw new Error(
        `Politika „${policy.name}“ je ${policy.releaseType} ${policy.monthsBefore ?? policy.daysBefore} — čakal som 6 mesiacov.`,
      );
    }
    sevenMonthPolicyIds.add(policy.id);
    const target = POLICY_DEFS[key];
    if (policy.monthsBefore === 7 && policy.name === target.name) {
      console.log(`   • „${policy.name}“ už je 7 mesiacov`);
      continue;
    }
    console.log(`   → „${policy.name}“ (${policy.monthsBefore} mes.) → „${target.name}“ (7 mes.)`);
    ops.push((tx) =>
      tx.releasePolicy.update({
        where: { id: policy.id },
        data: { name: target.name, monthsBefore: 7, daysBefore: null },
      }),
    );
  }
  // Streda politiku 12:00 po zmene nepoužíva — názov „streda+štvrtok“ by klamal.
  const thu12 = findRule(thu, "12:00", "DISPENSARY").releasePolicy!;
  if (thu12.name !== POLICY_DEFS.DISPENSARY_12_3M.name) {
    console.log(`   → premenovanie „${thu12.name}“ → „${POLICY_DEFS.DISPENSARY_12_3M.name}“ (hodnota ostáva)`);
    ops.push((tx) =>
      tx.releasePolicy.update({
        where: { id: thu12.id },
        data: { name: POLICY_DEFS.DISPENSARY_12_3M.name },
      }),
    );
  }

  // ---- 2) Politiky: zdieľané (podľa štvrtka) + nové „2028 · …“ ---------------
  console.log("\n2) Politiky pre stredu a rozvrh 2028");
  const immediate = findRule(thu, "10:00", "DISPENSARY").releasePolicy!;
  const blocked = findRule(thu, "08:00", "CONSULTATION_BLOCKED").releasePolicy!;
  if (immediate.releaseType !== "IMMEDIATE" || blocked.releaseType !== "MANUAL_ONLY") {
    throw new Error("Štvrtok 10:00 nie je IMMEDIATE alebo 8:00 nie je MANUAL_ONLY — skontroluj ručne.");
  }
  policyIds.set("IMMEDIATE", immediate.id);
  policyIds.set("BLOCKED", blocked.id);
  console.log(`   • zdieľané: „${immediate.name}“, „${blocked.name}“`);

  const versions2028 = TEMPLATE_VERSIONS.filter((v) => v.validFrom === SCHEDULE_2028_FROM);
  const keys2028 = [
    ...new Set(versions2028.flatMap((v) => v.blocks.map((b) => b.policyKey))),
  ].filter((k) => k !== "IMMEDIATE" && k !== "BLOCKED");
  for (const key of keys2028) {
    const def = POLICY_DEFS[key];
    const existing = policies.find((p) => p.name === def.name);
    if (existing) {
      policyIds.set(key, existing.id);
      console.log(`   • „${def.name}“ už existuje`);
      continue;
    }
    const amount = def.monthsBefore ? `${def.monthsBefore} mes.` : `${def.daysBefore} dní`;
    console.log(`   → vytvorí sa „${def.name}“ (${def.releaseType} ${amount})`);
    ops.push(async (tx) => {
      const created = await tx.releasePolicy.create({
        data: {
          name: def.name,
          releaseType: def.releaseType,
          daysBefore: def.daysBefore ?? null,
          monthsBefore: def.monthsBefore ?? null,
        },
      });
      policyIds.set(key, created.id);
    });
  }

  // ---- 3) Streda: nové rozloženie --------------------------------------------
  console.log("\n3) Šablóna stredy");
  const wedVersion = TEMPLATE_VERSIONS.find((v) => v.dayOfWeek === WEEKDAY.WED);
  if (!wedVersion) throw new Error("TEMPLATE_VERSIONS nemá stredu.");
  const wedRules = [...wed.slotRules].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const wedDone =
    wedRules.length === wedVersion.blocks.length &&
    wedVersion.blocks.every((b, i) => {
      const r = wedRules[i];
      return (
        r.startTime === b.start &&
        r.endTime === b.end &&
        r.appointmentType === b.type &&
        r.color === b.colorKey &&
        r.slotDurationMinutes === (b.slotDurationMinutes ?? 30) &&
        r.releasePolicyId === policyIds.get(b.policyKey)
      );
    });
  if (wedDone) {
    console.log("   • streda už má nové rozloženie");
  } else {
    console.log(
      `   → ${wed.slotRules.length} pravidiel sa nahradí ${wedVersion.blocks.length} novými: ` +
        wedVersion.blocks.map((b) => `${b.start}–${b.end} ${b.type}`).join(", "),
    );
    ops.push(async (tx) => {
      await tx.slotRule.deleteMany({ where: { templateId: wed.id } });
      await tx.slotRule.createMany({ data: rulesData(wed.id, wedVersion.blocks) });
      await tx.scheduleTemplate.update({
        where: { id: wed.id },
        data: {
          startTime: wedVersion.blocks[0].start,
          endTime: wedVersion.blocks[wedVersion.blocks.length - 1].end,
        },
      });
    });
  }

  // ---- 4) Štvrtok/piatok: platnosť do 2027 + nové verzie od 2028 -------------
  console.log("\n4) Verzie šablón štvrtka a piatka");
  for (const t of [thu, fri]) {
    if (t.validTo === null) {
      console.log(`   → „${t.name}“ bude platiť do 31. 12. 2027`);
      ops.push((tx) =>
        tx.scheduleTemplate.update({ where: { id: t.id }, data: { validTo: UNTIL_2027 } }),
      );
    } else if (t.validTo.getTime() === UNTIL_2027.getTime()) {
      console.log(`   • „${t.name}“ už platí do 31. 12. 2027`);
    } else {
      throw new Error(`„${t.name}“ má validTo ${toIsoDate(t.validTo)} — čakal som prázdne.`);
    }
  }
  const existing2028 = new Map<number, TemplateRow>();
  for (const version of versions2028) {
    const found = templates.find(
      (t) => t.dayOfWeek === version.dayOfWeek && t.validFrom?.getTime() === FROM_2028.getTime(),
    );
    if (found) {
      existing2028.set(version.dayOfWeek, found);
      console.log(`   • „${found.name}“ (od 1. 1. 2028) už existuje — ${found.slotRules.length} pravidiel`);
      continue;
    }
    console.log(`   → vytvorí sa „${version.name}“ od 1. 1. 2028 (${version.blocks.length} pravidiel)`);
    ops.push(async (tx) => {
      const created = await tx.scheduleTemplate.create({
        data: {
          name: version.name,
          dayOfWeek: version.dayOfWeek,
          startTime: version.blocks[0].start,
          endTime: version.blocks[version.blocks.length - 1].end,
          slotDurationMinutes: 30,
          validFrom: FROM_2028,
          validTo: null,
        },
      });
      await tx.slotRule.createMany({ data: rulesData(created.id, version.blocks) });
    });
  }

  // ---- 5) Prepočet už vygenerovaných budúcich slotov --------------------------
  console.log("\n5) Budúce sloty");
  const toRule = (r: RuleRow, sevenMonths: boolean): RuleForExpansion => ({
    id: r.id,
    startTime: r.startTime,
    endTime: r.endTime,
    slotDurationMinutes: r.slotDurationMinutes,
    appointmentType: r.appointmentType as AppointmentTypeLit,
    color: r.color,
    releasePolicy:
      sevenMonths && r.releasePolicy && sevenMonthPolicyIds.has(r.releasePolicy.id)
        ? { releaseType: "MONTHS_BEFORE", daysBefore: null, monthsBefore: 7 }
        : r.releasePolicy,
  });
  const rules2027 = new Map<number, RuleForExpansion[]>([
    [WEEKDAY.THU, thu.slotRules.map((r) => toRule(r, true))],
    [WEEKDAY.FRI, fri.slotRules.map((r) => toRule(r, true))],
  ]);
  const rules2028 = new Map<number, RuleForExpansion[]>(
    versions2028.map((v) => {
      const inDb = existing2028.get(v.dayOfWeek);
      return [
        v.dayOfWeek,
        inDb ? inDb.slotRules.map((r) => toRule(r, false)) : rulesFromBlocks(v.blocks),
      ];
    }),
  );

  const days = await prisma.calendarDay.findMany({
    where: { date: { gte: today } },
    select: {
      date: true,
      status: true,
      dayType: true,
      openedByUserId: true,
      slots: {
        select: {
          id: true,
          startAt: true,
          status: true,
          releaseAt: true,
          appointmentType: true,
          color: true,
          manualLock: true,
          typeOverride: true,
          appointments: {
            where: { status: { notIn: ["CANCELLED", "RESCHEDULED"] } },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  interface Update {
    appointmentType: AppointmentTypeLit;
    color: string;
    status: SlotStatusLit;
    releaseAt: Date | null;
    closedDay: boolean; // BLOCKED slot on a CLOSED day — status stays BLOCKED
  }
  const buckets = new Map<string, Update & { ids: string[] }>();
  const opened: string[] = [];
  const closedAgain: string[] = [];
  let dateOnlyFixes = 0;
  let closedDayFixes = 0;
  let typeOrColour = 0;
  let unchanged = 0;
  const kept = { booked: 0, manualLock: 0, typeOverride: 0, other: 0 };
  const wednesdays: string[] = [];

  for (const day of days) {
    const dow = day.date.getUTCDay();
    const iso = toIsoDate(day.date);
    if (dow === WEEKDAY.WED) {
      wednesdays.push(iso);
      continue;
    }
    if (dow !== WEEKDAY.THU && dow !== WEEKDAY.FRI) continue;
    const is2028 = day.date.getTime() >= FROM_2028.getTime();
    const rules = (is2028 ? rules2028 : rules2027).get(dow)!;
    const desired = expandTemplateRules(rules, day.date, now, {
      manuallyOpened: isManuallyOpenedDay(day),
    });
    const byStart = new Map(desired.map((d) => [d.startAt.getTime(), d]));

    for (const s of day.slots) {
      const want = byStart.get(s.startAt.getTime());
      if (!want) continue;
      const hhmm = clinicTime(s.startAt.toISOString());
      // Do 2027 sa mení len okno dispenzára 9:00/9:30/11:30, nič iné.
      if (
        !is2028 &&
        (!SEVEN_MONTH_TIMES.includes(hhmm) ||
          s.appointmentType !== "DISPENSARY" ||
          want.appointmentType !== "DISPENSARY")
      ) {
        continue;
      }

      if (s.appointments.length > 0 || s.status === "BOOKED" || s.status === "COMPLETED") {
        kept.booked++;
        continue;
      }
      if (s.manualLock) {
        kept.manualLock++;
        continue;
      }
      if (s.typeOverride) {
        kept.typeOverride++;
        continue;
      }
      const free = s.status === "AVAILABLE" || s.status === "LOCKED";
      const closedDay =
        s.status === "BLOCKED" && day.status === "CLOSED" && want.status !== "BLOCKED";
      if (!free && !closedDay) {
        kept.other++;
        continue;
      }

      const next: Update = {
        appointmentType: want.appointmentType,
        color: want.color,
        status: closedDay ? "BLOCKED" : want.status,
        releaseAt: want.releaseAt,
        closedDay,
      };
      const same =
        s.appointmentType === next.appointmentType &&
        s.color === next.color &&
        s.status === next.status &&
        (s.releaseAt?.getTime() ?? null) === (next.releaseAt?.getTime() ?? null);
      if (same) {
        unchanged++;
        continue;
      }

      const label = `${iso} ${hhmm}`;
      if (closedDay) closedDayFixes++;
      else if (s.status === "LOCKED" && next.status === "AVAILABLE") opened.push(label);
      else if (s.status === "AVAILABLE" && next.status === "LOCKED") closedAgain.push(label);
      else if (s.appointmentType !== next.appointmentType || s.color !== next.color) typeOrColour++;
      else dateOnlyFixes++;

      const key = `${next.closedDay}|${next.appointmentType}|${next.color}|${next.status}|${next.releaseAt?.getTime() ?? "null"}`;
      const b = buckets.get(key) ?? { ...next, ids: [] };
      b.ids.push(s.id);
      buckets.set(key, b);
    }
  }

  const planned = [...buckets.values()].reduce((n, b) => n + b.ids.length, 0);
  console.log(`   → otvorí sa hneď: ${opened.length}${opened.length ? ` (${opened.join(", ")})` : ""}`);
  console.log(`   → zatvorí sa: ${closedAgain.length}${closedAgain.length ? ` (${closedAgain.join(", ")})` : ""}`);
  console.log(`   → len iný (skorší/neskorší) dátum otvorenia: ${dateOnlyFixes}`);
  console.log(`   → zmena typu/farby: ${typeOrColour}`);
  console.log(`   → zatvorené dni (ostávajú zatvorené, len uložený čas otvorenia): ${closedDayFixes}`);
  console.log(`   • bez zmeny: ${unchanged}`);
  console.log(
    `   • nedotknuté: obsadené ${kept.booked}, ručne zamknuté ${kept.manualLock}, ` +
      `ručne preurčené ${kept.typeOverride}, iné (blokované/zrušené) ${kept.other}`,
  );
  if (wednesdays.length > 0) {
    console.log(
      `   ⚠ budúce stredy ${wednesdays.join(", ")} sa NEMENIA — nové rozloženie platí pre novo otvorené stredy.`,
    );
  } else {
    console.log("   • žiadna budúca streda nie je vygenerovaná");
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN — nič sa nezapísalo (${ops.length} zmien konfigurácie, ${planned} slotov). ` +
        "Spusti s CONFIRM_SCHEDULE_2028=1 pre zápis.",
    );
    return;
  }

  let written = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const op of ops) await op(tx);
      for (const b of buckets.values()) {
        for (const ids of chunked(b.ids)) {
          // Re-check the state the plan was made from, so a slot booked or
          // locked in the meantime is never overwritten.
          const r = await tx.appointmentSlot.updateMany({
            where: b.closedDay
              ? { id: { in: ids }, status: "BLOCKED", calendarDay: { status: "CLOSED" } }
              : {
                  id: { in: ids },
                  status: { in: ["AVAILABLE", "LOCKED"] },
                  manualLock: false,
                  typeOverride: false,
                  appointments: { none: { status: { notIn: ["CANCELLED", "RESCHEDULED"] } } },
                },
            data: {
              appointmentType: b.appointmentType,
              color: b.color,
              status: b.status,
              releaseAt: b.releaseAt,
            },
          });
          written += r.count;
        }
      }
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  console.log(`\n✓ hotovo — ${ops.length} zmien konfigurácie, ${written}/${planned} slotov.`);
  if (written !== planned) {
    console.log("⚠ niektoré sloty sa medzitým zmenili (objednávka/zámok) — spusti dry-run znova.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
