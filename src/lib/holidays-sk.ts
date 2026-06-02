// Slovenské štátne sviatky a dni pracovného pokoja (všetko sú dni pracovného
// voľna — ambulancia v ne nepracuje). Pohyblivé sviatky (Veľký piatok,
// Veľkonočný pondelok) sa počítajú z dátumu Veľkej noci. Modul je čistý
// (bez Prisma/DB), aby sa dal jednotkovo testovať a použiť v slot-engine.

import { toIsoDate } from "@/lib/calendar-date";

// Pevné sviatky: [mesiac (1–12), deň, názov].
const FIXED_HOLIDAYS: ReadonlyArray<readonly [number, number, string]> = [
  [1, 1, "Deň vzniku Slovenskej republiky"],
  [1, 6, "Zjavenie Pána (Traja králi)"],
  [5, 1, "Sviatok práce"],
  [5, 8, "Deň víťazstva nad fašizmom"],
  [7, 5, "Sviatok svätého Cyrila a Metoda"],
  [8, 29, "Výročie SNP"],
  [9, 1, "Deň Ústavy Slovenskej republiky"],
  [9, 15, "Sedembolestná Panna Mária"],
  [11, 1, "Sviatok všetkých svätých"],
  [11, 17, "Deň boja za slobodu a demokraciu"],
  [12, 24, "Štedrý deň"],
  [12, 25, "Prvý sviatok vianočný"],
  [12, 26, "Druhý sviatok vianočný"],
];

/**
 * Veľkonočná nedeľa (UTC polnoc) pre gregoriánsky rok —
 * algoritmus Meeus/Jones/Butcher (anonymný gregoriánsky výpočet).
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marec, 4 = apríl
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftIso(base: Date, deltaDays: number): string {
  return toIsoDate(
    new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + deltaDays,
      ),
    ),
  );
}

/** Mapa `YYYY-MM-DD` → názov pre všetky slovenské sviatky v danom roku. */
export function slovakHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const [month, day, name] of FIXED_HOLIDAYS) {
    out.set(toIsoDate(new Date(Date.UTC(year, month - 1, day))), name);
  }
  const easter = easterSunday(year);
  out.set(shiftIso(easter, -2), "Veľký piatok");
  out.set(shiftIso(easter, 1), "Veľkonočný pondelok");
  return out;
}

/** Názov sviatku pre ISO dátum, alebo `null` ak nejde o sviatok. */
export function holidayName(iso: string): string | null {
  const year = Number(iso.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return slovakHolidays(year).get(iso) ?? null;
}

/** Všetky sviatky v rozsahu [fromIso, toIso] vrátane (zvláda aj prelom roka). */
export function holidaysBetween(
  fromIso: string,
  toIso: string,
): { iso: string; name: string }[] {
  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIso.slice(0, 4));
  const out: { iso: string; name: string }[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    for (const [iso, name] of slovakHolidays(year)) {
      if (iso >= fromIso && iso <= toIso) out.push({ iso, name });
    }
  }
  return out;
}
