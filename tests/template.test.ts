import { describe, it, expect } from "vitest";
import { buildDayTemplate } from "@/lib/slot-engine/template";

describe("buildDayTemplate (v2 layout)", () => {
  const slots = buildDayTemplate();

  it("produces 18 slots — 2 PRE_HOSPITAL + 2 Porada + 7 Dispenzár + 2 ECHO oddelenie + 5 ECHO", () => {
    expect(slots).toHaveLength(18);
  });

  it("starts at 07:00 and ends at 15:20", () => {
    expect(slots[0].start).toBe("07:00");
    expect(slots[slots.length - 1].end).toBe("15:20");
  });

  it("8:00 and 8:30 are CONSULTATION_BLOCKED (Porada) and not bookable", () => {
    const porada = slots.filter((s) => s.start === "08:00" || s.start === "08:30");
    expect(porada).toHaveLength(2);
    expect(porada.every((s) => s.type === "CONSULTATION_BLOCKED")).toBe(true);
    expect(porada.every((s) => !s.bookable)).toBe(true);
  });

  it("12:30 and 13:00 are ECHO_DEPARTMENT_BLOCKED (locked dark blue) and not bookable", () => {
    const echoDept = slots.filter((s) => s.type === "ECHO_DEPARTMENT_BLOCKED");
    expect(echoDept).toHaveLength(2);
    expect(echoDept[0].start).toBe("12:30");
    expect(echoDept[1].start).toBe("13:00");
    expect(echoDept.every((s) => !s.bookable)).toBe(true);
  });

  it("ECHO bookable: 5 slots at 13:30, 13:50, 14:10, 14:40, 15:00 (20-min)", () => {
    const echo = slots.filter((s) => s.type === "ECHO");
    expect(echo).toHaveLength(5);
    expect(echo.map((s) => s.start)).toEqual([
      "13:30",
      "13:50",
      "14:10",
      "14:40",
      "15:00",
    ]);
    expect(echo.every((s) => s.bookable)).toBe(true);
  });

  it("does not include any ACUTE_RESERVE slot", () => {
    const reserve = slots.filter((s) => s.type === "ACUTE_RESERVE");
    expect(reserve).toHaveLength(0);
  });

  it("PRE_HOSPITAL is two slots: 07:00–07:30 and 07:30–08:00", () => {
    const ph = slots.filter((s) => s.type === "PRE_HOSPITAL");
    expect(ph).toHaveLength(2);
    expect(ph.map((s) => s.start)).toEqual(["07:00", "07:30"]);
    expect(ph[0].end).toBe("07:30");
    expect(ph[1].end).toBe("08:00");
    expect(ph.every((s) => s.bookable)).toBe(true);
  });

  it("DISPENSARY block: 9:00–12:30 → 7 slots (last is 12:00–12:30)", () => {
    const disp = slots.filter((s) => s.type === "DISPENSARY");
    expect(disp).toHaveLength(7);
    expect(disp[0].start).toBe("09:00");
    expect(disp[disp.length - 1].start).toBe("12:00");
  });
});
