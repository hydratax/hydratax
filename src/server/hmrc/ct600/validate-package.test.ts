import { describe, expect, it } from "vitest";
import { pence } from "@/server/money/pence";
import { validateCt600Package } from "@/server/hmrc/ct600/validate-package";
import type { Ct600PackageInput } from "@/server/hmrc/ct600/types";

const baseInput: Ct600PackageInput = {
  companyName: "Test Co Ltd",
  companyNumber: "12345678",
  utr: "1234567890",
  figures: {
    clientId: "00000000-0000-0000-0000-000000000001",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    turnoverPence: pence(1_000_000),
    costOfSalesPence: pence(200_000),
    administrativeExpensesPence: pence(300_000),
    otherIncomePence: pence(0),
    tangibleAssetsPence: pence(50_000),
    cashAtBankPence: pence(100_000),
    debtorsPence: pence(20_000),
    creditorsPence: pence(30_000),
    calledUpShareCapitalPence: pence(100),
    profitAndLossAccountPence: pence(500_000),
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
};

describe("validateCt600Package", () => {
  it("passes preview mode with minimal questionnaire gaps", () => {
    const res = validateCt600Package(
      {
        ...baseInput,
        questionnaire: { associated_companies: 0 },
      },
      { strict: false },
    );
    expect(res.ok).toBe(true);
  });

  it("blocks unsupported supplementary pages in strict mode", () => {
    const res = validateCt600Package(
      {
        ...baseInput,
        questionnaire: {
          ...baseInput.questionnaire!,
          close_company_loans: true,
        },
      },
      { strict: true },
    );
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "supplementary_ct600a")).toBe(true);
  });

  it("requires declaration in strict mode", () => {
    const res = validateCt600Package(
      {
        ...baseInput,
        questionnaire: {
          ...baseInput.questionnaire!,
          declaration: false,
        },
      },
      { strict: true },
    );
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "declaration_required")).toBe(true);
  });
});
