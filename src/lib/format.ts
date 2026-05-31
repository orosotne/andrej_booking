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

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
