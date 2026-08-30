import { describe, expect, it } from "vitest";
import {
  attachmentsXml,
  buildCt600Attachments,
  prepareIxbrlForEmbed,
} from "@/server/hmrc/ct600/attachments";
import { buildCt600BodyInner } from "@/server/hmrc/ct600/build-body";
import { pence } from "@/server/money/pence";

describe("CT600 attachments", () => {
  it("wraps iXBRL in CT/5 XBRLsubmission structure", () => {
    const attachments = buildCt600Attachments({
      companyName: "Test Co Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      figures: {
        clientId: "x",
        periodStart: "2024-03-01",
        periodEnd: "2025-02-28",
        turnoverPence: pence(0),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(100),
        profitAndLossAccountPence: pence(0),
      },
      taxableProfitPence: 0,
      taxChargePence: 0,
      declarantName: "Director Name",
      declarantStatus: "Director",
    });
    const xml = attachmentsXml(attachments);
    expect(xml).toContain("<ct:AttachedFiles><ct:XBRLsubmission>");
    expect(xml).toContain('<ct:EncodedInlineXBRLDocument Filename="computations.html">');
    expect(xml).toContain('<ct:EncodedInlineXBRLDocument Filename="accounts.html" entryPoint="yes">');
    expect(xml).not.toContain("<DocumentType>");
    expect(xml).not.toContain("<ContentEncoding>");
  });

  it("strips XML declaration before base64 embed", () => {
    const stripped = prepareIxbrlForEmbed('<?xml version="1.0"?><html></html>');
    expect(stripped).toBe("<html></html>");
  });

  it("builds schema-correct CT600 body with attachment flags", () => {
    const built = buildCt600BodyInner({
      companyName: "Hydra Consultancy Services Ltd",
      companyNumber: "14633422",
      utr: "8612814429",
      figures: {
        clientId: "x",
        periodStart: "2024-03-01",
        periodEnd: "2025-02-28",
        turnoverPence: pence(0),
        costOfSalesPence: pence(0),
        administrativeExpensesPence: pence(0),
        otherIncomePence: pence(0),
        tangibleAssetsPence: pence(0),
        cashAtBankPence: pence(0),
        debtorsPence: pence(0),
        creditorsPence: pence(0),
        calledUpShareCapitalPence: pence(0),
        profitAndLossAccountPence: pence(0),
      },
      declarantName: "HAIDERI, Zahra",
      declarantStatus: "Director",
    });
    expect(built.bodyInner).toContain("<ct:PeriodEnd>2025-02-28</ct:PeriodEnd>");
    expect(built.bodyInner).toContain("<ct:Sender>Company</ct:Sender>");
    expect(built.bodyInner).not.toContain("<Principal>");
    expect(built.bodyInner).not.toContain("<SMEclaim>");
    expect(built.bodyInner).toContain("<ct:CompanyType>00</ct:CompanyType>");
    expect(built.bodyInner).toContain("<ct:FinancialYearOne>");
    expect(built.bodyInner).toContain("<ct:ThisPeriodAccounts>yes</ct:ThisPeriodAccounts>");
    expect(built.bodyInner).toContain("<ct:ThisPeriodComputations>yes</ct:ThisPeriodComputations>");
    expect(built.bodyInner).toContain("<ct:CompanyTaxCalculation>");
    expect(built.bodyInner).toContain("<ct:Declaration>");
    expect(built.bodyInner).not.toContain("<ReturnInfoBody>");
    expect(built.bodyInner).not.toContain("<TangibleAssets>");
    expect(built.attachments).toHaveLength(2);
  });
});
