import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import { clinicTime } from "@/lib/format";
import {
  isPentaSlotTime,
  PENTA_RELEASE_DAYS_BEFORE,
  PENTA_TIMES,
  pentaReleaseAt,
} from "@/lib/slot-engine/release-rules";

// ECHO PENTA sloty sa otvárajú 10 dní pred termínom (zmena zavedená 2026-10-24).
// Dovtedy boli zamknuté bez release času a otvárali sa len jednotlivo heslom.
//
// Engine to už rieši pri generovaní aj pri re-apply šablóny (isPentaSlotTime
// v expandTemplateRules → PENTA_POLICY) a pri ručnej zmene určenia na
// „echo penta" (resolveDesignation). Tento skript dorovná UŽ vygenerované dni
// od dnes — žlté ECHO sloty (13:30/13:50/14:10 od 1. 2. 2027 aj ručne určené
// „echo penta") a voľné modré ECHO sloty v PENTA časoch, ktoré ešte nie sú žlté:
//   • voľné LOCKED sloty (bez manuálneho zámku) → release_at 06:00 UTC
//     10 dní pred dňom; ak to už nastalo, rovno AVAILABLE, inak ich otvorí
//     ranný release cron,
//   • žlté AVAILABLE sloty (otvorené heslom) ostávajú voľné, len dostanú
//     release_at — aby po zrušení objednávky alebo znovuotvorení dňa
//     nasledovali 10-dňové okno namiesto večného zámku,
//   • modré voľné ECHO sloty v PENTA časoch (bez ručného určenia) → žltá farba
//     a 10-dňové okno, presne ako by ich nastavil re-apply šablóny,
//   • BLOCKED sloty (zatvorený deň / dovolenka) → len release_at (+ žltá);
//     stav sa nemení, znovuotvorenie dňa ich potom otvorí podľa okna,
//   • OBSADENÉ žlté sloty (BOOKED) → len release_at, pre prípad zrušenia;
//     objednávka ani stav slotu sa nemenia,
//   • NEDOTKNUTÉ: manuálne zamknuté sloty (vedomé rozhodnutie), COMPLETED,
//     CANCELLED, obsadené modré ECHO sloty spred zavedenia PENTA a ručne
//     preurčené sloty, ktoré nie sú žlté.
// Dni v minulosti sa nemenia. Idempotentné — bezpečné opakovať. Spúšťať až PO
// nasadení engine zmeny, inak by re-apply šablóny sloty zamkol späť.
//
// Preview:  npx tsx prisma/penta-release-10d.ts
// Apply:    CONFIRM_PENTA_RELEASE_10D=1 npx tsx prisma/penta-release-10d.ts

const APPLY = process.env.CONFIRM_PENTA_RELEASE_10D === "1";

type Status = "LOCKED" | "AVAILABLE" | "BOOKED" | "BLOCKED" | "CANCELLED" | "COMPLETED";

interface Change {
  id: string;
  /** Stav, ktorý musí slot mať aj v čase zápisu (guard proti súbehu). */
  expect: Status;
  status: Status;
  releaseAt: Date;
  color: "yellow";
  label: string; // "2027-02-04 13:30" pre výpis
}

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}, ECHO PENTA sa otvára ` +
      `${PENTA_RELEASE_DAYS_BEFORE} dní pred termínom (dni od ${toIsoDate(today)})`,
  );

  const slots = await prisma.appointmentSlot.findMany({
    where: { appointmentType: "ECHO", calendarDay: { date: { gte: today } } },
    select: {
      id: true,
      status: true,
      releaseAt: true,
      manualLock: true,
      typeOverride: true,
      startAt: true,
      color: true,
      calendarDay: { select: { date: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const changes: Change[] = [];
  let opened = 0; // LOCKED → AVAILABLE (okno už nastalo)
  let waiting = 0; // LOCKED do otvorenia 10 dní pred termínom
  let closedBlue = 0; // z toho doteraz voľné modré sloty
  let keptOpen = 0; // ostávajú voľné, len release_at / farba
  let recoloured = 0; // modré → žltá
  let stampedBlocked = 0;
  let stampedBooked = 0;
  let keptManualLock = 0;
  let keptOther = 0;
  let alreadyOk = 0;

  for (const s of slots) {
    const date = s.calendarDay.date;
    const hhmm = PENTA_TIMES.find(
      (t) =>
        isPentaSlotTime(date, t) &&
        s.startAt.getTime() === wallClockToUtc(date, t).getTime(),
    );
    const yellow = s.color === "yellow";
    // Modrý ECHO slot v PENTA čase je PENTA len vtedy, keď ho nikto ručne
    // nepreurčil — rovnako ako pri re-apply šablóny má ručné rozhodnutie prednosť.
    const templatePenta = hhmm !== undefined && !s.typeOverride;
    if (!yellow && !templatePenta) continue;

    const label = `${toIsoDate(date)} ${hhmm ?? clinicTime(s.startAt.toISOString())}`;
    const releaseAt = pentaReleaseAt(date);
    const open = releaseAt.getTime() <= now.getTime();
    const sameRelease = s.releaseAt?.getTime() === releaseAt.getTime();
    const status = s.status as Status;

    if (s.manualLock) {
      keptManualLock++;
      continue;
    }
    if (status === "COMPLETED" || status === "CANCELLED") {
      keptOther++;
      continue;
    }
    if (status === "BOOKED") {
      // Obsadený modrý slot spred zavedenia PENTA ostáva, ako je.
      if (!yellow) {
        keptOther++;
        continue;
      }
      if (sameRelease) alreadyOk++;
      else {
        changes.push({ id: s.id, expect: "BOOKED", status: "BOOKED", releaseAt, color: "yellow", label });
        stampedBooked++;
      }
      continue;
    }
    if (status === "BLOCKED") {
      if (sameRelease && yellow) alreadyOk++;
      else {
        changes.push({ id: s.id, expect: "BLOCKED", status: "BLOCKED", releaseAt, color: "yellow", label });
        stampedBlocked++;
        if (!yellow) recoloured++;
      }
      continue;
    }
    if (status === "AVAILABLE" && yellow) {
      // Otvorené heslom — voľnú kapacitu nikomu neberieme.
      if (sameRelease) alreadyOk++;
      else {
        changes.push({ id: s.id, expect: "AVAILABLE", status: "AVAILABLE", releaseAt, color: "yellow", label });
        keptOpen++;
      }
      continue;
    }
    // LOCKED bez manuálneho zámku, alebo modrý AVAILABLE v PENTA čase.
    const next: Status = open ? "AVAILABLE" : "LOCKED";
    if (sameRelease && yellow && status === next) {
      alreadyOk++;
      continue;
    }
    changes.push({ id: s.id, expect: status, status: next, releaseAt, color: "yellow", label });
    if (!yellow) recoloured++;
    if (next === "AVAILABLE") {
      if (status === "AVAILABLE") keptOpen++;
      else opened++;
    } else {
      waiting++;
      if (status === "AVAILABLE") closedBlue++;
    }
  }

  console.log(
    `\nNájdených ${slots.length} ECHO slotov od ${toIsoDate(today)}, z toho na zmenu ${changes.length}:` +
      `\n  → otvoriť hneď (do termínu ostáva ≤ ${PENTA_RELEASE_DAYS_BEFORE} dní): ${opened}` +
      `\n  → zamknuté, otvoria sa ${PENTA_RELEASE_DAYS_BEFORE} dní pred termínom: ${waiting}` +
      ` (z toho doteraz voľných modrých: ${closedBlue})` +
      `\n  → ostávajú voľné, len release_at / farba: ${keptOpen}` +
      `\n  → modré → žltá (spolu): ${recoloured}` +
      `\n  → BLOCKED (zatvorený deň / dovolenka), len release_at: ${stampedBlocked}` +
      `\n  → obsadené, len release_at (objednávka sa nemení): ${stampedBooked}` +
      `\n  → už v poriadku: ${alreadyOk}` +
      `\n  → NEDOTKNUTÉ — manuálny zámok: ${keptManualLock}, ostatné (obsadené modré / dokončené / zrušené): ${keptOther}`,
  );
  if (changes.length > 0) {
    console.log(`  → prvý menený slot: ${changes[0].label}, posledný: ${changes[changes.length - 1].label}`);
  }

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_PENTA_RELEASE_10D=1 pre aplikovanie.",
    );
    return;
  }

  // Status guard v where: keby si medzi načítaním a zápisom niekto stihol slot
  // objednať alebo zamknúť, zápis ho preskočí namiesto prepísania.
  let written = 0;
  let skipped = 0;
  for (const c of changes) {
    const r = await prisma.appointmentSlot.updateMany({
      where: { id: c.id, status: c.expect, manualLock: false },
      data: { status: c.status, releaseAt: c.releaseAt, color: c.color },
    });
    if (r.count === 1) written++;
    else skipped++;
  }
  console.log(
    `\n✓ done — upravených ${written} slotov${skipped > 0 ? `, preskočených (medzitým zmenené) ${skipped}` : ""}. ` +
      `ECHO PENTA sloty sa otvárajú ${PENTA_RELEASE_DAYS_BEFORE} dní pred termínom.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
