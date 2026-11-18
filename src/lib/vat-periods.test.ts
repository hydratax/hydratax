import { describe, expect, it } from "vitest";
import {
  clampPeriodsToRegistration,
  formatCalendarQuarterLabel,
  formatPeriodRange,
  formatVatPeriodLabel,
  generateVatPeriods,
  isInPeriod,
  latestVatPeriodWindowStart,
  makeVatPeriod,
  nextVatPeriodAfter,
  periodsFromCustomQuarter,
  periodsFromRegistrationDate,
  sliceVatPeriodWindow,
} from "./vat-periods";

describe("generateVatPeriods", () => {
  it("rolls forward 5 quarterly periods from a custom quarter end", () => {
    const periods = generateVatPeriods("2026-03-31", 5);
    expect(periods).toHaveLength(5);
    expect(periods[0]).toMatchObject({
      start: "2026-01-01",
      end: "2026-03-31",
      status: "O",
    });
    expect(periods[1]).toMatchObject({
      start: "2026-04-01",
      end: "2026-06-30",
    });
    expect(periods[2]).toMatchObject({
      start: "2026-07-01",
      end: "2026-09-30",
    });
    expect(periods[3]).toMatchObject({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(periods[4]).toMatchObject({
      start: "2027-01-01",
      end: "2027-03-31",
    });
    // Due = 7th of second month after period end (online)
    expect(periods[0]!.due).toBe("2026-05-07");
  });

  it("handles non-calendar stagger (e.g. Feb quarter end)", () => {
    const periods = generateVatPeriods("2026-02-28", 2);
    expect(periods[0]).toMatchObject({
      start: "2025-12-01",
      end: "2026-02-28",
    });
    expect(periods[1]).toMatchObject({
      start: "2026-03-01",
      end: "2026-05-31",
    });
  });
});

describe("isInPeriod / formatPeriodRange", () => {
  it("checks inclusive date bounds", () => {
    expect(isInPeriod("2026-01-01", "2026-01-01", "2026-03-31")).toBe(true);
    expect(isInPeriod("2026-03-31", "2026-01-01", "2026-03-31")).toBe(true);
    expect(isInPeriod("2026-04-01", "2026-01-01", "2026-03-31")).toBe(false);
  });

  it("formats a GB range", () => {
    expect(formatPeriodRange("2026-01-01", "2026-03-31")).toMatch(/Jan/);
  });
});

describe("clampPeriodsToRegistration", () => {
  it("drops periods ending before registration and clamps the first start", () => {
    const periods = generateVatPeriods("2026-03-31", 3);
    const clamped = clampPeriodsToRegistration(periods, "2026-02-15");
    expect(clamped).toHaveLength(3);
    expect(clamped[0]!.start).toBe("2026-02-15");
    expect(clamped[0]!.end).toBe("2026-03-31");
  });

  it("drops fully pre-registration quarters", () => {
    const periods = generateVatPeriods("2025-12-31", 3);
    const clamped = clampPeriodsToRegistration(periods, "2026-04-01");
    expect(clamped.every((p) => p.end >= "2026-04-01")).toBe(true);
    expect(clamped[0]!.start).toBe("2026-04-01");
  });
});

describe("formatCalendarQuarterLabel", () => {
  it("labels calendar quarters from the period end date", () => {
    expect(formatCalendarQuarterLabel("2026-01-01", "2026-03-31")).toBe(
      "2026 Quarter 1",
    );
    expect(formatCalendarQuarterLabel("2025-10-01", "2025-12-31")).toBe(
      "2025 Quarter 4",
    );
    expect(formatCalendarQuarterLabel("2026-04-01", "2026-06-30")).toBe(
      "2026 Quarter 2",
    );
    expect(formatCalendarQuarterLabel("2026-07-01", "2026-09-30")).toBe(
      "2026 Quarter 3",
    );
  });
});

describe("periodsFromRegistrationDate", () => {
  it("seeds a full 3-month stagger from the registration month", () => {
    const periods = periodsFromRegistrationDate("2025-03-01", 4);
    expect(periods).toHaveLength(4);
    expect(periods[0]).toMatchObject({
      start: "2025-03-01",
      end: "2025-05-31",
    });
    expect(periods[1]).toMatchObject({
      start: "2025-06-01",
      end: "2025-08-31",
    });
    expect(periods[2]).toMatchObject({
      start: "2025-09-01",
      end: "2025-11-30",
    });
    expect(periods[3]).toMatchObject({
      start: "2025-12-01",
      end: "2026-02-28",
    });
  });

  it("clamps only the first start when registration is mid-month", () => {
    const periods = periodsFromRegistrationDate("2026-02-15", 2);
    expect(periods[0]).toMatchObject({
      start: "2026-02-15",
      end: "2026-04-30",
    });
    expect(periods[1]).toMatchObject({
      start: "2026-05-01",
      end: "2026-07-31",
    });
  });

  it("starts a full quarter when registration is 1 Apr", () => {
    const periods = periodsFromRegistrationDate("2026-04-01", 2);
    expect(periods[0]).toMatchObject({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });
});

describe("formatVatPeriodLabel", () => {
  it("keeps calendar quarter titles for exact Jan–Mar style periods", () => {
    expect(formatVatPeriodLabel("2025-04-01", "2025-06-30")).toBe(
      "2025 Quarter 2",
    );
  });

  it("uses quarter-ending labels for registration staggers", () => {
    expect(formatVatPeriodLabel("2025-03-01", "2025-05-31")).toMatch(
      /Quarter ending May 2025/i,
    );
  });
});

describe("nextVatPeriodAfter", () => {
  it("appends the next calendar quarter", () => {
    expect(nextVatPeriodAfter("2026-03-31")).toMatchObject({
      start: "2026-04-01",
      end: "2026-06-30",
      periodKey: "26Q2",
    });
    expect(nextVatPeriodAfter("2026-12-31")).toMatchObject({
      start: "2027-01-01",
      end: "2027-03-31",
      periodKey: "27Q1",
    });
  });

  it("preserves custom month span from the previous period", () => {
    expect(nextVatPeriodAfter("2025-04-30", "2025-02-15")).toMatchObject({
      start: "2025-05-01",
      end: "2025-07-31",
    });
  });
});

describe("periodsFromCustomQuarter", () => {
  it("rolls following quarters from a custom first period", () => {
    const periods = periodsFromCustomQuarter("2025-02-01", "2025-04-30", 3);
    expect(periods[0]).toMatchObject(makeVatPeriod("2025-02-01", "2025-04-30"));
    expect(periods[1]).toMatchObject({
      start: "2025-05-01",
      end: "2025-07-31",
    });
    expect(periods[2]).toMatchObject({
      start: "2025-08-01",
      end: "2025-10-31",
    });
  });
});

describe("sliceVatPeriodWindow", () => {
  it("shows the latest four by default window start", () => {
    const periods = generateVatPeriods("2026-03-31", 6);
    const start = latestVatPeriodWindowStart(periods.length);
    expect(start).toBe(2);
    const visible = sliceVatPeriodWindow(periods, start);
    expect(visible).toHaveLength(4);
    expect(visible[0]).toMatchObject({ start: "2026-07-01" });
    expect(visible[3]).toMatchObject({ end: "2027-06-30" });
  });

  it("can page back to earlier quarters", () => {
    const periods = generateVatPeriods("2026-03-31", 6);
    const visible = sliceVatPeriodWindow(periods, 0);
    expect(visible[0]).toMatchObject({ start: "2026-01-01" });
    expect(visible).toHaveLength(4);
  });
});
