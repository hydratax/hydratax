export {
  RATES_2025_26,
  RATES_2026_27,
  ratesForTaxYear,
  normaliseTaxYearKey,
  periodsInYear,
  periodShare,
  niCategoryRates,
  type TaxYearKey,
  type PayFrequency,
  type TaxRegime,
  type NiCategoryLetter,
  type PayrollRates,
} from "./rates";

export {
  parseTaxCode,
  calculatePayeTax,
  taxAtBps,
  type TaxBasis,
  type ParsedTaxCode,
  type TaxCalcInput,
  type TaxCalcResult,
} from "./tax";

export { calculateClass1Ni, type NiCalcInput, type NiCalcResult } from "./ni";

export {
  calculateStudentLoans,
  parseStudentLoanPlan,
  roundDownToPound,
  type StudentLoanPlanType,
  type StudentLoanCalcInput,
  type StudentLoanCalcResult,
} from "./student-loans";
