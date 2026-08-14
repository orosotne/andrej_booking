import "dotenv/config";
import { prisma } from "@/lib/db";
import { toIsoDate } from "@/lib/calendar-date";

// Oprava manuálnych zámkov (2026-08-14). Doteraz lockSlot ponechal slotu jeho
// pôvodný (už uplynutý) release_at, takže ranný release cron zamknutý slot na
// druhý deň potichu znova otvoril — manuálny zámok reálne vydržal len do
// najbližšieho rána. Odteraz zámok „až do odomknutia heslom" nastavuje
// release_at = null (cron sa ho nedotkne) a zámok „do dátumu" release_at na
// 06:00 UTC zvoleného dňa (cron ho v to ráno otvorí).
//
// Tento skript dorovná EXISTUJÚCE manuálne zamknuté sloty: každému slotu so
// status LOCKED + manual_lock = true vynuluje release_at, čiže sa preklopia do
// režimu „až do odomknutia heslom" (dovtedy jediný sľubovaný význam zámku).
// Ničoho iného sa nedotkne. Idempotentné — bezpečné opakovať.
//
// Preview:  npx tsx prisma/fix-manual-lock-release.ts
// Apply:    CONFIRM_FIX_MANUAL_LOCKS=1 npx tsx prisma/fix-manual-lock-release.ts

const APPLY = process.env.CONFIRM_FIX_MANUAL_LOCKS === "1";

async function main() {
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — manuálne zámky bez release_at`);

  const slots = await prisma.appointmentSlot.findMany({
    where: { status: "LOCKED", manualLock: true, releaseAt: { not: null } },
    select: {
      id: true,
      startAt: true,
      releaseAt: true,
      lockedReason: true,
      calendarDay: { select: { date: true } },
    },
    orderBy: { startAt: "asc" },
  });

  if (slots.length === 0) {
    console.log("Žiadne manuálne zamknuté sloty s release_at — nič na úpravu.");
    return;
  }

  for (const s of slots) {
    console.log(
      `  ${toIsoDate(s.calendarDay.date)} ${s.startAt.toISOString().slice(11, 16)} UTC` +
        ` — release_at ${s.releaseAt ? toIsoDate(s.releaseAt) : "—"} → null` +
        (s.lockedReason ? ` (${s.lockedReason})` : ""),
    );
  }
  console.log(`\nSpolu na úpravu: ${slots.length}`);

  if (!APPLY) {
    console.log(
      "\nDRY-RUN — nič sa nezapísalo. Re-run s CONFIRM_FIX_MANUAL_LOCKS=1 pre aplikovanie.",
    );
    return;
  }

  // Status guard vo where: keby medzitým niekto slot odomkol, zápis ho preskočí.
  const r = await prisma.appointmentSlot.updateMany({
    where: {
      id: { in: slots.map((s) => s.id) },
      status: "LOCKED",
      manualLock: true,
    },
    data: { releaseAt: null },
  });
  console.log(`\n✓ done — ${r.count} manuálnych zámkov už ranný cron neodomkne.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
