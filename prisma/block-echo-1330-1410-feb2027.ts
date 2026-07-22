import "dotenv/config";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { wallClockToUtc } from "@/lib/clinic-time";
import {
  isPasswordOnlySlot,
  PASSWORD_ONLY_FROM,
  PASSWORD_ONLY_TIMES,
} from "@/lib/slot-engine/release-rules";

// Blokácia ECHO slotov 13:30 / 13:50 / 14:10 od 1. februára 2027 (zmena zavedená 2026-07-22).
//
// Pravidlá šablón sa NEMENIA — ostávajú na zdieľanej politike „Voľné hneď".
// Dátumovú hranicu vynucuje engine (isPasswordOnlySlot v expandTemplateRules):
// novo generované dni aj re-apply šablóny vytvárajú tieto sloty od 1.2.2027 ako
// LOCKED bez release času, takže ich otvorí len heslo (unlock dialóg). Tento
// skript dorovná UŽ vygenerované dni od 1.2.2027:
//   • voľné AVAILABLE/LOCKED sloty (bez manuálneho zámku) → LOCKED, release_at
//     NULL — release cron ich už nikdy neotvorí,
//   • BLOCKED sloty (zatvorený deň / dovolenka) a manuálne zamknuté sloty si
//     len vynulujú release_at, aby ich prípadné znovuotvorenie dňa nechalo
//     zamknuté; status, dôvod ani manuálny zámok sa nemenia,
//   • OBSADENÉ sloty (BOOKED/COMPLETED) a CANCELLED sa NIKDY nedotknú.
// Idempotentné — bezpečné opakovať. Spúšťať až PO nasadení engine zmeny,
// inak by admin re-apply šablóny mohol sloty medzitým znova otvoriť.
//
// Preview:  npx tsx prisma/block-echo-1330-1410-feb2027.ts
// Apply:    CONFIRM_BLOCK_ECHO_2027=1 npx tsx prisma/block-echo-1330-1410-feb2027.ts

const APPLY = process.env.CONFIRM_BLOCK_ECHO_2027 === "1";

async function main() {
  const now = new Date();
  const today = dateOnly(toIsoDate(now));
  const from = today.getTime() > PASSWORD_ONLY_FROM.getTime() ? today : PASSWORD_ONLY_FROM;
  console.log(
    `${APPLY ? "APPLY" : "DRY-RUN"} — dnes ${toIsoDate(today)}, blokujem časy ${PASSWORD_ONLY_TIMES.join(
      ", ",
    )} na dňoch od ${toIsoDate(from)}`,
  );

  const slots = await prisma.appointmentSlot.findMany({
    where: { calendarDay: { date: { gte: from } } },
    select: {
      id: true,
      status: true,
      releaseAt: true,
      manualLock: true,
      startAt: true,
      calendarDay: { select: { date: true } },
    },
    orderBy: { startAt: "asc" },
  });

  interface Target {
    id: string;
    status: string;
    releaseAt: Date | null;
    manualLock: boolean;
    label: string; // "2027-02-04 13:30" pre výpis
  }
  const targets: Target[] = [];
  for (const s of slots) {
    const hhmm = PASSWORD_ONLY_TIMES.find(
      (t) =>
        isPasswordOnlySlot(s.calendarDay.date, t) &&
        s.startAt.getTime() === wallClockToUtc(s.calendarDay.date, t).getTime(),
    );
    if (!hhmm) continue;
    targets.push({
      id: s.id,
      status: s.status,
      releaseAt: s.releaseAt,
      manualLock: s.manualLock,
      label: `${toIsoDate(s.calendarDay.date)} ${hhmm}`,
    });
  }

  const toLockIds: string[] = [];
  const nullReleaseIds: string[] = [];
  const keptBooked: string[] = [];
  let fromAvailable = 0;
  let fromLocked = 0;
  let keptCancelled = 0;
  let alreadyOk = 0;
  let firstLabel: string | null = null;
  let lastLabel: string | null = null;

  for (const t of targets) {
    if (t.status === "BOOKED" || t.status === "COMPLETED") {
      keptBooked.push(`${t.label} (${t.status})`);
      continue;
    }
    if (t.status === "CANCELLED") {
      keptCancelled++;
      continue;
    }
    if (t.status === "BLOCKED" || t.manualLock) {
      // Už zamknuté/blokované — len zaisti, že ich nič automaticky neotvorí.
      if (t.releaseAt !== null) nullReleaseIds.push(t.id);
      else alreadyOk++;
      continue;
    }
    // AVAILABLE alebo LOCKED bez manuálneho zámku
    if (t.status === "LOCKED" && t.releaseAt === null) {
      alreadyOk++;
      continue;
    }
    if (t.status === "AVAILABLE") fromAvailable++;
    else fromLocked++;
    toLockIds.push(t.id);
    if (firstLabel === null) firstLabel = t.label;
    lastLabel = t.label;
  }

  console.log(
    `\nNájdených ${targets.length} slotov 13:30/13:50/14:10 od ${toIsoDate(from)}:` +
      `\n  → zablokovať (LOCKED, bez release): ${toLockIds.length} (z toho voľných ${fromAvailable}, zamknutých ${fromLocked})` +
      `\n  → BLOCKED/manuálny zámok, iba vynulovať release_at: ${nullReleaseIds.length}` +
      `\n  → už v poriadku: ${alreadyOk}` +
      `\n  → NEDOTKNUTÉ obsadené: ${keptBooked.length}, zrušené: ${keptCancelled}`,
  );
  if (firstLabel) console.log(`  → prvý menený slot: ${firstLabel}, posledný: ${lastLabel}`);
  if (keptBooked.length > 0) {
    console.log(`  → ponechané obsadené sloty:\n     ${keptBooked.join("\n     ")}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_BLOCK_ECHO_2027=1 pre aplikovanie.");
    return;
  }

  if (toLockIds.length > 0) {
    await prisma.appointmentSlot.updateMany({
      where: { id: { in: toLockIds } },
      data: { status: "LOCKED", releaseAt: null },
    });
  }
  if (nullReleaseIds.length > 0) {
    await prisma.appointmentSlot.updateMany({
      where: { id: { in: nullReleaseIds } },
      data: { releaseAt: null },
    });
  }
  console.log(
    "\n✓ done — sloty 13:30/13:50/14:10 od 1.2.2027 sú zablokované; otvoriť ich možno len heslom.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
