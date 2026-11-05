import { describe, expect, it } from "vitest";
import {
  apportionWholePounds,
  computeCt600TaxSchedule,
} from "@/server/hmrc/ct600/tax-schedule";

describe("apportionWholePounds", () => {
  it("sums exactly to the total", () => {
    const parts = apportionWholePounds(10_000, [31, 334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_000);
  });
});

describe("computeCt600TaxSchedule", () => {
  it("uses SMALL CO RATE and tax = profit × 19% for profits ≤ £50k", () => {
    const s = computeCt600TaxSchedule({
      periodStart: "2024-04-01",
      periodEnd: "2025-03-31",
      taxableProfitPence: 5_000_000, // £50,000
    });
    expect(s.band).toBe("small");
    expect(s.chargeableProfitPounds).toBe(50_000);
    expect(s.slices).toHaveLength(1);
    expect(s.slices[0]!.rateXml).toBe("19.00");
    expect(s.slices[0]!.ratePercent).toBe(19);
    expect(s.slices[0]!.taxPence).toBe(50_000 * 19);
    expect(s.netTaxPence).toBe(50_000 * 19);
    expect(s.marginalReliefPence).toBe(0);
    expect(s.claimSmallProfitsOrMarginalRelief).toBe(true);
  });

  it("spans two FYs with profits summing to box 315 and tax = profit × rate", () => {
    // 1 Mar 2025 – 28 Feb 2026 spans FY2024 (to 31 Mar) and FY2025
    const s = computeCt600TaxSchedule({
      periodStart: "2025-03-01",
      periodEnd: "2026-02-28",
      taxableProfitPence: 2_080_000, // £20,800
    });
    expect(s.slices.length).toBe(2);
    expect(
      s.slices.reduce((a, x) => a + x.profitPounds, 0),
    ).toBe(s.chargeableProfitPounds);
    for (const slice of s.slices) {
      expect(slice.taxPence).toBe(slice.profitPounds * slice.ratePercent);
      expect(slice.rateXml).toBe("19.00");
    }
  });

  it("uses FULL RATE rows plus marginal relief in the marginal band", () => {
    const s = computeCt600TaxSchedule({
      periodStart: "2024-04-01",
      periodEnd: "2025-03-31",
      taxableProfitPence: 10_000_000, // £100,000
    });
    expect(s.band).toBe("marginal");
    expect(s.slices[0]!.rateXml).toBe("25.00");
    expect(s.slices[0]!.ratePercent).toBe(25);
    expect(s.grossTaxPence).toBe(100_000 * 25);
    expect(s.marginalReliefPence).toBeGreaterThan(0);
    expect(s.netTaxPence).toBe(s.grossTaxPence - s.marginalReliefPence);
    // £100k → 25% − (250k−100k)×3/200 = 25_000 − 2_250 = 22_750
    expect(s.netTaxPence).toBe(2_275_000);
  });
});
