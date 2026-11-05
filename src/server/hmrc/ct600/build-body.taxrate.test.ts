import { describe, expect, it } from "vitest";
import { buildCt600BodyInner } from "@/server/hmrc/ct600/build-body";
import { pence } from "@/server/money/pence";

/** Mirrors the live rejection period (2025-03-01 → 2026-02-28). */
describe("CT600 TaxRate / box 329 XML (live schema)", () => {
  it("emits numeric TaxRate and StartingOrSmallCompaniesRate for small-profits AP", () => {
    // Profit ≈ £208 → small profits / 19%
    const built = buildCt600BodyInner({
      companyName: "Test Co Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      figures: {
        clientId: "x",
        periodStart: "2025-03-01",
        periodEnd: "2026-02-28",
        turnoverPence: pence(2_390_506),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(2_369_702),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
        corporationTaxPence: pence(3953),
      },
      includeAttachments: false,
    });

    const xml = built.bodyInner;
    expect(xml).not.toMatch(/SMALL CO RATE OF CT|FULL RATE OF CT/);
    expect(xml).not.toContain("<ct:Indicator>");
    expect(xml).not.toContain("SmallProfitsRateOrMarginalRelief");
    expect(xml).not.toContain("MarginalRateRelief");
    expect(xml).toMatch(/<ct:TaxRate>19\.00<\/ct:TaxRate>/);
    // Box 329 path per CT-2014-v1-994.xsd
    expect(xml).toContain(
      "<ct:StartingOrSmallCompaniesRate>yes</ct:StartingOrSmallCompaniesRate>",
    );
    expect(xml).toContain("<ct:ThisPeriod>0</ct:ThisPeriod>");
    expect(xml).toContain("<ct:AssociatedCompanies>");
    expect(xml).toContain("<ct:FinancialYearOne>");
    expect(xml).toContain("<ct:FinancialYearTwo>");
    const rates = [...xml.matchAll(/<ct:TaxRate>([^<]+)<\/ct:TaxRate>/g)].map(
      (m) => m[1],
    );
    expect(rates.length).toBeGreaterThanOrEqual(2);
    expect(rates.every((r) => r === "19.00")).toBe(true);
    // FY1 profit must be HMRC half-up round of 315 × days (error 9198)
    const fy1Profit = xml.match(
      /<ct:FinancialYearOne>[\s\S]*?<ct:Profit>([^<]+)<\/ct:Profit>/,
    )?.[1];
    const chargeable = Number(
      xml.match(/<ct:ChargeableProfits>([^<]+)<\/ct:ChargeableProfits>/)?.[1],
    );
    expect(fy1Profit).toBe(Math.round((chargeable * 31) / 365).toFixed(2));
  });

  it("emits 25.00 TaxRate and MarginalReliefForRingFenceTrades in marginal band", () => {
    // £100,000 profit → marginal band
    const built = buildCt600BodyInner({
      companyName: "Mid Co Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      figures: {
        clientId: "x",
        periodStart: "2024-04-01",
        periodEnd: "2025-03-31",
        turnoverPence: pence(10_000_000),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
        corporationTaxPence: pence(2_275_000),
      },
      includeAttachments: false,
    });
    expect(built.bodyInner).toMatch(/<ct:TaxRate>25\.00<\/ct:TaxRate>/);
    expect(built.bodyInner).toContain(
      "<ct:StartingOrSmallCompaniesRate>yes</ct:StartingOrSmallCompaniesRate>",
    );
    expect(built.bodyInner).toContain("MarginalReliefForRingFenceTrades");
    expect(built.bodyInner).not.toContain("MarginalRateRelief");
    expect(built.bodyInner).not.toContain("<ct:Indicator>");
  });

  it("emits 25.00 TaxRate without box 329 for main-rate profits", () => {
    // £300,000 profit → main rate
    const built = buildCt600BodyInner({
      companyName: "Big Co Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      figures: {
        clientId: "x",
        periodStart: "2024-04-01",
        periodEnd: "2025-03-31",
        turnoverPence: pence(30_000_000),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
        corporationTaxPence: pence(7_500_000),
      },
      includeAttachments: false,
    });
    expect(built.bodyInner).toMatch(/<ct:TaxRate>25\.00<\/ct:TaxRate>/);
    expect(built.bodyInner).not.toContain("StartingOrSmallCompaniesRate");
    expect(built.bodyInner).not.toContain("<ct:Indicator>");
  });
});
