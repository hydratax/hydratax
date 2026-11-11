/**
 * Self Assessment / self-employed Income Tax & NIC rates by tax year.
 * England / Wales / Northern Ireland (non-savings, non-dividend bands).
 *
 * Sources (GOV.UK, updated 6 April 2026):
 * - https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past
 * - https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions
 * - https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income
 */

export type SaTaxYearRates = {
  taxYear: string;
  personalAllowance: number;
  paTaperFrom: number;
  marriageAllowance: number;
  blindPersonsAllowance: number;

  /** Width of basic-rate band after Personal Allowance (taxable income). */
  basicRateBand: number;
  /** Absolute additional-rate threshold (income before PA for banding display). */
  additionalRateThreshold: number;

  basicRate: number;
  higherRate: number;
  additionalRate: number;

  savingsStartingRateBand: number;
  psaBasic: number;
  psaHigher: number;

  dividendAllowance: number;
  dividendBasic: number;
  dividendHigher: number;
  dividendAdditional: number;

  tradingAllowance: number;
  propertyAllowance: number;

  class2Weekly: number;
  class2SmallProfitsThreshold: number;
  /** From 2024–25 Class 2 is no longer compulsory above LPT (voluntary only). */
  class2Compulsory: boolean;

  class4Lower: number;
  class4Upper: number;
  class4Main: number;
  class4Extra: number;

  hicbcFrom: number;
  hicbcFullAt: number;

  studentLoanPlan2Threshold: number;
  studentLoanRate: number;
  pgLoanThreshold: number;
  pgLoanRate: number;
};

const SRC_IT =
  "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past";
const SRC_NI =
  "https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions";

/** Shared frozen bands / PA for 2024–25 through 2026–27 (Budget freezes). */
const SHARED_BANDS = {
  personalAllowance: 12_570,
  paTaperFrom: 100_000,
  marriageAllowance: 1_260,
  basicRateBand: 37_700,
  additionalRateThreshold: 125_140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  savingsStartingRateBand: 5_000,
  psaBasic: 1_000,
  psaHigher: 500,
  tradingAllowance: 1_000,
  propertyAllowance: 1_000,
  class4Lower: 12_570,
  class4Upper: 50_270,
  class4Extra: 0.02,
  hicbcFrom: 60_000,
  hicbcFullAt: 80_000,
  studentLoanRate: 0.09,
  pgLoanThreshold: 21_000,
  pgLoanRate: 0.06,
} as const;

/** Tax year 6 Apr 2024 – 5 Apr 2025 */
export const RATES_2024_25: SaTaxYearRates = {
  taxYear: "2024-25",
  ...SHARED_BANDS,
  blindPersonsAllowance: 3_070,
  dividendAllowance: 500,
  dividendBasic: 0.0875,
  dividendHigher: 0.3375,
  dividendAdditional: 0.3935,
  class2Weekly: 3.45,
  class2SmallProfitsThreshold: 6_725,
  class2Compulsory: false,
  class4Main: 0.06,
  studentLoanPlan2Threshold: 27_295,
};

/** Tax year 6 Apr 2025 – 5 Apr 2026 (HydraTax SA100 2026 stationery) */
export const RATES_2025_26: SaTaxYearRates = {
  taxYear: "2025-26",
  ...SHARED_BANDS,
  blindPersonsAllowance: 3_130,
  dividendAllowance: 500,
  dividendBasic: 0.0875,
  dividendHigher: 0.3375,
  dividendAdditional: 0.3935,
  class2Weekly: 3.5,
  class2SmallProfitsThreshold: 6_845,
  class2Compulsory: false,
  class4Main: 0.06,
  studentLoanPlan2Threshold: 28_470,
};

/** Tax year 6 Apr 2026 – 5 Apr 2027 */
export const RATES_2026_27: SaTaxYearRates = {
  taxYear: "2026-27",
  ...SHARED_BANDS,
  blindPersonsAllowance: 3_250,
  dividendAllowance: 500,
  /** Dividend rates rose from 6 April 2026 (GOV.UK Income Tax rates table). */
  dividendBasic: 0.1075,
  dividendHigher: 0.3575,
  dividendAdditional: 0.3935,
  class2Weekly: 3.65,
  class2SmallProfitsThreshold: 7_105,
  class2Compulsory: false,
  class4Main: 0.06,
  studentLoanPlan2Threshold: 28_470,
};

/**
 * Tax year 6 Apr 2027 – 5 Apr 2028.
 * Autumn Budget 2026 confirmed trading allowance £3,000 from 2027–28.
 * Savings / property Income Tax rates also change from 6 Apr 2027 (24/44/49%) —
 * those are tracked in the HMRC rulebook until SA calc models them separately.
 * Blind Person’s Allowance, Class 2 weekly, etc. not yet in GOV.UK 2027–28 tables —
 * carry forward 2026–27 figures until published (do not invent).
 */
export const RATES_2027_28: SaTaxYearRates = {
  ...RATES_2026_27,
  taxYear: "2027-28",
  tradingAllowance: 3_000,
};

export const SA_RATES_BY_YEAR: Record<string, SaTaxYearRates> = {
  "2024-25": RATES_2024_25,
  "2025-26": RATES_2025_26,
  "2026-27": RATES_2026_27,
  "2027-28": RATES_2027_28,
};

/** Default desk year while SA100-2026 (2025–26) stationery is in use. */
export const TAX_YEAR_LABEL = "2025-26";

export function ratesForTaxYear(taxYear?: string | null): SaTaxYearRates {
  const key = (taxYear || TAX_YEAR_LABEL).trim();
  return SA_RATES_BY_YEAR[key] ?? RATES_2025_26;
}

export const SA_RATE_SOURCES = {
  incomeTax: SRC_IT,
  nationalInsurance: SRC_NI,
  tradingPropertyAllowance:
    "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
} as const;
