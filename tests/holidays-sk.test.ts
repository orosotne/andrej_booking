import { describe, it, expect } from "vitest";
import { slovakHolidays, holidayName, holidaysBetween } from "@/lib/holidays-sk";

describe("slovakHolidays", () => {
  it("computes the movable Easter holidays (2026: Easter Sunday = Apr 5)", () => {
    const h = slovakHolidays(2026);
    expect(h.get("2026-04-03")).toBe("Veľký piatok");
    expect(h.get("2026-04-06")).toBe("Veľkonočný pondelok");
  });

  it("includes fixed state holidays", () => {
    const h = slovakHolidays(2026);
    expect(h.get("2026-01-01")).toBe("Deň vzniku Slovenskej republiky");
    expect(h.get("2026-09-01")).toBe("Deň Ústavy Slovenskej republiky");
    expect(h.get("2026-12-25")).toBe("Prvý sviatok vianočný");
  });

  it("has 15 holidays per year (13 fixed + 2 movable)", () => {
    expect(slovakHolidays(2026).size).toBe(15);
    expect(slovakHolidays(2027).size).toBe(15);
  });
});

describe("holidayName", () => {
  it("returns the name for a holiday date", () => {
    expect(holidayName("2026-05-01")).toBe("Sviatok práce");
  });

  it("returns null for a normal working day", () => {
    expect(holidayName("2026-06-10")).toBeNull();
  });
});

describe("holidaysBetween", () => {
  it("lists holidays in range across a year boundary", () => {
    const isos = holidaysBetween("2026-12-20", "2027-01-10").map((x) => x.iso);
    expect(isos).toContain("2026-12-24");
    expect(isos).toContain("2026-12-26");
    expect(isos).toContain("2027-01-01");
    expect(isos).toContain("2027-01-06");
    expect(isos).not.toContain("2026-12-19");
    expect(isos).not.toContain("2027-01-11");
  });
});
