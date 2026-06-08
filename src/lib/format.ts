export const CLINIC_TZ = "Europe/Bratislava";

const timeFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayChipFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  weekday: "short",
  day: "numeric",
  month: "numeric",
});

const longDateFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "07:00" in clinic time from an ISO instant. */
export function clinicTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "št 3.7." style short day label from a YYYY-MM-DD string. */
export function clinicDayChip(isoDate: string): string {
  return dayChipFmt.format(new Date(`${isoDate}T12:00:00.000Z`));
}

/** "piatok 3. júla 2026" from a YYYY-MM-DD string. */
export function clinicLongDate(isoDate: string): string {
  return longDateFmt.format(new Date(`${isoDate}T12:00:00.000Z`));
}

const shortDateFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** "12. 6. 2026" (numeric d. m. yyyy) from a YYYY-MM-DD string. */
export function clinicShortDate(isoDate: string): string {
  return shortDateFmt.format(new Date(`${isoDate}T12:00:00.000Z`));
}

// --- YYYY-MM-DD arithmetic (UTC-safe, no timezone drift) ---

export function isoAddDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `isoDate`. */
export function startOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  return isoAddDays(isoDate, diff);
}

// en-CA renders as YYYY-MM-DD; with the clinic timeZone this gives the local
// clinic date rather than the UTC date (which lags by a day in the early-morning
// hours, since Bratislava is ahead of UTC).
const clinicIsoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as YYYY-MM-DD in clinic time (Europe/Bratislava), not UTC. */
export function todayIso(): string {
  return clinicIsoDateFmt.format(new Date());
}

/** YYYY-MM-DD in clinic time from an ISO instant. */
export function clinicDate(iso: string): string {
  return clinicIsoDateFmt.format(new Date(iso));
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addMonths(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}

const monthFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: CLINIC_TZ,
  month: "long",
  year: "numeric",
});

export function clinicMonthLabel(isoDate: string): string {
  return monthFmt.format(new Date(`${isoDate}T12:00:00.000Z`));
}

/** Day-of-month number for a YYYY-MM-DD string. */
export function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

/** ISO-8601 week number (1–53) for a YYYY-MM-DD string. */
export function isoWeekNumber(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // shift to the week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** ISO-8601 week-numbering year for a YYYY-MM-DD string (the week's Thursday). */
export function isoWeekYear(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  return d.getUTCFullYear();
}

/** Number of ISO weeks (52 or 53) in a given ISO week-numbering year. */
export function isoWeeksInYear(year: number): number {
  return isoWeekNumber(`${year}-12-28`);
}

/** YYYY-MM-DD of the Monday that starts ISO week `week` of `year`. */
export function isoWeekStart(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Localized short month names ["jan", "feb", …] in clinic locale. */
export const CLINIC_MONTHS_SHORT = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("sk-SK", { month: "short" }).format(
    new Date(Date.UTC(2021, i, 1)),
  ),
);
