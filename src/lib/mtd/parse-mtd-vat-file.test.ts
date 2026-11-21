import { describe, expect, it } from "vitest";
import { parseMtdVatFileText } from "./parse-mtd-vat-file";

describe("parseMtdVatFileText", () => {
  it("parses labelled CSV rows", () => {
    const res = parseMtdVatFileText(`Box 1,120.00
Box 4,40.00
Box 6,600.00
Box 7,200.00`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.boxes.vatDueSales).toBe(120);
    expect(res.boxes.vatReclaimedCurrPeriod).toBe(40);
    expect(res.boxes.totalVatDue).toBe(120);
    expect(res.boxes.netVatDue).toBe(80);
  });

  it("parses TaxMan key=value lines", () => {
    const res = parseMtdVatFileText(`1=VAT
4=200.00
7=50.00
9=1000.00`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.boxes.vatDueSales).toBe(200);
    expect(res.boxes.vatReclaimedCurrPeriod).toBe(50);
    expect(res.boxes.totalValueSalesExVAT).toBe(1000);
  });

  it("parses JSON box keys", () => {
    const res = parseMtdVatFileText(
      JSON.stringify({ box1: 10, box4: 3, box6: 50 }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.boxes.vatDueSales).toBe(10);
    expect(res.boxes.vatReclaimedCurrPeriod).toBe(3);
  });
});
