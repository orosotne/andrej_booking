import { describe, it, expect } from "vitest";
import {
  establishedFrom,
  isEstablishedPatientSlot,
  isNewPatient,
} from "@/lib/new-patient-rule";

// Instants are UTC; the clinic runs on Europe/Bratislava (CET +1 / CEST +2).
const disp = (startAt: string) => ({ appointmentType: "DISPENSARY", startAt });

describe("isEstablishedPatientSlot", () => {
  it("is the Thursday/Friday 12:00 dispenzár until 2027", () => {
    expect(isEstablishedPatientSlot(disp("2027-03-04T11:00:00.000Z"))).toBe(true); // Thu 12:00 CET
    expect(isEstablishedPatientSlot(disp("2027-07-02T10:00:00.000Z"))).toBe(true); // Fri 12:00 CEST
    expect(isEstablishedPatientSlot(disp("2026-11-05T11:00:00.000Z"))).toBe(true); // Thu 12:00, still 2026
  });

  it("is the 9:00 dispenzár from 2028", () => {
    expect(isEstablishedPatientSlot(disp("2028-03-16T08:00:00.000Z"))).toBe(true); // Thu 9:00 CET
    expect(isEstablishedPatientSlot(disp("2028-03-17T08:00:00.000Z"))).toBe(true); // Fri 9:00 CET
    // From 2028 the 12:00 slot is an ordinary one.
    expect(isEstablishedPatientSlot(disp("2028-03-16T11:00:00.000Z"))).toBe(false);
    // …and until 2027 the 9:00 one is.
    expect(isEstablishedPatientSlot(disp("2027-03-04T08:00:00.000Z"))).toBe(false);
  });

  it("switches exactly on 1 January 2028", () => {
    // 2027-12-31 is a Friday, 2028-01-06 a Thursday.
    expect(isEstablishedPatientSlot(disp("2027-12-31T11:00:00.000Z"))).toBe(true);
    expect(isEstablishedPatientSlot(disp("2028-01-06T08:00:00.000Z"))).toBe(true);
  });

  it("ignores other times, other weekdays and other slot types", () => {
    expect(isEstablishedPatientSlot(disp("2027-03-04T10:30:00.000Z"))).toBe(false); // Thu 11:30
    expect(isEstablishedPatientSlot(disp("2027-03-03T11:00:00.000Z"))).toBe(false); // Wednesday 12:00
    expect(
      isEstablishedPatientSlot({ appointmentType: "ECHO", startAt: "2027-03-04T11:00:00.000Z" }),
    ).toBe(false);
    expect(
      isEstablishedPatientSlot({
        appointmentType: "PRE_HOSPITAL",
        startAt: new Date("2027-03-04T11:00:00.000Z"),
      }),
    ).toBe(false);
  });
});

describe("isNewPatient (10 clinic calendar days)", () => {
  const registered = "2026-10-14T13:00:00.000Z"; // 14 Oct, 15:00 CEST

  it("is new until the 10th day after registration", () => {
    expect(isNewPatient(registered, new Date("2026-10-14T14:00:00.000Z"))).toBe(true);
    expect(isNewPatient(registered, new Date("2026-10-23T20:00:00.000Z"))).toBe(true); // 23 Oct 22:00
  });

  it("is established from the 10th day on, whatever the hour", () => {
    expect(establishedFrom(registered)).toBe("2026-10-24");
    expect(isNewPatient(registered, new Date("2026-10-24T05:00:00.000Z"))).toBe(false); // 24 Oct 07:00
    expect(isNewPatient(registered, new Date("2027-01-01T10:00:00.000Z"))).toBe(false);
  });

  it("counts registration days in clinic time, not UTC", () => {
    // 13 Oct 22:30 UTC is already 14 Oct 00:30 in Bratislava.
    const lateNight = new Date("2026-10-13T22:30:00.000Z");
    expect(establishedFrom(lateNight)).toBe("2026-10-24");
    expect(isNewPatient(lateNight, new Date("2026-10-23T12:00:00.000Z"))).toBe(true);
  });
});
