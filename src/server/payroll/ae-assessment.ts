/**
 * Light automatic enrolment worker assessment (desk display).
 *
 * Thresholds — GOV.UK / TPR 2026–27 (unchanged from 2025–26):
 * - Earnings trigger £10,000 / year (£192 week · £833 month)
 * - Qualifying earnings lower £6,240 (£120 week · £520 month)
 * - Qualifying earnings upper £50,270 (£967 week · £4,189 month)
 *
 * https://www.gov.uk/government/publications/review-of-the-automatic-enrolment-earnings-trigger-and-qualifying-earnings-band-for-202627
 * https://www.thepensionsregulator.gov.uk/en/employers/new-employers/im-an-employer-who-has-to-provide-a-pension/declare-your-compliance/ongoing-duties-for-employers/earnings-thresholds
 *
 * SPA approximated as 66 for desk classification (exact SPA calendars are
 * person-specific — accountant can override mentally for edge cases).
 */

import type { PayFrequency } from "@/server/hmrc/payroll";
import { TAX_YEAR_2026_27 } from "@/server/payroll/statutory";

/** Approx State Pension age for AE banding on the desk (2026). */
export const AE_SPA_YEARS = 66;

export const AE_THRESHOLDS_2026_27 = {
  triggerAnnualPence: 10_000_00,
  triggerWeeklyPence: 192_00,
  triggerMonthlyPence: 833_00,
  lowerAnnualPence: 6_240_00,
  lowerWeeklyPence: TAX_YEAR_2026_27.aeLowerWeeklyPence,
  lowerMonthlyPence: TAX_YEAR_2026_27.aeLowerMonthlyPence,
  upperAnnualPence: 50_270_00,
  upperWeeklyPence: TAX_YEAR_2026_27.aeUpperWeeklyPence,
  upperMonthlyPence: TAX_YEAR_2026_27.aeUpperMonthlyPence,
} as const;

export type AeWorkerCategory =
  | "eligible_jobholder"
  | "non_eligible_jobholder"
  | "entitled_worker"
  | "outside_age"
  | "unknown";

/** Desk-facing status after applying opt-out. */
export type AeDeskStatus =
  | "enrolled"
  | "opted_out"
  | "eligible"
  | "can_opt_in"
  | "entitled"
  | "outside"
  | "review";

export const AE_DESK_LABEL: Record<AeDeskStatus, string> = {
  enrolled: "Enrolled",
  opted_out: "Opted out",
  eligible: "Eligible to enrol",
  can_opt_in: "Can opt in",
  entitled: "Entitled worker",
  outside: "Outside AE",
  review: "Needs review",
};

export type AeAssessmentInput = {
  dateOfBirth?: string | null;
  /** Assessment date ISO (usually pay date or today). */
  assessmentDate: string;
  /** Period earnings used for the trigger test (gross this period). */
  periodEarningsPence?: number;
  /** Fallback when no period earnings — annual salary. */
  annualSalaryPence?: number;
  frequency: PayFrequency;
  pensionOptOut?: boolean;
  /** True when this pay run already has AE contributions. */
  hasContributions?: boolean;
};

export type AeAssessmentResult = {
  category: AeWorkerCategory;
  status: AeDeskStatus;
  label: string;
  ageYears: number | null;
  periodEarningsPence: number;
  triggerPence: number;
  lowerPence: number;
};

function ageOnDate(dobIso: string, onIso: string): number | null {
  const dob = dobIso.slice(0, 10);
  const on = onIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !/^\d{4}-\d{2}-\d{2}$/.test(on)) {
    return null;
  }
  const [dy, dm, dd] = dob.split("-").map(Number);
  const [oy, om, od] = on.split("-").map(Number);
  let age = oy - dy;
  if (om < dm || (om === dm && od < dd)) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

function periodEarnings(input: AeAssessmentInput): number {
  if (input.periodEarningsPence != null && input.periodEarningsPence > 0) {
    return Math.floor(input.periodEarningsPence);
  }
  const annual = Math.max(0, Math.floor(input.annualSalaryPence ?? 0));
  if (annual <= 0) return 0;
  if (input.frequency === "W1") return Math.floor(annual / 52);
  return Math.floor(annual / 12);
}

export function aeThresholdsForFrequency(frequency: PayFrequency): {
  triggerPence: number;
  lowerPence: number;
  upperPence: number;
} {
  if (frequency === "W1") {
    return {
      triggerPence: AE_THRESHOLDS_2026_27.triggerWeeklyPence,
      lowerPence: AE_THRESHOLDS_2026_27.lowerWeeklyPence,
      upperPence: AE_THRESHOLDS_2026_27.upperWeeklyPence,
    };
  }
  return {
    triggerPence: AE_THRESHOLDS_2026_27.triggerMonthlyPence,
    lowerPence: AE_THRESHOLDS_2026_27.lowerMonthlyPence,
    upperPence: AE_THRESHOLDS_2026_27.upperMonthlyPence,
  };
}

/**
 * Classify worker for AE duties (before opt-out overlay).
 * Earnings compared to pay-period trigger / lower band (TPR tables).
 */
export function classifyAeWorkerCategory(input: {
  ageYears: number | null;
  earningsPence: number;
  triggerPence: number;
  lowerPence: number;
}): AeWorkerCategory {
  const { ageYears, earningsPence, triggerPence, lowerPence } = input;
  if (ageYears == null) return "unknown";
  if (ageYears < 16 || ageYears > 74) return "outside_age";

  const atOrAboveTrigger = earningsPence >= triggerPence;
  const atOrAboveLower = earningsPence >= lowerPence;
  const underSpa = ageYears < AE_SPA_YEARS;
  const inEligibleAge = ageYears >= 22 && underSpa;

  if (inEligibleAge && atOrAboveTrigger) return "eligible_jobholder";

  if (atOrAboveTrigger && ((ageYears >= 16 && ageYears <= 21) || (ageYears >= AE_SPA_YEARS && ageYears <= 74))) {
    return "non_eligible_jobholder";
  }
  if (inEligibleAge && atOrAboveLower && !atOrAboveTrigger) {
    return "non_eligible_jobholder";
  }
  if (ageYears >= 16 && ageYears <= 74 && !atOrAboveLower) {
    return "entitled_worker";
  }
  // Earnings between lower and trigger outside eligible age band already handled;
  // remaining → non-eligible if in 16–74
  if (ageYears >= 16 && ageYears <= 74) return "non_eligible_jobholder";
  return "outside_age";
}

/** Full light assessment for one worker. */
export function assessAeWorker(input: AeAssessmentInput): AeAssessmentResult {
  const th = aeThresholdsForFrequency(input.frequency);
  const earnings = periodEarnings(input);
  const ageYears = input.dateOfBirth
    ? ageOnDate(input.dateOfBirth, input.assessmentDate)
    : null;
  const category = classifyAeWorkerCategory({
    ageYears,
    earningsPence: earnings,
    triggerPence: th.triggerPence,
    lowerPence: th.lowerPence,
  });

  let status: AeDeskStatus;
  if (input.pensionOptOut) status = "opted_out";
  else if (category === "unknown") status = "review";
  else if (category === "outside_age") status = "outside";
  else if (category === "eligible_jobholder") {
    status = input.hasContributions ? "enrolled" : "eligible";
  } else if (category === "non_eligible_jobholder") status = "can_opt_in";
  else if (category === "entitled_worker") status = "entitled";
  else status = "review";

  return {
    category,
    status,
    label: AE_DESK_LABEL[status],
    ageYears,
    periodEarningsPence: earnings,
    triggerPence: th.triggerPence,
    lowerPence: th.lowerPence,
  };
}

export type AeDeskRow = {
  employeeId: string;
  forename: string;
  surname: string;
  status: AeDeskStatus;
  label: string;
  active: boolean;
};

/** Summarise AE for the employer Documents desk. */
export function summariseAeDesk(rows: AeDeskRow[]): {
  enrolled: number;
  optedOut: number;
  eligible: number;
  canOptIn: number;
  entitled: number;
  review: number;
  outside: number;
} {
  const counts = {
    enrolled: 0,
    optedOut: 0,
    eligible: 0,
    canOptIn: 0,
    entitled: 0,
    review: 0,
    outside: 0,
  };
  for (const r of rows) {
    if (!r.active) continue;
    switch (r.status) {
      case "enrolled":
        counts.enrolled += 1;
        break;
      case "opted_out":
        counts.optedOut += 1;
        break;
      case "eligible":
        counts.eligible += 1;
        break;
      case "can_opt_in":
        counts.canOptIn += 1;
        break;
      case "entitled":
        counts.entitled += 1;
        break;
      case "outside":
        counts.outside += 1;
        break;
      default:
        counts.review += 1;
    }
  }
  return counts;
}
