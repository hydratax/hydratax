/**
 * Essential CT600 questionnaire derived from HMRC
 * “Completing your Company Tax Return” (CT600 Guide) and CT600 (2026) form.
 * Used to decide which sections / attachments are required before submit.
 *
 * Sources:
 * - https://www.gov.uk/guidance/the-company-tax-return-guide
 * - https://www.gov.uk/guidance/company-tax-return-obligations
 */

export type Ct600QuestionId =
  | "period_dates"
  | "accounts_attached"
  | "computations_attached"
  | "repayments"
  | "estimated_figures"
  | "close_company_loans"
  | "group_relief"
  | "rd_claim"
  | "capital_allowances"
  | "associated_companies"
  | "declaration";

export type Ct600Question = {
  id: Ct600QuestionId;
  boxHint: string;
  prompt: string;
  essential: boolean;
  /** When true, an affirmative answer means a supplementary page / attachment is required */
  ifYesRequires?: string;
};

/** Core questions every CT600 filing path must answer (QuickBooks/Capium-style checklist). */
export const CT600_ESSENTIAL_QUESTIONS: Ct600Question[] = [
  {
    id: "period_dates",
    boxHint: "30 / 35",
    prompt: "Confirm the accounting period start and end dates for this return.",
    essential: true,
  },
  {
    id: "accounts_attached",
    boxHint: "80",
    prompt:
      "Are statutory accounts attached for the period of this return? (Required for CT Online — usually iXBRL.)",
    essential: true,
  },
  {
    id: "computations_attached",
    boxHint: "85 / 90",
    prompt:
      "Are Corporation Tax computations attached for this period? (Required — usually iXBRL.)",
    essential: true,
  },
  {
    id: "repayments",
    boxHint: "40",
    prompt: "Are you claiming a repayment for this period?",
    essential: true,
  },
  {
    id: "estimated_figures",
    boxHint: "55",
    prompt: "Does this return contain estimated figures?",
    essential: true,
  },
  {
    id: "close_company_loans",
    boxHint: "95 · CT600A",
    prompt:
      "Did the company make loans or arrangements to participators (close company)?",
    essential: true,
    ifYesRequires: "CT600A",
  },
  {
    id: "group_relief",
    boxHint: "105 · CT600C",
    prompt: "Are you claiming or surrendering group / consortium relief?",
    essential: true,
    ifYesRequires: "CT600C",
  },
  {
    id: "rd_claim",
    boxHint: "142 · CT600L",
    prompt: "Are you claiming Research and Development relief?",
    essential: true,
    ifYesRequires: "CT600L",
  },
  {
    id: "capital_allowances",
    boxHint: "Capital allowances",
    prompt: "Are there capital allowances or balancing charges to report?",
    essential: true,
  },
  {
    id: "associated_companies",
    boxHint: "326",
    prompt: "Enter the number of associated companies in this period (0 if none).",
    essential: true,
  },
  {
    id: "declaration",
    boxHint: "Declaration",
    prompt:
      "I confirm the information in this return is correct and complete to the best of my knowledge.",
    essential: true,
  },
];

export type Ct600QuestionnaireAnswers = Partial<
  Record<Ct600QuestionId, boolean | number | string>
>;

export type Ct600QuestionnaireResult = {
  ok: boolean;
  missing: string[];
  supplementaryPages: string[];
};

export function validateCt600Questionnaire(
  answers: Ct600QuestionnaireAnswers,
): Ct600QuestionnaireResult {
  const missing: string[] = [];
  const supplementaryPages: string[] = [];

  for (const q of CT600_ESSENTIAL_QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined || v === null || v === "") {
      missing.push(q.id);
      continue;
    }
    if (q.id === "period_dates" && v !== true) missing.push(q.id);
    if (q.id === "accounts_attached" && v !== true) missing.push(q.id);
    if (q.id === "computations_attached" && v !== true) missing.push(q.id);
    if (q.id === "declaration" && v !== true) missing.push(q.id);
    if (q.id === "associated_companies" && typeof v !== "number" && Number.isNaN(Number(v))) {
      missing.push(q.id);
    }
    if (q.ifYesRequires && v === true) {
      supplementaryPages.push(q.ifYesRequires);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    supplementaryPages: [...new Set(supplementaryPages)],
  };
}

/** MTD VAT nine boxes — HMRC VAT Notice 700 / MTD VAT API field names */
export const VAT_BOX_DEFINITIONS = [
  {
    id: 1,
    key: "vatDueSales" as const,
    label: "Box 1 — VAT due on sales",
  },
  {
    id: 2,
    key: "vatDueAcquisitions" as const,
    label: "Box 2 — VAT due on acquisitions",
  },
  {
    id: 3,
    key: "totalVatDue" as const,
    label: "Box 3 — Total VAT due (1 + 2)",
  },
  {
    id: 4,
    key: "vatReclaimedCurrPeriod" as const,
    label: "Box 4 — VAT reclaimed",
  },
  {
    id: 5,
    key: "netVatDue" as const,
    label: "Box 5 — Net VAT (3 − 4)",
  },
  {
    id: 6,
    key: "totalValueSalesExVAT" as const,
    label: "Box 6 — Total sales ex VAT",
  },
  {
    id: 7,
    key: "totalValuePurchasesExVAT" as const,
    label: "Box 7 — Total purchases ex VAT",
  },
  {
    id: 8,
    key: "totalValueGoodsSuppliedExVAT" as const,
    label: "Box 8 — Goods supplied to EU",
  },
  {
    id: 9,
    key: "totalAcquisitionsExVAT" as const,
    label: "Box 9 — Acquisitions from EU",
  },
] as const;

export const VAT_FILING_STEPS = [
  { id: "period", label: "Select period" },
  { id: "source", label: "Trial balance / books" },
  { id: "map", label: "Map to boxes" },
  { id: "review", label: "Review nine boxes" },
  { id: "submit", label: "Submit to HMRC" },
] as const;

/** High-level phases shown in the CT600 filing header (competitor-style). */
export const CT600_PHASES = [
  { id: "enter", label: "Enter details" },
  { id: "review", label: "Review documents" },
  { id: "submit", label: "Submit return" },
] as const;

/** Internal wizard steps mapped into CT600_PHASES. */
export const CT600_FILING_STEPS = [
  { id: "period", label: "Accounting period", phase: 0 },
  { id: "trial_balance", label: "Upload trial balance", phase: 0 },
  { id: "map", label: "Map to CT figures", phase: 0 },
  { id: "questionnaire", label: "HMRC checklist", phase: 0 },
  { id: "review", label: "Review documents", phase: 1 },
  { id: "submit", label: "Submit CT Online", phase: 2 },
] as const;
