import { TZDate } from "@date-fns/tz";

export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE ?? "Europe/Bratislava";

/**
 * Convert a clinic wall-clock time on a given calendar day into the correct
 * UTC instant, honouring DST. `day` is a midnight-UTC Date (a @db.Date value);
 * only its Y/M/D are used. `hhmm` is "HH:MM" local clinic time.
 */
export function wallClockToUtc(
  day: Date,
  hhmm: string,
  timeZone: string = CLINIC_TIMEZONE,
): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const zoned = new TZDate(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    h,
    m,
    0,
    0,
    timeZone,
  );
  return new Date(zoned.getTime());
}
