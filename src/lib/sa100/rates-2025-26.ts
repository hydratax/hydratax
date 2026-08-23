/**
 * Income Tax & NIC rates — 6 Apr 2025 to 5 Apr 2026 (2025–26).
 * England / Wales / Northern Ireland.
 */
export const TAX_YEAR_LABEL = "2025-26";

export const RATES_2025_26 = {
  personalAllowance: 12_570,
  paTaperFrom: 100_000,
  marriageAllowance: 1_260,
  blindPersonsAllowance: 3_130,

  basicRateBand: 37_700,
  additionalRateThreshold: 125_140,

  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,

  savingsStartingRateBand: 5_000,
  psaBasic: 1_000,
  psaHigher: 500,

  dividendAllowance: 500,
  dividendBasic: 0.0875,
  dividendHigher: 0.3375,
  dividendAdditional: 0.3935,

  class4Lower: 12_570,
  class4Upper: 50_270,
  class4Main: 0.06,
  class4Extra: 0.02,

  hicbcFrom: 60_000,
  hicbcFullAt: 80_000,

  studentLoanPlan2Threshold: 28_470,
  studentLoanRate: 0.09,
  pgLoanThreshold: 21_000,
  pgLoanRate: 0.06,
} as const;
