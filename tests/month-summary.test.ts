import { describe, it, expect } from "vitest";
import { buildMonthSummary, emptyRowLabel } from "@/lib/month-summary";
import type { CalendarDayDTO, SlotDTO } from "@/lib/api-types";

// Instants are UTC; the clinic runs on Europe/Bratislava (CET +1 in March).
let n = 0;
function slot(startAt: string, over: Partial<SlotDTO> = {}): SlotDTO {
  n++;
  return {
    id: `s${n}`,
    startAt,
    endAt: startAt,
    appointmentType: "DISPENSARY",
    status: "AVAILABLE",
    releaseAt: null,
    color: "white",
    lockedReason: null,
    appointment: null,
    ...over,
  };
}

function booked(startAt: string, status = "SCHEDULED"): SlotDTO {
  return slot(startAt, {
    status: "BOOKED",
    appointment: {
      id: `a${n}`,
      status,
      note: null,
      createdAt: "2027-01-01T08:00:00.000Z",
      patientCategory: null,
      patient: {
        id: `p${n}`,
        firstName: "Mária",
        lastName: "Danišová",
        phone: "+421 917 123 456",
        note: null,
      },
    },
  });
}

function day(date: string, slots: SlotDTO[], over: Partial<CalendarDayDTO> = {}): CalendarDayDTO {
  return { id: `d${date}`, date, dayType: "STANDARD", status: "OPEN", note: null, slots, ...over };
}

describe("buildMonthSummary", () => {
  it("lists days in date order and skips days without slots", () => {
    const out = buildMonthSummary([
      day("2027-03-05", [slot("2027-03-05T08:00:00.000Z")]),
      day("2027-03-03", []),
      day("2027-03-04", [slot("2027-03-04T08:00:00.000Z")]),
    ]);
    expect(out.map((d) => d.iso)).toEqual(["2027-03-04", "2027-03-05"]);
  });

  it("shows a booked slot as 'Priezvisko Meno' with phone and sorts by time", () => {
    const [d] = buildMonthSummary([
      day("2027-03-04", [booked("2027-03-04T09:00:00.000Z"), slot("2027-03-04T06:00:00.000Z")]),
    ]);
    expect(d.rows.map((r) => r.time)).toEqual(["07:00", "10:00"]);
    expect(d.rows[1]).toMatchObject({
      kind: "booked",
      name: "Danišová Mária",
      phone: "+421 917 123 456",
      attendance: null,
    });
    expect(d.booked).toBe(1);
  });

  it("carries Prišiel / Neprišiel", () => {
    const [d] = buildMonthSummary([
      day("2027-03-04", [
        booked("2027-03-04T08:00:00.000Z", "ARRIVED"),
        booked("2027-03-04T08:30:00.000Z", "NO_SHOW"),
        booked("2027-03-04T09:00:00.000Z", "COMPLETED"),
      ]),
    ]);
    expect(d.rows.map((r) => r.attendance)).toEqual(["ARRIVED", "NO_SHOW", null]);
  });

  it("leaves out porada, ECHO oddelenie and blocked slots", () => {
    const [d] = buildMonthSummary([
      day("2027-03-04", [
        slot("2027-03-04T07:00:00.000Z", { appointmentType: "CONSULTATION_BLOCKED", status: "LOCKED" }),
        slot("2027-03-04T11:30:00.000Z", { appointmentType: "ECHO_DEPARTMENT_BLOCKED", status: "LOCKED" }),
        slot("2027-03-04T08:00:00.000Z", { status: "BLOCKED" }),
        slot("2027-03-04T08:30:00.000Z", { status: "LOCKED" }),
      ]),
    ]);
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ time: "09:30", kind: "locked" });
  });

  it("keeps a booking on a closed day and labels the day", () => {
    const [d] = buildMonthSummary([
      day(
        "2027-03-04",
        [slot("2027-03-04T08:00:00.000Z", { status: "BLOCKED" }), booked("2027-03-04T09:00:00.000Z")],
        { status: "CLOSED", note: "Dovolenka" },
      ),
    ]);
    expect(d.closedNote).toBe("Zatvorené · Dovolenka");
    expect(d.rows.map((r) => r.kind)).toEqual(["booked"]);
  });

  it("handles a missing payload", () => {
    expect(buildMonthSummary(undefined)).toEqual([]);
  });
});

describe("emptyRowLabel", () => {
  it("names free and locked slots, PENTA included", () => {
    const [d] = buildMonthSummary([
      day("2027-03-04", [
        slot("2027-03-04T08:00:00.000Z"),
        slot("2027-03-04T12:30:00.000Z", { appointmentType: "ECHO", color: "yellow", status: "LOCKED" }),
        slot("2027-03-04T12:50:00.000Z", { appointmentType: "ECHO", color: "yellow" }),
      ]),
    ]);
    expect(d.rows.map(emptyRowLabel)).toEqual(["voľné", "zamknuté · PENTA", "voľné · PENTA"]);
  });
});
