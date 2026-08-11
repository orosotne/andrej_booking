import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import {
  isPasswordOnlySlot,
  PASSWORD_ONLY_TIMES,
} from "@/lib/slot-engine/release-rules";

// Sloty bez časových obmedzení v dňoch otvorených heslom (streda / posledný
// piatok v mesiaci) — zmena zavedená 2026-08-11.
//
// Engine to už rieši pri generovaní aj pri re-apply šablóny
// (expandTemplateRules s manuallyOpened → politika „Voľné hneď"). Tento skript
// dorovná dni, ktoré boli otvorené EŠTE PRED nasadením zmeny a majú sloty
// zamknuté na svoje release okno:
//   • voľné LOCKED sloty (bez manuálneho zámku) → AVAILABLE, release_at = epocha,
//   • sloty, ktoré sú už AVAILABLE, ale majú budúci release_at → len release_at
//     na epochu (aby ich re-apply/reopen nezamkol späť),
//   • NEDOTKNUTÉ: obsadené (BOOKED/COMPLETED), zrušené (CANCELLED), BLOCKED
//     (porada, ECHO oddelenie, zatvorený deň / dovolenka), manuálne zamknuté
//     a žlté PENTA sloty 13:30/13:50/14:10 od 1. 2. 2027 (tie sa aj naďalej
//     otvárajú len jednotlivo heslom).
// Dni v minulosti sa nemenia. Idempotentné — bezpečné opakovať.
//
// Preview:  npx tsx prisma/open-manual-days-immediate.ts
// Apply:    CONFIRM_OPEN_MANUAL_DAYS=1 npx tsx prisma/open-manual-days-immediate.ts

const APPLY = process.env.CONFIRM_OPEN_MANUAL_DAYS === "1";
const EPOCH = new Date(0);

async function main() {
  const today = dateOnly(toIsoDate(new Date()));
  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — dni otvorené heslom (streda / posledný piatok) od ${toIsoDate(today)}`,
  );

  const days = await prisma.calendarDay.findMany({
    where: {
      date: { gte: today },
      dayType: { in: ["MANUAL_WEDNESDAY", "LAST_FRIDAY"] },
      openedByUserId: { not: null },
      // Zatvorený deň (sviatok / dovolenka) sa neotvára — to je iná operácia.
      status: { not: "CLOSED" },
    },
    select: {
      date: true,
      dayType: true,
      slots: {
        select: {
          id: true,
          status: true,
          releaseAt: true,
          manualLock: true,
          startAt: true,
          appointmentType: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  if (days.length === 0) {
    console.log("Žiadne také dni — nič na úpravu.");
    return;
  }

  const toOpenIds: string[] = []; // LOCKED → AVAILABLE + release_at epocha
  const toStampIds: string[] = []; // už AVAILABLE, len release_at epocha
  let skippedPenta = 0;
  let skippedBooked = 0;
  let skippedBlocked = 0;
  let skippedManualLock = 0;
  let alreadyOk = 0;

  for (const day of days) {
    let openedHere = 0;
    for (const s of day.slots) {
      if (
        s.appointmentType === "CONSULTATION_BLOCKED" ||
        s.appointmentType === "ECHO_DEPARTMENT_BLOCKED"
      ) {
        skippedBlocked++;
        continue;
      }
      // Žlté PENTA sloty (13:30/13:50/14:10 od 1. 2. 2027) ostávajú len na heslo.
      const isPenta = PASSWORD_ONLY_TIMES.some(
        (t) =>
          isPasswordOnlySlot(day.date, t) &&
          s.startAt.getTime() === wallClockToUtc(day.date, t).getTime(),
      );
      if (isPenta) {
        skippedPenta++;
        continue;
      }
      if (s.status === "BOOKED" || s.status === "COMPLETED") {
        skippedBooked++;
        continue;
      }
      if (s.status === "BLOCKED" || s.status === "CANCELLED") {
        skippedBlocked++;
        continue;
      }
      if (s.manualLock) {
        skippedManualLock++;
        continue;
      }
      const stamped = s.releaseAt !== null && s.releaseAt.getTime() <= 0;
      if (s.status === "AVAILABLE") {
        if (stamped) alreadyOk++;
        else toStampIds.push(s.id);
        continue;
      }
      // LOCKED bez manuálneho zámku → otvoriť
      toOpenIds.push(s.id);
      openedHere++;
    }
    console.log(
      `  ${toIsoDate(day.date)} (${day.dayType}): ${day.slots.length} slotov, otvoriť ${openedHere}`,
    );
  }

  console.log(
    `\nSpolu ${days.length} dní:` +
      `\n  → otvoriť (LOCKED → AVAILABLE, bez release okna): ${toOpenIds.length}` +
      `\n  → už voľné, len zrušiť release okno: ${toStampIds.length}` +
      `\n  → už v poriadku: ${alreadyOk}` +
      `\n  → NEDOTKNUTÉ — obsadené: ${skippedBooked}, blokované/zrušené: ${skippedBlocked}, ` +
      `manuálny zámok: ${skippedManualLock}, žlté PENTA: ${skippedPenta}`,
  );

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_OPEN_MANUAL_DAYS=1 pre aplikovanie.",
    );
    return;
  }

  // Status guard v where: keby si medzi načítaním a zápisom niekto stihol slot
  // objednať, zápis ho preskočí namiesto prepísania.
  let opened = 0;
  let stamped = 0;
  if (toOpenIds.length > 0) {
    const r = await prisma.appointmentSlot.updateMany({
      where: { id: { in: toOpenIds }, status: "LOCKED" },
      data: { status: "AVAILABLE", releaseAt: EPOCH },
    });
    opened = r.count;
  }
  if (toStampIds.length > 0) {
    const r = await prisma.appointmentSlot.updateMany({
      where: { id: { in: toStampIds }, status: "AVAILABLE" },
      data: { releaseAt: EPOCH },
    });
    stamped = r.count;
  }
  console.log(
    `\n✓ done — otvorených ${opened}, dorovnaných (release_at) ${stamped}. ` +
      "Dni otvorené heslom už nemajú časové obmedzenia.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
