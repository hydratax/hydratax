/**
 * Student loan / postgraduate loan deductions — integer pence.
 * Round down to whole pounds per HMRC SL tables.
 *
 * Sources:
 * - https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * - https://www.gov.uk/guidance/special-rules-for-student-loans
 * - https://www.gov.uk/government/publications/payroll-technical-specifications-student-loans/collection-of-student-loans-from-6-april-2025
 *
 * FPS PlanType attributes: 01 / 02 / 04 / 05 (XSD FullPaymentSubmission).
 */

import {
  periodShare,
  periodsInYear,
  ratesForTaxYear,
  type PayFrequency,
  type TaxYearKey,
} from "./rates";

/** HMRC FPS StudentLoanRecovered PlanType values. */
export type StudentLoanPlanType = "01" | "02" | "04" | "05";

export type StudentLoanCalcInput = {
  frequency: PayFrequency;
  /** Same earnings base as employer Class 1 NI (gross for NICs). */
  niableEarningsPence: number;
  studentLoanPlan?: StudentLoanPlanType | null;
  postgraduateLoan?: boolean;
  taxYear?: string | TaxYearKey;
};

export type StudentLoanCalcResult = {
  studentLoanPence: number;
  postgraduateLoanPence: number;
  planType: StudentLoanPlanType | null;
};

/** Floor to whole pounds (HMRC student / PGL deduction tables). */
export function roundDownToPound(penceAmount: number): number {
  if (penceAmount <= 0) return 0;
  return Math.floor(penceAmount / 100) * 100;
}

function deductionAboveThreshold(
  earningsPence: number,
  thresholdPence: number,
  rateBps: number,
): number {
  const excess = earningsPence - thresholdPence;
  if (excess <= 0) return 0;
  // (E − PT) × R, then round down to nearest pound
  const raw = Math.floor((excess * rateBps) / 10_000);
  return roundDownToPound(raw);
}

function planAnnualThreshold(
  plan: StudentLoanPlanType,
  taxYear?: string | TaxYearKey,
): number | null {
  const sl = ratesForTaxYear(taxYear ?? "2026-27").studentLoan;
  switch (plan) {
    case "01":
      return sl.plan1AnnualPence;
    case "02":
      return sl.plan2AnnualPence;
    case "04":
      return sl.plan4AnnualPence;
    case "05":
      return sl.plan5AnnualPence;
    default:
      return null;
  }
}

export function calculateStudentLoans(
  input: StudentLoanCalcInput,
): StudentLoanCalcResult {
  const rates = ratesForTaxYear(input.taxYear ?? "2026-27");
  const periods = periodsInYear(input.frequency);
  const earnings = Math.max(0, input.niableEarningsPence);

  let studentLoanPence = 0;
  let planType: StudentLoanPlanType | null = null;

  if (input.studentLoanPlan) {
    const annual = planAnnualThreshold(input.studentLoanPlan, input.taxYear);
    if (annual != null) {
      const threshold = periodShare(annual, 1, periods);
      studentLoanPence = deductionAboveThreshold(
        earnings,
        threshold,
        rates.studentLoan.studentRateBps,
      );
      planType = input.studentLoanPlan;
    }
  }

  let postgraduateLoanPence = 0;
  if (input.postgraduateLoan) {
    const threshold = periodShare(rates.studentLoan.pglAnnualPence, 1, periods);
    postgraduateLoanPence = deductionAboveThreshold(
      earnings,
      threshold,
      rates.studentLoan.pglRateBps,
    );
  }

  return { studentLoanPence, postgraduateLoanPence, planType };
}

/** Map desk plan labels to FPS PlanType. */
export function parseStudentLoanPlan(
  value: string | null | undefined,
): StudentLoanPlanType | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "01" || v === "1" || v === "PLAN1" || v === "PLAN_1") return "01";
  if (v === "02" || v === "2" || v === "PLAN2" || v === "PLAN_2") return "02";
  if (v === "04" || v === "4" || v === "PLAN4" || v === "PLAN_4") return "04";
  if (v === "05" || v === "5" || v === "PLAN5" || v === "PLAN_5") return "05";
  return null;
}
