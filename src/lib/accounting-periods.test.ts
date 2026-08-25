import { describe, expect, it } from "vitest";
import {
  companiesHouseAccountsPeriod,
  corporationTaxAccountingPeriods,
  defaultAccountingReferenceDate,
  listCorporationTaxPeriodsSinceIncorporation,
  twelveMonthCtPeriodEnd,
} from "@/lib/accounting-periods";

describe("Companies House vs CT600 first year", () => {
  it("sets ARD to month-end of the first anniversary", () => {
    expect(defaultAccountingReferenceDate("2025-08-04")).toBe("2026-08-31");
    expect(defaultAccountingReferenceDate("2024-02-02")).toBe("2025-02-28");
  });

  it("ends the first CT AP the day before the anniversary", () => {
    expect(twelveMonthCtPeriodEnd("2025-08-04")).toBe("2026-08-03");
    expect(twelveMonthCtPeriodEnd("2024-02-02")).toBe("2025-02-01");
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

  it("splits a long first year into two CT600s (user / GOV.UK 12-month cap)", () => {
    const aps = corporationTaxAccountingPeriods({
      start: "2024-02-02",
      end: "2025-02-28",
      firstYear: true,
    });
    expect(aps).toHaveLength(2);
    expect(aps[0]).toMatchObject({
      start: "2024-02-02",
      end: "2025-02-01",
      filingDue: "2026-02-28",
    });
    expect(aps[1]).toMatchObject({
      start: "2025-02-02",
      end: "2025-02-28",
      filingDue: "2026-02-28",
    });
  });

  it("does not split a CH period of 12 months or less", () => {
    const aps = corporationTaxAccountingPeriods({
      start: "2025-03-01",
      end: "2026-02-28",
      firstYear: false,
    });
    expect(aps).toHaveLength(1);
    expect(aps[0]).toMatchObject({
      start: "2025-03-01",
      end: "2026-02-28",
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

  it("lists CT periods from incorporation through subsequent years", () => {
    const periods = listCorporationTaxPeriodsSinceIncorporation({
      incorporatedOn: "2024-02-02",
      yearsAhead: 0,
    });
    expect(periods[0]).toMatchObject({
      start: "2024-02-02",
      end: "2025-02-01",
    });
    expect(periods[1]).toMatchObject({
      start: "2025-02-02",
      end: "2025-02-28",
    });
    const fullYear = periods.find(
      (p) => p.start === "2025-03-01" && p.end === "2026-02-28",
    );
    expect(fullYear).toBeTruthy();
  });
});
