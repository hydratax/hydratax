import { describe, expect, it } from "vitest";
import { mapBankToVatBoxes, vatFraction } from "./vat-box-map";

describe("mapBankToVatBoxes", () => {
  it("maps standard-rated sales to Box 1 + Box 6", () => {
    const result = mapBankToVatBoxes([
      { category: "turnover", amountPence: 120_00, dated: "2026-01-15" },
    ]);
    expect(Number(result.boxes.vatDueSales)).toBe(20_00);
    expect(Number(result.boxes.totalValueSalesExVAT)).toBe(100_00);
    expect(Number(result.boxes.totalVatDue)).toBe(20_00);
    expect(Number(result.boxes.netVatDue)).toBe(20_00);
  });

  it("maps standard-rated purchases to Box 4 + Box 7", () => {
    const result = mapBankToVatBoxes([
      { category: "accountancy", amountPence: -120_00, dated: "2026-02-01" },
    ]);
    expect(Number(result.boxes.vatReclaimedCurrPeriod)).toBe(20_00);
    expect(Number(result.boxes.totalValuePurchasesExVAT)).toBe(100_00);
    expect(Number(result.boxes.netVatDue)).toBe(20_00);
  });

  it("excludes salaries and transfers from VAT boxes", () => {
    const result = mapBankToVatBoxes([
      { category: "salaries", amountPence: -3000_00, dated: "2026-01-28" },
      { category: "transfer", amountPence: -500_00, dated: "2026-01-29" },
      { category: "turnover", amountPence: 120_00, dated: "2026-01-30" },
    ]);
    expect(result.outsideScopeLineCount).toBe(2);
    expect(Number(result.boxes.vatDueSales)).toBe(20_00);
    expect(Number(result.boxes.vatReclaimedCurrPeriod)).toBe(0);
  });

  it("nets sales against purchases for Box 5", () => {
    const result = mapBankToVatBoxes([
      { category: "turnover", amountPence: 1200_00, dated: "2026-03-01" },
      { category: "cost_of_sales", amountPence: -240_00, dated: "2026-03-02" },
    ]);
    // Output VAT 200, input VAT 40 → net 160
    expect(Number(result.boxes.vatDueSales)).toBe(200_00);
    expect(Number(result.boxes.vatReclaimedCurrPeriod)).toBe(40_00);
    expect(Number(result.boxes.netVatDue)).toBe(160_00);
  });

  it("respects reduced-rate override", () => {
    const result = mapBankToVatBoxes(
      [{ category: "turnover", amountPence: 105_00, dated: "2026-04-01" }],
      { turnover: "reduced" },
    );
    expect(Number(result.boxes.vatDueSales)).toBe(5_00);
    expect(Number(result.boxes.totalValueSalesExVAT)).toBe(100_00);
  });

  it("honours explicit purchase allocate even when the bank line is money-in", () => {
    const result = mapBankToVatBoxes(
      [
        { category: "turnover", amountPence: 120_00, dated: "2026-01-10" },
        { category: "consultancy", amountPence: 120_00, dated: "2026-01-11" },
        { category: "expense_queries", amountPence: -100_00, dated: "2026-01-12" },
      ],
      { consultancy: "standard", expense_queries: "zero" },
      { consultancy: "input", expense_queries: "input" },
    );
    expect(Number(result.boxes.vatDueSales)).toBe(20_00);
    expect(Number(result.boxes.vatReclaimedCurrPeriod)).toBe(20_00);
    expect(Number(result.boxes.totalValuePurchasesExVAT)).toBe(200_00);
  });
});

describe("vatFraction", () => {
  it("uses HMRC inclusive fractions", () => {
    expect(vatFraction("standard")).toBeCloseTo(1 / 6, 10);
    expect(vatFraction("reduced")).toBeCloseTo(1 / 21, 10);
    expect(vatFraction("zero")).toBe(0);
  });
});
