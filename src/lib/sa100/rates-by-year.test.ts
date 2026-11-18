import { describe, expect, it } from "vitest";
import { ratesForTaxYear } from "@/lib/sa100/rates-by-year";

describe("ratesForTaxYear — SDS MTR 2026-27 v1.4.0 student loan bands", () => {
  it("keeps 2025-26 thresholds", () => {
    const r = ratesForTaxYear("2025-26");
    expect(r.studentLoanPlan1Threshold).toBe(26_065);
    expect(r.studentLoanPlan2Threshold).toBe(28_470);
    expect(r.studentLoanPlan4Threshold).toBe(32_745);
    expect(r.studentLoanPlan5Threshold).toBe(25_000);
  });

  it("applies 2026-27 SDS SL_limit1/2/4/5", () => {
    const r = ratesForTaxYear("2026-27");
    expect(r.studentLoanPlan1Threshold).toBe(26_900);
    expect(r.studentLoanPlan2Threshold).toBe(29_385);
    expect(r.studentLoanPlan4Threshold).toBe(33_795);
    expect(r.studentLoanPlan5Threshold).toBe(25_000);
    expect(r.dividendBasic).toBe(0.1075);
    expect(r.class2Weekly).toBe(3.65);
  });
});
