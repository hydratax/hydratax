import { describe, expect, it } from "vitest";
import {
  formatMissingMonthsSummary,
  formatMissingPeriodPhrase,
  formatMissingPeriodPhraseForAccounts,
  missingBankMonthsByTaxYear,
  missingBankMonthsInPeriod,
  missingMonthsForTaxYearLabel,
} from "./missing-statement-months";

describe("missingBankMonthsByTaxYear", () => {
  it("flags months with no lines up to today within a tax year", () => {
    // 2025–26: 6 Apr 2025 → 5 Apr 2026. Freeze “today” mid year.
    const now = new Date("2025-09-15T12:00:00Z");
    const rows = missingBankMonthsByTaxYear(
      ["2025-04-10", "2025-06-01", "2025-06-20"],
      now,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.taxYear).toBe("2025-26");
    expect(rows[0]!.coveredMonths).toEqual(["Apr 2025", "Jun 2025"]);
    expect(rows[0]!.missingMonths).toEqual([
      "May 2025",
      "Jul 2025",
      "Aug 2025",
      "Sep 2025",
    ]);
  });

  it("does not treat future months after today as missing", () => {
    const now = new Date("2025-05-10T12:00:00Z");
    const rows = missingBankMonthsByTaxYear(["2025-04-20"], now);
    expect(rows[0]!.missingMonths).toEqual(["May 2025"]);
    expect(rows[0]!.coveredMonths).toEqual(["Apr 2025"]);
  });

  it("summarises multiple tax years", () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const summary = formatMissingMonthsSummary(
      missingBankMonthsByTaxYear(
        ["2025-04-06", "2026-04-10"],
        now,
      ),
    );
    expect(summary).toContain("2025-26");
    expect(summary).toContain("2026-27");
    expect(summary).toMatch(/missing/i);
  });
});

describe("missingMonthsForTaxYearLabel", () => {
  it("lists all months to date when the year has no lines", () => {
    const now = new Date("2025-06-20T12:00:00Z");
    const row = missingMonthsForTaxYearLabel("2025-26", [], now);
    expect(row?.coveredMonths).toEqual([]);
    expect(row?.missingMonths).toEqual([
      "Apr 2025",
      "May 2025",
      "Jun 2025",
    ]);
  });
});

describe("formatMissingPeriodPhrase", () => {
  it("uses 06 April start and end-of-month last day", () => {
    const now = new Date("2025-03-15T12:00:00Z");
    const row = missingMonthsForTaxYearLabel(
      "2024-25",
      ["2025-03-01"],
      now,
    );
    expect(row).not.toBeNull();
    // Covered Mar 2025 only → missing Apr 2024 … Feb 2025
    const phrase = formatMissingPeriodPhrase(row!);
    expect(phrase).toBe(
      "Bank statements missing from 06 April 2024 to 28 Feb 2025",
    );
  });

  it("caps the tax-year end month at 5 April", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const row = missingMonthsForTaxYearLabel(
      "2025-26",
      ["2025-05-01"],
      now,
    );
    expect(row).not.toBeNull();
    expect(row!.missingMonths.at(-1)).toBe("Apr 2026");
    const phrase = formatMissingPeriodPhrase(row!);
    expect(phrase).toMatch(/to 05 Apr 2026$/);
  });
});

describe("missingBankMonthsInPeriod", () => {
  it("flags missing months in a company accounts year", () => {
    const now = new Date("2025-06-15T12:00:00Z");
    const row = missingBankMonthsInPeriod(
      ["2024-04-10", "2024-06-01"],
      "2024-04-01",
      "2025-03-31",
      now,
    );
    expect(row?.coveredMonths).toEqual(["Apr 2024", "Jun 2024"]);
    expect(row?.missingMonths[0]).toBe("May 2024");
    const phrase = formatMissingPeriodPhraseForAccounts(row!, "2024-04-01");
    expect(phrase).toBe(
      "Bank statements missing from 01 May 2024 to 31 Mar 2025",
    );
  });
});
