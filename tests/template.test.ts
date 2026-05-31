import { describe, it, expect } from "vitest";
import { buildDayTemplate } from "@/lib/slot-engine/template";

describe("buildDayTemplate", () => {
  const slots = buildDayTemplate();

  it("produces 17 default 30-minute slots", () => {
    expect(slots).toHaveLength(17);
  });

  it("starts at 07:00 and ends at 15:30", () => {
    expect(slots[0].start).toBe("07:00");
    expect(slots[slots.length - 1].end).toBe("15:30");
  });

  it("08:00 and 08:30 are CONSULTATION_BLOCKED and not bookable", () => {
    const poradna = slots.filter((s) => s.start === "08:00" || s.start === "08:30");
    expect(poradna).toHaveLength(2);
    expect(poradna.every((s) => s.type === "CONSULTATION_BLOCKED")).toBe(true);
    expect(poradna.every((s) => !s.bookable)).toBe(true);
  });

  it("12:30–14:30 are all ECHO (4 slots)", () => {
    const echo = slots.filter((s) => s.type === "ECHO");
    expect(echo).toHaveLength(4);
    expect(echo[0].start).toBe("12:30");
    expect(echo[echo.length - 1].end).toBe("14:30");
  });

  it("includes one ACUTE_RESERVE slot at 15:00", () => {
    const reserve = slots.filter((s) => s.type === "ACUTE_RESERVE");
    expect(reserve).toHaveLength(1);
    expect(reserve[0].start).toBe("15:00");
  });

  it("adds the 15:30–16:00 slot when extraLateSlot is enabled", () => {
    const withLate = buildDayTemplate({ extraLateSlot: true });
    expect(withLate).toHaveLength(18);
    expect(withLate[withLate.length - 1].end).toBe("16:00");
  });
});
