/**
 * CT600 tax schedule that satisfies HMRC gateway maths:
 * - TaxRate must be an allowed label (not a bare "19.00")
 * - Tax for each FY row = whole-pound profit × rate% (2dp)
 * - Marginal relief is a separate deduction (not baked into the rate rows)
 * - FY profit slices sum exactly to chargeable profits (box 315)
 *
 * @see https://www.gov.uk/guidance/the-company-tax-return-guide
 * @see https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax
 */

import {
  CT_MAIN_RATE,
  CT_MARGINAL_LOWER_PENCE,
  CT_MARGINAL_UPPER_PENCE,
  CT_SMALL_PROFITS_RATE,
  CT_STANDARD_FRACTION,
  computeTaxChargePence,
  ctThresholdsPence,
} from "@/server/hmrc/ct600/tax-charge";

export type CtTaxRateLabel =
  | "FULL RATE OF CT"
  | "SMALL CO RATE OF CT";

export type CtFinancialYearSlice = {
  fy: number;
  /** Whole pounds — CT600 profit boxes have no pence */
  profitPounds: number;
  /** Numeric % shown in PDF box 340/390 */
  ratePercent: 19 | 25;
  /** XML TaxRate enumeration */
  rateLabel: CtTaxRateLabel;
  /** Tax in pence = profitPounds × ratePercent (exact) */
  taxPence: number;
};

export type Ct600TaxSchedule = {
  /** Whole pounds chargeable (box 315) */
  chargeableProfitPounds: number;
  slices: CtFinancialYearSlice[];
  /** Sum of slice taxes before marginal relief (box 430) */
  grossTaxPence: number;
  /** Marginal relief (box 435) */
  marginalReliefPence: number;
  /** Net CT chargeable (box 440) */
  netTaxPence: number;
  /** Box 329 — small profits rate or marginal relief entitlement */
  claimSmallProfitsOrMarginalRelief: boolean;
  /** Band used for the accounting period as a whole */
  band: "small" | "marginal" | "main" | "nil";
};

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function financialYearStart(date: Date): number {
  const y = date.getUTCFullYear();
  const month = date.getUTCMonth();
  // FY starts 1 April
  if (month < 3) return y - 1;
  return y;
}

function endOfFinancialYear(fyStart: number): Date {
  return new Date(Date.UTC(fyStart + 1, 2, 31)); // 31 March
}

/** Day counts per UK CT financial year within the AP. */
export function financialYearDaySlices(
  periodStart: string,
  periodEnd: string,
): Array<{ fy: number; days: number }> {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  if (end < start) return [];

  const out: Array<{ fy: number; days: number }> = [];
  let cursor = start;
  while (cursor <= end) {
    const fy = financialYearStart(cursor);
    const sliceEnd = endOfFinancialYear(fy);
    const periodSliceEnd = sliceEnd < end ? sliceEnd : end;
    const days = daysInclusive(cursor, periodSliceEnd);
    out.push({ fy, days });
    cursor = new Date(periodSliceEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Apportion whole pounds across day-weighted slices so the parts sum exactly
 * to `totalPounds` (avoids HMRC 9186 profit-sum mismatches).
 */
export function apportionWholePounds(
  totalPounds: number,
  dayWeights: number[],
): number[] {
  if (totalPounds <= 0 || dayWeights.length === 0) {
    return dayWeights.map(() => 0);
  }
  const totalDays = dayWeights.reduce((a, b) => a + b, 0);
  if (totalDays <= 0) return dayWeights.map(() => 0);

  const parts = dayWeights.map((d) =>
    Math.floor((totalPounds * d) / totalDays),
  );
  let remainder = totalPounds - parts.reduce((a, b) => a + b, 0);
  // Give leftover pounds to the largest day-weight slices first
  const order = dayWeights
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d - a.d || a.i - b.i);
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    parts[order[k % order.length]!.i]! += 1;
    remainder -= 1;
    k += 1;
  }
  return parts;
}

function bandForProfitPence(
  profitPence: number,
  associatedCompanies = 0,
): Ct600TaxSchedule["band"] {
  if (profitPence <= 0) return "nil";
  const { lower, upper } = ctThresholdsPence(associatedCompanies);
  if (profitPence <= lower) return "small";
  if (profitPence >= upper) return "main";
  return "marginal";
}

/**
 * Build the CT600 rate-row schedule for an accounting period.
 * `taxableProfitPence` is the true taxable profit; CT600 profit boxes use whole pounds.
 */
export function computeCt600TaxSchedule(opts: {
  periodStart: string;
  periodEnd: string;
  taxableProfitPence: number;
  associatedCompanies?: number;
}): Ct600TaxSchedule {
  const associates = opts.associatedCompanies ?? 0;
  const profitPence = Math.max(0, Math.round(opts.taxableProfitPence));
  const chargeableProfitPounds = Math.trunc(profitPence / 100);
  const chargeablePenceWhole = chargeableProfitPounds * 100;

  const daySlices = financialYearDaySlices(opts.periodStart, opts.periodEnd);
  if (daySlices.length === 0 || chargeableProfitPounds === 0) {
    return {
      chargeableProfitPounds: 0,
      slices: daySlices.map((s) => ({
        fy: s.fy,
        profitPounds: 0,
        ratePercent: 19,
        rateLabel: "SMALL CO RATE OF CT",
        taxPence: 0,
      })),
      grossTaxPence: 0,
      marginalReliefPence: 0,
      netTaxPence: 0,
      claimSmallProfitsOrMarginalRelief: false,
      band: "nil",
    };
  }

  const profitParts = apportionWholePounds(
    chargeableProfitPounds,
    daySlices.map((s) => s.days),
  );

  const band = bandForProfitPence(chargeablePenceWhole, associates);
  const claimSmallProfitsOrMarginalRelief =
    band === "small" || band === "marginal";

  // Rate rows: small → 19% SMALL CO; main or marginal → 25% FULL RATE
  // (marginal relief is deducted separately so Tax = Profit × Rate holds).
  const ratePercent: 19 | 25 = band === "small" ? 19 : 25;
  const rateLabel: CtTaxRateLabel =
    band === "small" ? "SMALL CO RATE OF CT" : "FULL RATE OF CT";

  const slices: CtFinancialYearSlice[] = daySlices.map((s, i) => {
    const profitPounds = profitParts[i] ?? 0;
    const taxPence = profitPounds * ratePercent; // exact: £1 × 19% = 19p
    return {
      fy: s.fy,
      profitPounds,
      ratePercent,
      rateLabel,
      taxPence,
    };
  });

  const grossTaxPence = slices.reduce((a, s) => a + s.taxPence, 0);

  let netTaxPence: number;
  let marginalReliefPence: number;
  if (band === "marginal") {
    netTaxPence = computeTaxChargePence(chargeablePenceWhole, {
      associatedCompanies: associates,
    });
    // Ensure MR is non-negative and gross − MR = net (pence)
    marginalReliefPence = Math.max(0, grossTaxPence - netTaxPence);
    netTaxPence = grossTaxPence - marginalReliefPence;
  } else if (band === "small") {
    netTaxPence = grossTaxPence; // already 19%
    marginalReliefPence = 0;
  } else {
    netTaxPence = grossTaxPence; // 25%
    marginalReliefPence = 0;
  }

  return {
    chargeableProfitPounds,
    slices,
    grossTaxPence,
    marginalReliefPence,
    netTaxPence,
    claimSmallProfitsOrMarginalRelief,
    band,
  };
}

/** Sanity: HMRC 9204 — tax pence equals pounds × percent. */
export function assertSliceTaxEqualsProfitTimesRate(
  slice: CtFinancialYearSlice,
): void {
  const expected = slice.profitPounds * slice.ratePercent;
  if (slice.taxPence !== expected) {
    throw new Error(
      `CT600 slice FY${slice.fy}: tax ${slice.taxPence} ≠ ${slice.profitPounds}×${slice.ratePercent}`,
    );
  }
}

// Re-export thresholds for callers that need narrative copy
export {
  CT_MAIN_RATE,
  CT_SMALL_PROFITS_RATE,
  CT_MARGINAL_LOWER_PENCE,
  CT_MARGINAL_UPPER_PENCE,
  CT_STANDARD_FRACTION,
};
