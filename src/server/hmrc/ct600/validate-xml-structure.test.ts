import { describe, expect, it } from "vitest";
import { buildCt600Package } from "@/server/hmrc/ct600/build-envelope";
import { validateCt600XmlStructure } from "@/server/hmrc/ct600/validate-xml-structure";
import type { Ct600PackageInput } from "@/server/hmrc/ct600/types";
import { pence } from "@/server/money/pence";

const hydraDormant: Ct600PackageInput = {
  companyName: "HYDRA CONSULTANCY SERVICES LTD",
  companyNumber: "14633422",
  utr: "8612814429",
  figures: {
    clientId: "00000000-0000-0000-0000-000000000001",
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
  questionnaire: {
    period_dates: true,
    accounts_attached: true,
    computations_attached: true,
    declaration: true,
    repayments: false,
    estimated_figures: false,
    close_company_loans: false,
    group_relief: false,
    rd_claim: false,
    capital_allowances: false,
    associated_companies: 0,
  },
  declarantName: "HAIDERI, Zahra",
  declarantStatus: "Director",
  contact: { email: "zahra@example.com", telephone: "01234567890" },
  sender: "Company",
  senderId: "CTUser100",
  senderPassword: "test-password",
  gatewayTest: true,
};

describe("validateCt600XmlStructure", () => {
  it("accepts a full Hydra dormant package", () => {
    const built = buildCt600Package(hydraDormant, { strict: false });
    const result = validateCt600XmlStructure(built.xml);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("includes dormant financial year and IR header contact", () => {
    const built = buildCt600Package(hydraDormant, { strict: false });
    expect(built.xml).toContain("<ct:Sender>Company</ct:Sender>");
    expect(built.xml).not.toContain("<Principal>");
    expect(built.xml).toContain("<ct:CompanyType>00</ct:CompanyType>");
    expect(built.xml).toContain("<ct:FinancialYearOne>");
    expect(built.xml).toContain("<ct:Year>2024</ct:Year>");
    expect(built.xml).toContain('<ct:IRmark Type="generic">');
    expect(built.xml).toContain("<TargetDetails>");
    expect(built.xml).toContain("<Organisation>HMRC</Organisation>");
    expect(built.xml).toContain('Filename="accounts.html"');
    expect(built.xml).toContain('entryPoint="yes"');
  });
});
