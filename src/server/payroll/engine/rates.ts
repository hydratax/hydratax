/**
 * UK PAYE / NI / student-loan rates — integer pence only.
 *
 * Sources (refresh annually with GOV.UK):
 * - https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026
 * - https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * - https://www.gov.uk/guidance/special-rules-for-student-loans
 * - https://www.gov.uk/scottish-income-tax
 * - https://www.gov.uk/national-insurance-rates-letters
 */

export type TaxYearKey = "2025-26" | "2026-27";

export type PayFrequency = "M1" | "W1";

export type TaxRegime = "UK" | "S" | "C";

export type NiCategoryLetter =
  | "A"
  | "B"
  | "C"
  | "F"
  | "H"
  | "I"
  | "J"
  | "L"
  | "M"
  | "S"
  | "V"
  | "Z"
  | "D"
  | "E"
  | "K"
  | "N";

/** Employer secondary rate shape above the secondary threshold. */
export type EmployerNiShape =
  | "full_from_st"
  | "zero_to_ust"
  | "zero_to_fust";

export type TaxBand = {
  /** Width of band in pence above personal allowance (0 = open-ended). */
  widthPence: number;
  rateBps: number;
};

export type PayrollRates = {
  taxYear: TaxYearKey;
  personalAllowancePence: number;
  /** PA reduces by £1 for every £2 over this adjusted net income. */
  paTaperFromPence: number;
  basicBandPence: number;
  higherBandTopPence: number;
  rukBands: TaxBand[];
  scottishBands: TaxBand[];
  welshBands: TaxBand[];
  lelWeeklyPence: number;
  lelMonthlyPence: number;
  lelAnnualPence: number;
  ptWeeklyPence: number;
  ptMonthlyPence: number;
  ptAnnualPence: number;
  stWeeklyPence: number;
  stMonthlyPence: number;
  stAnnualPence: number;
  uelWeeklyPence: number;
  uelMonthlyPence: number;
  uelAnnualPence: number;
  /** Freeport / Investment Zone upper secondary threshold. */
  fustWeeklyPence: number;
  fustMonthlyPence: number;
  fustAnnualPence: number;
  /** Under-21 / apprentice / veteran upper secondary (= UEL for these years). */
  ustWeeklyPence: number;
  ustMonthlyPence: number;
  ustAnnualPence: number;
  studentLoan: {
    plan1AnnualPence: number;
    plan2AnnualPence: number;
    plan4AnnualPence: number;
    /** Plan 5 from 2026–27; absent/null for 2025–26. */
    plan5AnnualPence: number | null;
    pglAnnualPence: number;
    studentRateBps: number;
    pglRateBps: number;
  };
};

const RUK_BANDS_COMMON: TaxBand[] = [
  { widthPence: 37_700_00, rateBps: 2000 },
  { widthPence: 125_140_00 - 37_700_00, rateBps: 4000 },
  { widthPence: 0, rateBps: 4500 },
];

/** 2025–26 Scottish widths above PA (employer tables). */
const SCOTTISH_BANDS_2025_26: TaxBand[] = [
  { widthPence: 2_827_00, rateBps: 1900 },
  { widthPence: 14_921_00 - 2_827_00, rateBps: 2000 },
  { widthPence: 31_092_00 - 14_921_00, rateBps: 2100 },
  { widthPence: 62_430_00 - 31_092_00, rateBps: 4200 },
  { widthPence: 125_140_00 - 62_430_00, rateBps: 4500 },
  { widthPence: 0, rateBps: 4800 },
];

/** 2026–27 Scottish widths above PA (employer tables). */
const SCOTTISH_BANDS_2026_27: TaxBand[] = [
  { widthPence: 3_967_00, rateBps: 1900 },
  { widthPence: 16_956_00 - 3_967_00, rateBps: 2000 },
  { widthPence: 31_092_00 - 16_956_00, rateBps: 2100 },
  { widthPence: 62_430_00 - 31_092_00, rateBps: 4200 },
  { widthPence: 125_140_00 - 62_430_00, rateBps: 4500 },
  { widthPence: 0, rateBps: 4800 },
];

export const RATES_2025_26: PayrollRates = {
  taxYear: "2025-26",
  personalAllowancePence: 12_570_00,
  paTaperFromPence: 100_000_00,
  basicBandPence: 37_700_00,
  higherBandTopPence: 125_140_00,
  rukBands: RUK_BANDS_COMMON,
  scottishBands: SCOTTISH_BANDS_2025_26,
  welshBands: RUK_BANDS_COMMON,
  lelWeeklyPence: 125_00,
  lelMonthlyPence: 542_00,
  lelAnnualPence: 6_500_00,
  ptWeeklyPence: 242_00,
  ptMonthlyPence: 1_048_00,
  ptAnnualPence: 12_570_00,
  stWeeklyPence: 96_00,
  stMonthlyPence: 417_00,
  stAnnualPence: 5_000_00,
  uelWeeklyPence: 967_00,
  uelMonthlyPence: 4_189_00,
  uelAnnualPence: 50_270_00,
  fustWeeklyPence: 481_00,
  fustMonthlyPence: 2_083_00,
  fustAnnualPence: 25_000_00,
  ustWeeklyPence: 967_00,
  ustMonthlyPence: 4_189_00,
  ustAnnualPence: 50_270_00,
  studentLoan: {
    plan1AnnualPence: 26_065_00,
    plan2AnnualPence: 28_470_00,
    plan4AnnualPence: 32_745_00,
    plan5AnnualPence: null,
    pglAnnualPence: 21_000_00,
    studentRateBps: 900,
    pglRateBps: 600,
  },
};

export const RATES_2026_27: PayrollRates = {
  taxYear: "2026-27",
  personalAllowancePence: 12_570_00,
  paTaperFromPence: 100_000_00,
  basicBandPence: 37_700_00,
  higherBandTopPence: 125_140_00,
  rukBands: RUK_BANDS_COMMON,
  scottishBands: SCOTTISH_BANDS_2026_27,
  welshBands: RUK_BANDS_COMMON,
  lelWeeklyPence: 129_00,
  lelMonthlyPence: 559_00,
  lelAnnualPence: 6_708_00,
  ptWeeklyPence: 242_00,
  ptMonthlyPence: 1_048_00,
  ptAnnualPence: 12_570_00,
  stWeeklyPence: 96_00,
  stMonthlyPence: 417_00,
  stAnnualPence: 5_000_00,
  uelWeeklyPence: 967_00,
  uelMonthlyPence: 4_189_00,
  uelAnnualPence: 50_270_00,
  fustWeeklyPence: 481_00,
  fustMonthlyPence: 2_083_00,
  fustAnnualPence: 25_000_00,
  ustWeeklyPence: 967_00,
  ustMonthlyPence: 4_189_00,
  ustAnnualPence: 50_270_00,
  studentLoan: {
    plan1AnnualPence: 26_900_00,
    plan2AnnualPence: 29_385_00,
    plan4AnnualPence: 33_795_00,
    plan5AnnualPence: 25_000_00,
    pglAnnualPence: 21_000_00,
    studentRateBps: 900,
    pglRateBps: 600,
  },
};

export function ratesForTaxYear(taxYear: string | TaxYearKey): PayrollRates {
  const key = normaliseTaxYearKey(taxYear);
  return key === "2025-26" ? RATES_2025_26 : RATES_2026_27;
}

export function normaliseTaxYearKey(taxYear: string): TaxYearKey {
  const t = taxYear.trim();
  if (t === "2025-26" || t === "25-26") return "2025-26";
  if (t === "2026-27" || t === "26-27") return "2026-27";
  const full = /^(\d{4})-(\d{2})$/.exec(t);
  if (full) {
    const start = Number(full[1]);
    if (start <= 2025) return "2025-26";
    return "2026-27";
  }
  return "2026-27";
}

export function periodsInYear(frequency: PayFrequency): number {
  return frequency === "W1" ? 52 : 12;
}

export type NiCategoryRates = {
  letter: NiCategoryLetter;
  /** Primary contributions between PT and UEL (bps). */
  employeeMainBps: number;
  /** Primary contributions above UEL (bps). */
  employeeAdditionalBps: number;
  employerShape: EmployerNiShape;
  employerBps: number;
};

/** Employee + employer shapes from GOV.UK NI category letters (2025–26 / 2026–27). */
export function niCategoryRates(letter: string): NiCategoryRates {
  const L = letter.trim().toUpperCase() as NiCategoryLetter;
  /** Shared reduced employee rates — letter set per case (avoids TS2783). */
  const reducedEmp = {
    employeeMainBps: 185,
    employeeAdditionalBps: 200,
    employerShape: "full_from_st" as EmployerNiShape,
    employerBps: 1500,
  };
  const standardEmp = {
    employeeMainBps: 800,
    employeeAdditionalBps: 200,
  };
  const deferEmp = {
    employeeMainBps: 200,
    employeeAdditionalBps: 200,
  };
  const nilEmp = {
    employeeMainBps: 0,
    employeeAdditionalBps: 0,
  };

  switch (L) {
    case "A":
    case "J":
      return {
        letter: L,
        ...standardEmp,
        ...(L === "J" ? deferEmp : standardEmp),
        employerShape: "full_from_st",
        employerBps: 1500,
      };
    case "B":
      return { letter: "B", ...reducedEmp };
    case "C":
      return {
        letter: "C",
        ...nilEmp,
        employerShape: "full_from_st",
        employerBps: 1500,
      };
    case "H":
    case "M":
    case "V":
      return {
        letter: L,
        ...standardEmp,
        employerShape: "zero_to_ust",
        employerBps: 1500,
      };
    case "Z":
      return {
        letter: "Z",
        ...deferEmp,
        employerShape: "zero_to_ust",
        employerBps: 1500,
      };
    case "F":
      return {
        letter: "F",
        ...standardEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "I":
      return {
        letter: "I",
        ...reducedEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "L":
      return {
        letter: "L",
        ...deferEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "S":
      return {
        letter: "S",
        ...nilEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "D":
      return {
        letter: "D",
        ...deferEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "E":
      return {
        letter: "E",
        ...reducedEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "K":
      return {
        letter: "K",
        ...nilEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    case "N":
      return {
        letter: "N",
        ...standardEmp,
        employerShape: "zero_to_fust",
        employerBps: 1500,
      };
    default:
      return {
        letter: "A",
        ...standardEmp,
        employerShape: "full_from_st",
        employerBps: 1500,
      };
  }
}

/** Proportion annual pence across periods — floor to penny (HMRC-style). */
export function periodShare(annualPence: number, periodsElapsed: number, periods: number): number {
  if (periods <= 0 || periodsElapsed <= 0) return 0;
  return Math.floor((annualPence * periodsElapsed) / periods);
}
