import { describe, expect, it } from "vitest";
import {
  bookingColor,
  bookingShape,
  birthYearShort,
  leadTimeDays,
} from "@/lib/booking-mark";

describe("leadTimeDays / bookingShape", () => {
  it("counts whole days between booking creation and the slot", () => {
    expect(leadTimeDays("2026-01-01T10:00:00Z", "2026-01-11T08:00:00Z")).toBe(9);
    expect(leadTimeDays("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z")).toBe(0);
  });

  it("maps lead time to a circle shape", () => {
    expect(bookingShape(0)).toBe("quarter");
    expect(bookingShape(99)).toBe("quarter");
    expect(bookingShape(100)).toBe("half");
    expect(bookingShape(250)).toBe("half");
    expect(bookingShape(251)).toBe("full");
  });
});

describe("bookingColor", () => {
  it("follows the patient category", () => {
    expect(bookingColor("AKUTNE", "DISPENSARY")).toBe("red");
    expect(bookingColor("DISPENZAR", "DISPENSARY")).toBe("green");
    expect(bookingColor("PRVOVYSETRENIE", "DISPENSARY")).toBe("green");
    expect(bookingColor("ECHO", "ECHO")).toBe("blue");
  });

  it("falls back to the slot type when the category is missing or 'Iné'", () => {
    expect(bookingColor(null, "PRE_HOSPITAL")).toBe("red");
    expect(bookingColor(null, "ACUTE_RESERVE")).toBe("red");
    expect(bookingColor("INE", "DISPENSARY")).toBe("green");
    expect(bookingColor(null, "ECHO")).toBe("blue");
    expect(bookingColor(null, "CUSTOM")).toBe("gray");
  });
});

describe("birthYearShort", () => {
  it("uses the birth year when present", () => {
    expect(birthYearShort(1946, null)).toBe("46");
    expect(birthYearShort(2003, "0301011234")).toBe("03");
  });

  it("falls back to the first two digits of the national id", () => {
    expect(birthYearShort(null, "8432570011")).toBe("84");
    expect(birthYearShort(null, "845257/0011")).toBe("84");
    expect(birthYearShort(null, null)).toBeNull();
    expect(birthYearShort(null, "x")).toBeNull();
  });
});
