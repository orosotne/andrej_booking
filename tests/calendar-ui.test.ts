import { describe, it, expect } from "vitest";
import { nextWorkingDay } from "@/lib/calendar-ui";

// Reference week (UTC): 2026-06-01 Mon, 02 Tue, 03 Wed, 04 Thu, 05 Fri,
// 06 Sat, 07 Sun, 08 Mon ... Clinic works Wed/Thu/Fri only.
describe("nextWorkingDay", () => {
  it("steps forward Wed → Thu → Fri", () => {
    expect(nextWorkingDay("2026-06-03", 1)).toBe("2026-06-04");
    expect(nextWorkingDay("2026-06-04", 1)).toBe("2026-06-05");
  });

  it("wraps forward from Fri to next week's Wed (skips Sat–Tue)", () => {
    expect(nextWorkingDay("2026-06-05", 1)).toBe("2026-06-10");
  });

  it("steps back Fri → Thu → Wed", () => {
    expect(nextWorkingDay("2026-06-05", -1)).toBe("2026-06-04");
    expect(nextWorkingDay("2026-06-04", -1)).toBe("2026-06-03");
  });

  it("wraps back from Wed to previous week's Fri (skips Tue–Sat)", () => {
    expect(nextWorkingDay("2026-06-03", -1)).toBe("2026-05-29");
  });

  it("from a non-working day lands on the nearest working day in that direction", () => {
    // 2026-06-06 is Saturday.
    expect(nextWorkingDay("2026-06-06", -1)).toBe("2026-06-05"); // back → Fri
    expect(nextWorkingDay("2026-06-06", 1)).toBe("2026-06-10"); // fwd → Wed
  });
});
