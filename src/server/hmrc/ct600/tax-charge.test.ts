import { describe, expect, it } from "vitest";
import { computeTaxChargePence } from "@/server/hmrc/ct600/tax-charge";

describe("computeTaxChargePence", () => {
  it("uses 19% small profits rate under £50,000", () => {
    // £208.00 → £39.52 → 3952 pence
    expect(computeTaxChargePence(20800)).toBe(3952);
    expect(computeTaxChargePence(5_000_000)).toBe(950_000);
  });

  it("uses 25% above £250,000", () => {
    expect(computeTaxChargePence(25_000_000)).toBe(6_250_000);
  });

  it("applies marginal relief between the limits", () => {
    // £100,000: 25% = 25,000; MR = (250k-100k)×3/200 = 2,250; tax = 22,750
    expect(computeTaxChargePence(10_000_000)).toBe(2_275_000);
  });

  it("returns 0 for non-positive profits", () => {
    expect(computeTaxChargePence(0)).toBe(0);
    expect(computeTaxChargePence(-100)).toBe(0);
  });
});
