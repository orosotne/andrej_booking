import { describe, it, expect } from "vitest";
import {
  SLOT_DESIGNATIONS,
  DESIGNATION_LOCK_REASON,
  resolveDesignation,
  designationOf,
  type SlotDesignation,
} from "@/lib/slot-designation";
import type { SlotStatusLit } from "@/lib/slot-engine/types";

const RELEASE = new Date("2027-01-15T06:00:00.000Z");
const avail = { status: "AVAILABLE" as SlotStatusLit, releaseAt: RELEASE };
const locked = { status: "LOCKED" as SlotStatusLit, releaseAt: RELEASE };
const blocked = { status: "BLOCKED" as SlotStatusLit, releaseAt: null };

describe("resolveDesignation — type and colour", () => {
  it("maps every designation to its documented type/colour pair", () => {
    const pairs = SLOT_DESIGNATIONS.map((d) => {
      const t = resolveDesignation(d, avail);
      return [d, t.appointmentType, t.color];
    });
    expect(pairs).toEqual([
      ["PRE_HOSPITAL", "PRE_HOSPITAL", "pink"],
      ["CONSULTATION_BLOCKED", "CONSULTATION_BLOCKED", "grey"],
      ["DISPENSARY", "DISPENSARY", "white"],
      ["ECHO", "ECHO", "blue"],
      ["ECHO_DEPARTMENT_BLOCKED", "ECHO_DEPARTMENT_BLOCKED", "navy"],
      // echo penta is ECHO wearing the yellow PENTA colour, not its own type.
      ["ECHO_PENTA", "ECHO", "yellow"],
    ]);
  });

  it("clears the yellow colour when moving away from echo penta", () => {
    // The UI detects PENTA by colour alone, so a stale "yellow" would keep the
    // watermark on a slot that is no longer penta.
    expect(resolveDesignation("ECHO", { ...avail }).color).toBe("blue");
    expect(resolveDesignation("DISPENSARY", { ...avail }).color).toBe("white");
  });
});

describe("resolveDesignation — status and release window", () => {
  it("keeps an AVAILABLE slot available, with its release time untouched", () => {
    const t = resolveDesignation("PRE_HOSPITAL", avail);
    expect(t.status).toBe("AVAILABLE");
    expect(t.releaseAt).toBe(RELEASE);
    expect(t.manualLock).toBe(false);
  });

  it("keeps a LOCKED slot locked, with its release time untouched", () => {
    const t = resolveDesignation("ECHO", locked);
    expect(t.status).toBe("LOCKED");
    expect(t.releaseAt).toBe(RELEASE);
    expect(t.manualLock).toBe(false);
  });

  it("lands a BLOCKED slot on LOCKED, manually locked and discoverable", () => {
    const t = resolveDesignation("DISPENSARY", blocked);
    expect(t.status).toBe("LOCKED");
    expect(t.releaseAt).toBeNull();
    // manualLock is what puts it in the admin "ručne zamknuté sloty" list.
    expect(t.manualLock).toBe(true);
    expect(t.lockedReason).toBe(DESIGNATION_LOCK_REASON);
  });

  it("forces BLOCKED with no release for porada, from any source status", () => {
    for (const cur of [avail, locked, blocked]) {
      const t = resolveDesignation("CONSULTATION_BLOCKED", cur);
      expect(t.status).toBe("BLOCKED");
      expect(t.releaseAt).toBeNull();
    }
  });

  it("forces BLOCKED with no release for echo oddelenie, from any source", () => {
    for (const cur of [avail, locked, blocked]) {
      const t = resolveDesignation("ECHO_DEPARTMENT_BLOCKED", cur);
      expect(t.status).toBe("BLOCKED");
      expect(t.releaseAt).toBeNull();
    }
  });

  it("forces LOCKED with no release for echo penta, from any source", () => {
    // Penta is reserved capacity: password-only, never released by the cron
    // (releaseDueSlots requires releaseAt != null).
    for (const cur of [avail, locked, blocked]) {
      const t = resolveDesignation("ECHO_PENTA", cur);
      expect(t.status).toBe("LOCKED");
      expect(t.releaseAt).toBeNull();
      expect(t.color).toBe("yellow");
    }
  });
});

describe("designationOf", () => {
  it("splits ECHO on colour", () => {
    expect(designationOf({ appointmentType: "ECHO", color: "yellow" })).toBe(
      "ECHO_PENTA",
    );
    expect(designationOf({ appointmentType: "ECHO", color: "blue" })).toBe("ECHO");
  });

  it("reports the blocked types as themselves", () => {
    expect(
      designationOf({ appointmentType: "CONSULTATION_BLOCKED", color: "grey" }),
    ).toBe("CONSULTATION_BLOCKED");
    expect(
      designationOf({ appointmentType: "ECHO_DEPARTMENT_BLOCKED", color: "navy" }),
    ).toBe("ECHO_DEPARTMENT_BLOCKED");
  });

  it("folds the legacy/loose types onto the nearest designation", () => {
    expect(designationOf({ appointmentType: "ACUTE_RESERVE", color: "orange" })).toBe(
      "PRE_HOSPITAL",
    );
    expect(designationOf({ appointmentType: "CUSTOM", color: "white" })).toBe(
      "DISPENSARY",
    );
  });

  it("round-trips every designation through resolveDesignation", () => {
    for (const d of SLOT_DESIGNATIONS) {
      const t = resolveDesignation(d as SlotDesignation, avail);
      expect(designationOf(t)).toBe(d);
    }
  });
});
