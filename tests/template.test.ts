import { describe, it, expect } from "vitest";
import {
  buildDayTemplate,
  pickTemplate,
  rulesFromBlocks,
  TEMPLATE_VERSIONS,
} from "@/lib/slot-engine/template";
import { expandTemplateRules } from "@/lib/slot-engine/reconcile";
import { dateOnly, WEEKDAY } from "@/lib/calendar-date";
import { clinicTime } from "@/lib/format";

const now = dateOnly("2026-11-01");

/** Expands a template version for `iso` into { "HH:MM": release } where the
 * release is "hneď" (opens on generation), a YYYY-MM-DD, or null (never opens
 * by itself — blocked or manual only). */
function releaseByStart(
  version: (typeof TEMPLATE_VERSIONS)[number],
  iso: string,
): Record<string, string | null> {
  return Object.fromEntries(
    expandTemplateRules(rulesFromBlocks(version.blocks), dateOnly(iso), now).map((s) => [
      clinicTime(s.startAt.toISOString()),
      s.releaseAt === null
        ? null
        : s.releaseAt.getTime() === 0
          ? "hneď"
          : s.releaseAt.toISOString().slice(0, 10),
    ]),
  );
}

function versionFor(dayOfWeek: number, validFrom: string | null) {
  const v = TEMPLATE_VERSIONS.find(
    (t) => t.dayOfWeek === dayOfWeek && t.validFrom === validFrom,
  );
  if (!v) throw new Error(`no template version for ${dayOfWeek} from ${validFrom}`);
  return v;
}

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

describe("Wednesday layout (streda otvorená heslom)", () => {
  const slots = buildDayTemplate(WEEKDAY.WED);
  const startsOf = (type: string) => slots.filter((s) => s.type === type).map((s) => s.start);

  it("runs 16 half-hour slots from 07:00, the last one starting at 14:30", () => {
    expect(slots).toHaveLength(16);
    expect(slots[0].start).toBe("07:00");
    expect(slots[slots.length - 1].start).toBe("14:30");
    expect(slots[slots.length - 1].end).toBe("15:00");
  });

  it("is all dispenzár except porada 8:00/8:30 and ECHO oddelenie 12:30/13:00", () => {
    expect(startsOf("CONSULTATION_BLOCKED")).toEqual(["08:00", "08:30"]);
    expect(startsOf("ECHO_DEPARTMENT_BLOCKED")).toEqual(["12:30", "13:00"]);
    expect(startsOf("DISPENSARY")).toEqual([
      "07:00", "07:30", "09:00", "09:30", "10:00", "10:30",
      "11:00", "11:30", "12:00", "13:30", "14:00", "14:30",
    ]);
  });

  it("opens every dispenzár slot on generation, even far ahead", () => {
    const wed = versionFor(WEEKDAY.WED, null);
    expect(releaseByStart(wed, "2027-06-02")).toEqual({
      "07:00": "hneď", "07:30": "hneď",
      "08:00": null, "08:30": null,
      "09:00": "hneď", "09:30": "hneď", "10:00": "hneď", "10:30": "hneď",
      "11:00": "hneď", "11:30": "hneď", "12:00": "hneď",
      "12:30": null, "13:00": null,
      "13:30": "hneď", "14:00": "hneď", "14:30": "hneď",
    });
  });
});

describe("Thursday/Friday until 2027 — dispenzár 9:00, 9:30 and 11:30 open 7 months ahead", () => {
  it("Thursday", () => {
    const r = releaseByStart(versionFor(WEEKDAY.THU, null), "2027-09-02");
    expect(r["09:00"]).toBe("2027-02-02");
    expect(r["09:30"]).toBe("2027-02-02");
    expect(r["11:30"]).toBe("2027-02-02");
    expect(r["12:00"]).toBe("2027-06-02"); // unchanged: 3 months
  });

  it("Friday", () => {
    const r = releaseByStart(versionFor(WEEKDAY.FRI, null), "2027-09-03");
    expect(r["09:00"]).toBe("2027-02-03");
    expect(r["11:30"]).toBe("2027-02-03");
    expect(r["12:00"]).toBe("2027-08-03"); // unchanged: 1 month
  });

  it("ends on 31 Dec 2027, where the 2028 versions take over", () => {
    expect(versionFor(WEEKDAY.THU, null).validTo).toBe("2027-12-31");
    expect(versionFor(WEEKDAY.FRI, null).validTo).toBe("2027-12-31");
  });
});

describe("Thursday/Friday from 2028", () => {
  const shared = {
    "08:00": null, "08:30": null,
    "09:30": "hneď", "10:00": "hneď", "10:30": "hneď",
    "12:30": null, "13:00": null,
    "14:40": "hneď",
  };

  it("Thursday: akútne 3 / 2 weeks, 9:00 three months, 11:00–12:00 seven months, ECHO 15:00 one month", () => {
    expect(releaseByStart(versionFor(WEEKDAY.THU, "2028-01-01"), "2028-03-16")).toEqual({
      ...shared,
      "07:00": "2028-02-24",
      "07:30": "2028-03-02",
      "09:00": "2027-12-16",
      "11:00": "2027-08-16", "11:30": "2027-08-16", "12:00": "2027-08-16",
      "13:30": "2028-03-06", "13:50": "2028-03-06", "14:10": "2028-03-06", // PENTA — 10 days
      "15:00": "2028-02-16",
    });
  });

  it("Friday: same, except 9:00 opens 45 days (1,5 mesiaca) ahead", () => {
    expect(releaseByStart(versionFor(WEEKDAY.FRI, "2028-01-01"), "2028-03-17")).toEqual({
      ...shared,
      "07:00": "2028-02-25",
      "07:30": "2028-03-03",
      "09:00": "2028-02-01",
      "11:00": "2027-08-17", "11:30": "2027-08-17", "12:00": "2027-08-17",
      "13:30": "2028-03-07", "13:50": "2028-03-07", "14:10": "2028-03-07", // PENTA — 10 days
      "15:00": "2028-02-17",
    });
  });

  it("the last Friday of a month gets the ordinary Friday windows", () => {
    const r = releaseByStart(versionFor(WEEKDAY.FRI, "2028-01-01"), "2028-03-31");
    expect(r["09:00"]).toBe("2028-02-15");
    expect(r["10:00"]).toBe("hneď");
    expect(r["11:00"]).toBe("2027-08-31");
  });
});

describe("pickTemplate (the template version valid on a date)", () => {
  const t = (
    id: string,
    dayOfWeek: number,
    validFrom: string | null,
    validTo: string | null,
    isActive = true,
  ) => ({
    id,
    dayOfWeek,
    isActive,
    validFrom: validFrom ? dateOnly(validFrom) : null,
    validTo: validTo ? dateOnly(validTo) : null,
  });
  const templates = [
    t("wed", WEEKDAY.WED, null, null),
    t("thu-2027", WEEKDAY.THU, null, "2027-12-31"),
    t("thu-2028", WEEKDAY.THU, "2028-01-01", null),
    t("fri-off", WEEKDAY.FRI, null, null, false),
  ];

  it("uses the version whose range covers the date", () => {
    expect(pickTemplate(templates, dateOnly("2027-12-30"))?.id).toBe("thu-2027");
    expect(pickTemplate(templates, dateOnly("2028-01-06"))?.id).toBe("thu-2028");
  });

  it("both ends of a range are inclusive", () => {
    // 2027-12-30 and 2028-01-06 are consecutive Thursdays.
    const edge = [
      t("until", WEEKDAY.THU, null, "2027-12-30"),
      t("from", WEEKDAY.THU, "2028-01-06", null),
    ];
    expect(pickTemplate(edge, dateOnly("2027-12-30"))?.id).toBe("until");
    expect(pickTemplate(edge, dateOnly("2028-01-06"))?.id).toBe("from");
  });

  it("an open-ended template covers any date", () => {
    expect(pickTemplate(templates, dateOnly("2031-05-07"))?.id).toBe("wed");
  });

  it("ignores inactive templates and other weekdays", () => {
    expect(pickTemplate(templates, dateOnly("2028-01-07"))).toBeUndefined(); // Friday
    expect(pickTemplate(templates, dateOnly("2028-01-03"))).toBeUndefined(); // Monday
  });

  it("prefers the newest version when ranges overlap", () => {
    const overlapping = [t("old", WEEKDAY.THU, null, null), t("new", WEEKDAY.THU, "2028-01-01", null)];
    expect(pickTemplate(overlapping, dateOnly("2028-02-03"))?.id).toBe("new");
    expect(pickTemplate(overlapping, dateOnly("2027-02-04"))?.id).toBe("old");
  });
});
