import { describe, expect, it } from "vitest";
import {
  loansToParticipatorsRatePercent,
  mainRateFirstYearAllowancePercent,
  mainRateFirstYearAllowancePence,
  zeroEmissionFyaAvailableForExpenditure,
  zeroEmissionFyaBoxesInUseForPeriodStart,
} from "@/server/hmrc/ct600/capital-allowances-rates";
import { ct600FormEditionForPeriod } from "@/server/hmrc/ct600/form-edition";

describe("mainRateFirstYearAllowancePercent", () => {
  it("is 0 before 1 Jan 2026", () => {
    expect(mainRateFirstYearAllowancePercent("2025-12-31")).toBe(0);
  });
  it("is 40% for 2026 spend", () => {
    expect(mainRateFirstYearAllowancePercent("2026-01-01")).toBe(40);
    expect(mainRateFirstYearAllowancePercent("2026-12-31")).toBe(40);
  });
  it("is 50% from 1 Jan 2027", () => {
    expect(mainRateFirstYearAllowancePercent("2027-01-01")).toBe(50);
  });
  it("computes claim pence from spend + date", () => {
    expect(mainRateFirstYearAllowancePence(100_000_00, "2026-06-01")).toBe(
      40_000_00,
    );
    expect(mainRateFirstYearAllowancePence(100_000_00, "2027-02-01")).toBe(
      50_000_00,
    );
  });
});

describe("zero-emission FYA windows (SDS 2027)", () => {
  it("allows expenditure before 1 Apr 2027", () => {
    expect(zeroEmissionFyaAvailableForExpenditure("2027-03-31")).toBe(true);
    expect(zeroEmissionFyaAvailableForExpenditure("2027-04-01")).toBe(false);
  });
  it("hides dedicated boxes for APs starting on/after 1 Apr 2027", () => {
    expect(zeroEmissionFyaBoxesInUseForPeriodStart("2027-03-31")).toBe(true);
    expect(zeroEmissionFyaBoxesInUseForPeriodStart("2027-04-01")).toBe(false);
  });
});

describe("loansToParticipatorsRatePercent", () => {
  it("applies 35.75% from 6 Apr 2026", () => {
    expect(loansToParticipatorsRatePercent("2026-04-05").ratePercent).toBe(
      33.75,
    );
    expect(loansToParticipatorsRatePercent("2026-04-06").ratePercent).toBe(
      35.75,
    );
  });
});

describe("ct600FormEditionForPeriod", () => {
  it("uses 2026 stationery before 1 Apr 2027 AP start", () => {
    expect(ct600FormEditionForPeriod("2026-04-01")).toBe("2026");
    expect(ct600FormEditionForPeriod("2027-03-31")).toBe("2026");
  });
  it("uses 2027 stationery from 1 Apr 2027 AP start", () => {
    expect(ct600FormEditionForPeriod("2027-04-01")).toBe("2027");
  });
});
