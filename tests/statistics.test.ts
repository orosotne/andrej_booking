import { describe, it, expect } from "vitest";
import {
  aggregate,
  bookingDayPeriods,
  bookingDayTotals,
  bucketKey,
  bucketKeys,
  classifyAppointment,
  computeAverages,
  isBookingDay,
  leadDays,
  type StatInput,
} from "@/lib/statistics";

// Clinic-local instants (Europe/Bratislava). 12:00Z is the same calendar day in
// both UTC and clinic time, so these fixtures are unambiguous.
const at = (isoDate: string) => `${isoDate}T12:00:00.000Z`;

const appt = (
  bookedOn: string,
  appointmentOn: string,
  patientCategory: StatInput["patientCategory"] = "DISPENZAR",
  appointmentType: StatInput["appointmentType"] = "DISPENSARY",
): StatInput => ({
  createdAt: at(bookedOn),
  startAt: at(appointmentOn),
  patientCategory,
  appointmentType,
});

describe("leadDays", () => {
  it("counts whole calendar days between booking and appointment", () => {
    expect(leadDays(at("2026-07-01"), at("2026-07-01"))).toBe(0);
    expect(leadDays(at("2026-07-01"), at("2026-10-09"))).toBe(100);
    expect(leadDays(at("2026-07-01"), at("2027-03-09"))).toBe(251);
  });

  it("ignores the time of day, and the DST shift inside the range", () => {
    // Booked late in the evening for an early-morning slot the next day.
    expect(
      leadDays("2026-07-01T20:30:00.000Z", "2026-07-02T05:00:00.000Z"),
    ).toBe(1);
    // Spans the October DST change (CEST → CET).
    expect(leadDays(at("2026-10-01"), at("2026-11-01"))).toBe(31);
  });
});

describe("classifyAppointment", () => {
  it("splits non-echo, non-acute bookings by lead time", () => {
    expect(classifyAppointment(appt("2026-07-01", "2026-07-15"))).toBe("LEAD_0_100");
    expect(classifyAppointment(appt("2026-07-01", "2026-10-09"))).toBe("LEAD_0_100");
    expect(classifyAppointment(appt("2026-07-01", "2026-10-10"))).toBe("LEAD_100_250");
    expect(classifyAppointment(appt("2026-07-01", "2027-03-08"))).toBe("LEAD_100_250");
    expect(classifyAppointment(appt("2026-07-01", "2027-03-09"))).toBe("LEAD_250_PLUS");
  });

  it("reports echo and acute on their own, whatever the lead time", () => {
    expect(classifyAppointment(appt("2026-07-01", "2027-06-01", "ECHO", "ECHO"))).toBe("ECHO");
    expect(
      classifyAppointment(appt("2026-07-01", "2026-07-02", "AKUTNE", "ACUTE_RESERVE")),
    ).toBe("AKUTNE");
  });

  it("falls back to the slot type when the patient category is missing", () => {
    expect(classifyAppointment(appt("2026-07-01", "2026-07-10", null, "ECHO"))).toBe("ECHO");
    expect(
      classifyAppointment(appt("2026-07-01", "2026-07-10", null, "ACUTE_RESERVE")),
    ).toBe("AKUTNE");
    expect(classifyAppointment(appt("2026-07-01", "2026-07-10", null, "DISPENSARY"))).toBe(
      "LEAD_0_100",
    );
  });

  it("counts a first visit and 'iné' in the lead-time bands", () => {
    expect(
      classifyAppointment(appt("2026-07-01", "2027-06-01", "PRVOVYSETRENIE", "DISPENSARY")),
    ).toBe("LEAD_250_PLUS");
    expect(classifyAppointment(appt("2026-07-01", "2026-08-01", "INE", "CUSTOM"))).toBe(
      "LEAD_0_100",
    );
  });
});

describe("bucketKey / bucketKeys", () => {
  it("keys a date into its day, ISO week, month and year", () => {
    expect(bucketKey("day", "2026-07-15")).toBe("2026-07-15");
    expect(bucketKey("week", "2026-07-15")).toBe("2026-W29");
    expect(bucketKey("month", "2026-07-15")).toBe("2026-07");
    expect(bucketKey("year", "2026-07-15")).toBe("2026");
  });

  it("puts 1 January 2027 in the last ISO week of 2026", () => {
    expect(bucketKey("week", "2027-01-01")).toBe("2026-W53");
  });

  it("returns a gap-free series across the range", () => {
    expect(bucketKeys("day", "2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(bucketKeys("month", "2026-11-05", "2027-02-20")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(bucketKeys("year", "2024-05-01", "2026-01-01")).toEqual(["2024", "2025", "2026"]);
    expect(bucketKeys("week", "2026-01-01", "2026-12-31")).toHaveLength(53);
    expect(bucketKeys("day", "2026-08-02", "2026-08-01")).toEqual([]);
  });
});

describe("aggregate", () => {
  const rows: StatInput[] = [
    ...Array.from({ length: 5 }, () => appt("2026-07-06", "2026-08-20")), // ≤100 d
    ...Array.from({ length: 3 }, () => appt("2026-07-20", "2026-12-01")), // 100–250 d
    appt("2026-07-20", "2027-06-01"), // >250 d
    appt("2026-07-06", "2026-09-01", "ECHO", "ECHO"),
    appt("2026-07-21", "2026-07-22", "AKUTNE", "ACUTE_RESERVE"),
  ];

  it("groups by the booking month and splits by category", () => {
    const [july] = aggregate(rows, "month", "2026-07-01", "2026-07-31");
    expect(july.key).toBe("2026-07");
    expect(july.counts).toEqual({
      LEAD_0_100: 5,
      LEAD_100_250: 3,
      LEAD_250_PLUS: 1,
      ECHO: 1,
      AKUTNE: 1,
    });
    expect(july.total).toBe(11);
  });

  it("keeps empty periods in the series so charts stay continuous", () => {
    const weeks = aggregate(rows, "week", "2026-07-01", "2026-07-31");
    expect(weeks.map((w) => w.total)).toEqual([0, 6, 0, 5, 0]);
  });

  it("ignores rows booked outside the requested range", () => {
    const days = aggregate(rows, "day", "2026-07-20", "2026-07-20");
    expect(days).toHaveLength(1);
    expect(days[0].total).toBe(4);
  });
});

describe("booking-day averages (Thursdays + Fridays)", () => {
  it("recognises Thursday and Friday as booking days", () => {
    expect(isBookingDay("2026-08-27")).toBe(true); // Thursday
    expect(isBookingDay("2026-08-28")).toBe(true); // Friday
    expect(isBookingDay("2026-08-29")).toBe(false); // Saturday
    expect(isBookingDay("2026-08-31")).toBe(false); // Monday
  });

  it("counts periods by the booking days a range contains", () => {
    // July 2026 has 5 Thursdays and 5 Fridays.
    expect(bookingDayPeriods("day", "2026-07-01", "2026-07-31")).toBe(10);
    // One full ISO week = both its booking days.
    expect(bookingDayPeriods("week", "2026-07-06", "2026-07-12")).toBe(1);
    // Mon–Thu covers only the Thursday: half a week.
    expect(bookingDayPeriods("week", "2026-07-06", "2026-07-09")).toBe(0.5);
    // August 2026 has 8 booking days; the first fortnight holds 4 of them.
    expect(bookingDayPeriods("month", "2026-08-01", "2026-08-31")).toBe(1);
    expect(bookingDayPeriods("month", "2026-08-01", "2026-08-14")).toBe(0.5);
    expect(bookingDayPeriods("year", "2026-01-01", "2026-12-31")).toBeCloseTo(1);
    expect(bookingDayPeriods("day", "2026-07-10", "2026-07-09")).toBe(0);
  });

  it("only counts bookings made on a Thursday or Friday", () => {
    const rows = [
      appt("2026-07-09", "2026-07-30"), // Thursday
      appt("2026-07-10", "2026-07-30"), // Friday
      appt("2026-07-06", "2026-07-30"), // Monday — ignored
    ];
    const totals = bookingDayTotals(rows, "2026-07-01", "2026-07-31");
    expect(totals.LEAD_0_100).toBe(2);
  });

  it("averages over booking-day periods and skips barren ranges", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => appt("2026-07-09", "2026-08-01")),
      appt("2026-07-10", "2027-06-01"),
    ];
    // Two booking days (Thu 9. and Fri 10.) → 2 bookings a day on average.
    const daily = computeAverages(rows, "day", "2026-07-06", "2026-07-12");
    expect(daily?.periods).toBe(2);
    expect(daily?.total).toBe(2);
    expect(daily?.counts.LEAD_0_100).toBe(1.5);
    expect(daily?.dispensary).toBe(2);
    // Mon–Wed holds no booking day at all.
    expect(computeAverages(rows, "day", "2026-07-06", "2026-07-08")).toBeNull();
  });
});
