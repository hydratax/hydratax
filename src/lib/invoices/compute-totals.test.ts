import { describe, expect, it } from "vitest";
import { computeInvoiceTotals } from "./compute-totals";

describe("computeInvoiceTotals", () => {
  it("sums net + vat with no extras", () => {
    const t = computeInvoiceTotals({
      lineNetPence: 10_000,
      lineVatPence: 2_000,
    });
    expect(t.totalPence).toBe(12_000);
  });

  it("applies percent discount off net", () => {
    const t = computeInvoiceTotals({
      lineNetPence: 10_000,
      lineVatPence: 2_000,
      discountPercentBps: 1_000, // 10%
    });
    expect(t.discountPence).toBe(1_000);
    expect(t.totalPence).toBe(11_000);
  });

  it("adds shipping and adjustment", () => {
    const t = computeInvoiceTotals({
      lineNetPence: 10_000,
      lineVatPence: 0,
      shippingPence: 500,
      adjustmentPence: -200,
    });
    expect(t.totalPence).toBe(10_300);
  });
});
