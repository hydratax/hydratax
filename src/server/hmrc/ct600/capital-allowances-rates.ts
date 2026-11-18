/**
 * Corporation Tax capital-allowance rates and window rules from HMRC / SDS.
 * Date-gated so the figure depends on expenditure date (or AP start where
 * HMRC phrases the rule that way) — not “whatever is current when we code”.
 *
 * Sources:
 * - SDS CT600 (2027) draft guidance (17 Nov 2026) — boxes 696 / 739
 * - GOV.UK Corporation Tax online service changes (40% FYA; ZEC / charge-points)
 */

/** Main-rate first-year allowance (Budget 2025 / Budget 2026). */
export function mainRateFirstYearAllowancePercent(
  expenditureIsoDate: string,
): 0 | 40 | 50 {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenditureIsoDate)) return 0;
  if (expenditureIsoDate < "2026-01-01") return 0;
  if (expenditureIsoDate <= "2026-12-31") return 40;
  return 50;
}

/** Claim amount in pence for qualifying expenditure at the date-gated rate. */
export function mainRateFirstYearAllowancePence(
  qualifyingExpenditurePence: number,
  expenditureIsoDate: string,
): number {
  const spend = Math.max(0, Math.round(qualifyingExpenditurePence));
  const rate = mainRateFirstYearAllowancePercent(expenditureIsoDate);
  if (rate === 0 || spend === 0) return 0;
  return Math.round((spend * rate) / 100);
}

/**
 * 100% FYA for zero-emission cars / EV charge-points —
 * not available for expenditure on or after this date.
 * SDS 2027 guidance: extended from 1 Apr 2026 → 1 Apr 2027.
 */
export const ZERO_EMISSION_FYA_EXPENDITURE_CUTOFF = "2027-04-01";

/**
 * Dedicated CT600 boxes (713/726/737/751 etc.) are not in use for APs
 * beginning on or after this date (SDS 2027).
 */
export const ZERO_EMISSION_FYA_BOXES_AP_START_CUTOFF = "2027-04-01";

export function zeroEmissionFyaAvailableForExpenditure(
  expenditureIsoDate: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenditureIsoDate)) return false;
  return expenditureIsoDate < ZERO_EMISSION_FYA_EXPENDITURE_CUTOFF;
}

export function zeroEmissionFyaBoxesInUseForPeriodStart(
  periodStart: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return true;
  return periodStart < ZERO_EMISSION_FYA_BOXES_AP_START_CUTOFF;
}

/**
 * Loans to participators (CT600A) tax / relief rate — dividend upper rate.
 * Applies by loan / benefit date (SDS CT600A guidance 2027).
 */
export function loansToParticipatorsRatePercent(loanOrBenefitIsoDate: string): {
  ratePercent: 25 | 32.5 | 33.75 | 35.75;
  label: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(loanOrBenefitIsoDate)) {
    return { ratePercent: 33.75, label: "dividend upper rate (default)" };
  }
  if (loanOrBenefitIsoDate < "2016-04-06") {
    return { ratePercent: 25, label: "25% (pre–6 Apr 2016)" };
  }
  if (loanOrBenefitIsoDate < "2022-04-06") {
    return { ratePercent: 32.5, label: "32.5% dividend upper rate" };
  }
  if (loanOrBenefitIsoDate < "2026-04-06") {
    return { ratePercent: 33.75, label: "33.75% dividend upper rate" };
  }
  return { ratePercent: 35.75, label: "35.75% dividend upper rate" };
}
