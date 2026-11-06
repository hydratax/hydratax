import { describe, expect, it } from "vitest";
import {
  currentSaTaxYear,
  filingSaTaxYear,
  saTaxYearFromStartYear,
} from "./sa-tax-year";

describe("saTaxYearFromStartYear", () => {
  it("builds 6 Apr–5 Apr and 31 Jan deadline", () => {
    const y = saTaxYearFromStartYear(2025);
    expect(y.label).toBe("2025-26");
    expect(y.start).toBe("2025-04-06");
    expect(y.end).toBe("2026-04-05");
    expect(y.filingDue).toBe("2027-01-31");
  });
});

describe("currentSaTaxYear / filingSaTaxYear", () => {
  it("treats 6 Nov 2026 as tax year 2026-27 in progress, filing 2025-26", () => {
    const now = new Date(2026, 10, 6, 12);
    expect(currentSaTaxYear(now).label).toBe("2026-27");
    expect(filingSaTaxYear(now).label).toBe("2025-26");
    expect(filingSaTaxYear(now).filingDue).toBe("2027-01-31");
  });
});
