import { describe, expect, it } from "vitest";
import {
  companiesHouseAccountsPeriod,
  corporationTaxAccountingPeriods,
  defaultAccountingReferenceDate,
  twelveMonthCtPeriodEnd,
} from "@/lib/accounting-periods";

describe("Companies House vs CT600 first year", () => {
  it("sets ARD to month-end of the first anniversary", () => {
    expect(defaultAccountingReferenceDate("2025-08-04")).toBe("2026-08-31");
  });

  it("ends the first CT AP 12 months after incorporation", () => {
    expect(twelveMonthCtPeriodEnd("2025-08-04")).toBe("2026-08-04");
  });

  it("uses incorporation → ARD for first-year CH accounts", () => {
    const poa = companiesHouseAccountsPeriod({
      incorporatedOn: "2025-08-04",
      accountsPeriodEnd: "2026-08-31",
      lastAccountsMadeUpTo: null,
    });
    expect(poa).toMatchObject({
      start: "2025-08-04",
      end: "2026-08-31",
      firstYear: true,
    });
  });

  it("splits a long first year into two CT600s (GOV.UK 12-month cap)", () => {
    const aps = corporationTaxAccountingPeriods({
      start: "2025-08-04",
      end: "2026-08-31",
    });
    expect(aps).toHaveLength(2);
    expect(aps[0]).toMatchObject({
      start: "2025-08-04",
      end: "2026-08-04",
      filingDue: "2027-08-31",
    });
    expect(aps[1]).toMatchObject({
      start: "2026-08-05",
      end: "2026-08-31",
      filingDue: "2027-08-31",
    });
  });

  it("does not split a CH period of 12 months or less", () => {
    const aps = corporationTaxAccountingPeriods({
      start: "2026-09-01",
      end: "2027-08-31",
    });
    expect(aps).toHaveLength(1);
    expect(aps[0]).toMatchObject({
      start: "2026-09-01",
      end: "2027-08-31",
    });
  });

  it("starts subsequent CH years the day after last accounts", () => {
    const poa = companiesHouseAccountsPeriod({
      incorporatedOn: "2024-08-04",
      accountsPeriodEnd: "2027-08-31",
      lastAccountsMadeUpTo: "2026-08-31",
    });
    expect(poa).toMatchObject({
      start: "2026-09-01",
      end: "2027-08-31",
      firstYear: false,
    });
  });
});
