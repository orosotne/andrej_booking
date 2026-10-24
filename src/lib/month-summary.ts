import type { CalendarDayDTO, SlotDTO } from "@/lib/api-types";
import { clinicTime } from "@/lib/format";

// Administrácia → Súhrn: a month as small per-day slot tables (name, surname,
// phone), on screen and on one printed A4. Pure, so screen and print share it.

/** One line of a day's summary table. */
export interface SummaryRow {
  id: string;
  time: string; // "07:00", clinic time
  kind: "booked" | "free" | "locked" | "other";
  /** "Priezvisko Meno" for a booked slot, as everywhere in the calendar. */
  name: string | null;
  phone: string | null;
  attendance: "ARRIVED" | "NO_SHOW" | null;
  /** Echo PENTA slot (yellow) — marked so free PENTA capacity stands out. */
  penta: boolean;
}

export interface SummaryDay {
  iso: string;
  closedNote: string | null; // set when the day is closed (vacation / holiday)
  rows: SummaryRow[];
  booked: number;
}

const BLOCKED_TYPES = new Set(["CONSULTATION_BLOCKED", "ECHO_DEPARTMENT_BLOCKED"]);

function toRow(slot: SlotDTO): SummaryRow {
  const a = slot.appointment;
  const booked = slot.status === "BOOKED" && a !== null;
  return {
    id: slot.id,
    time: clinicTime(slot.startAt),
    kind: booked
      ? "booked"
      : slot.status === "AVAILABLE"
        ? "free"
        : slot.status === "LOCKED"
          ? "locked"
          : "other",
    name: booked ? `${a.patient.lastName} ${a.patient.firstName}` : null,
    phone: booked ? a.patient.phone : null,
    attendance: !booked
      ? null
      : a.status === "ARRIVED"
        ? "ARRIVED"
        : a.status === "NO_SHOW"
          ? "NO_SHOW"
          : null,
    penta: slot.color === "yellow",
  };
}

/**
 * The month's generated days, in date order, each with the slots that can hold
 * a patient. Porada / ECHO oddelenie and slots of a closed day are left out —
 * they never carry a name and would only crowd the single printed page — but
 * a booking kept on a closed day still shows.
 */
export function buildMonthSummary(days: CalendarDayDTO[] | undefined): SummaryDay[] {
  return [...(days ?? [])]
    .filter((d) => d.slots.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const rows = [...d.slots]
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .filter(
          (s) =>
            (s.status === "BOOKED" && s.appointment !== null) ||
            (s.status !== "BLOCKED" && !BLOCKED_TYPES.has(s.appointmentType)),
        )
        .map(toRow);
      return {
        iso: d.date,
        closedNote:
          d.status === "CLOSED" ? (d.note ? `Zatvorené · ${d.note}` : "Zatvorené") : null,
        rows,
        booked: rows.filter((r) => r.kind === "booked").length,
      };
    });
}

/** Short Slovak label for a row without a patient. */
export function emptyRowLabel(row: SummaryRow): string {
  if (row.kind === "free") return row.penta ? "voľné · PENTA" : "voľné";
  if (row.kind === "locked") return row.penta ? "zamknuté · PENTA" : "zamknuté";
  return "—";
}
