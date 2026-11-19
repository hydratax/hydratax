/**
 * Class 1 NI engine — category letters + directors annual method. Integer pence.
 *
 * Sources:
 * - https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * - https://www.gov.uk/national-insurance-rates-letters
 * - https://www.gov.uk/guidance/national-insurance-for-company-directors
 */

import { multiplyPence, pence } from "@/server/money/pence";
import {
  niCategoryRates,
  ratesForTaxYear,
  type PayFrequency,
  type TaxYearKey,
} from "./rates";

export type NiCalcInput = {
  category: string;
  frequency: PayFrequency;
  /** Gross earnings subject to NI this period. */
  grossPence: number;
  /** Prior YTD NI'able gross (before this period). */
  ytdGrossPence: number;
  /** Prior YTD employee NI. */
  ytdEmployeeNiPence: number;
  /** Prior YTD employer NI. */
  ytdEmployerNiPence: number;
  /** Periods elapsed in tax year (for YTD band caps). */
  periodsElapsed?: number;
  taxYear?: string | TaxYearKey;
  /** Directors annual earnings period (AN). */
  directorsAnnualMethod?: boolean;
};

export type NiCalcResult = {
  employeeNiPence: number;
  employerNiPence: number;
  ytdEmployeeNiPence: number;
  ytdEmployerNiPence: number;
  bandsYtd: {
    atLelYtdPence: number;
    lelToPtYtdPence: number;
    ptToUelYtdPence: number;
  };
};

function applyBps(amountPence: number, rateBps: number): number {
  if (amountPence <= 0 || rateBps <= 0) return 0;
  return Number(multiplyPence(pence(amountPence), rateBps / 10_000));
}

function periodThresholds(
  rates: ReturnType<typeof ratesForTaxYear>,
  frequency: PayFrequency,
): { lel: number; pt: number; st: number; uel: number; fust: number; ust: number } {
  if (frequency === "W1") {
    return {
      lel: rates.lelWeeklyPence,
      pt: rates.ptWeeklyPence,
      st: rates.stWeeklyPence,
      uel: rates.uelWeeklyPence,
      fust: rates.fustWeeklyPence,
      ust: rates.ustWeeklyPence,
    };
  }
  return {
    lel: rates.lelMonthlyPence,
    pt: rates.ptMonthlyPence,
    st: rates.stMonthlyPence,
    uel: rates.uelMonthlyPence,
    fust: rates.fustMonthlyPence,
    ust: rates.ustMonthlyPence,
  };
}

function annualThresholds(rates: ReturnType<typeof ratesForTaxYear>) {
  return {
    lel: rates.lelAnnualPence,
    pt: rates.ptAnnualPence,
    st: rates.stAnnualPence,
    uel: rates.uelAnnualPence,
    fust: rates.fustAnnualPence,
    ust: rates.ustAnnualPence,
  };
}

function employeeNiOnEarnings(
  earningsPence: number,
  th: { lel: number; pt: number; uel: number },
  mainBps: number,
  additionalBps: number,
): number {
  if (earningsPence <= th.pt) return 0;
  const mainBand = Math.min(earningsPence, th.uel) - th.pt;
  const aboveUel = Math.max(0, earningsPence - th.uel);
  return applyBps(Math.max(0, mainBand), mainBps) + applyBps(aboveUel, additionalBps);
}

function employerNiOnEarnings(
  earningsPence: number,
  th: { st: number; fust: number; ust: number },
  shape: ReturnType<typeof niCategoryRates>["employerShape"],
  employerBps: number,
): number {
  if (earningsPence <= th.st) return 0;
  if (shape === "full_from_st") {
    return applyBps(earningsPence - th.st, employerBps);
  }
  if (shape === "zero_to_ust") {
    return applyBps(Math.max(0, earningsPence - th.ust), employerBps);
  }
  return applyBps(Math.max(0, earningsPence - th.fust), employerBps);
}

/** Floor to whole pounds — FPS AtLEL / LELtoPT / PTtoUEL are whole-pound figures. */
function wholePounds(penceAmount: number): number {
  if (penceAmount <= 0) return 0;
  return Math.floor(penceAmount / 100) * 100;
}

/**
 * Allocate YTD NI’able earnings into FPS band buckets against threshold caps.
 * Caps and earnings are floored to whole pounds so band edges match HMRC tables
 * (weekly / monthly / annual published figures are already whole pounds).
 */
export function allocateBandsYtd(
  ytdGrossPence: number,
  lelCap: number,
  ptCap: number,
  uelCap: number,
): NiCalcResult["bandsYtd"] {
  const ytd = wholePounds(ytdGrossPence);
  const lel = wholePounds(lelCap);
  const pt = wholePounds(ptCap);
  const uel = wholePounds(uelCap);
  let rem = ytd;
  const atLel = Math.min(rem, lel);
  rem -= atLel;
  const lelToPt = Math.min(rem, Math.max(0, pt - lel));
  rem -= lelToPt;
  const ptToUel = Math.min(rem, Math.max(0, uel - pt));
  return {
    atLelYtdPence: atLel,
    lelToPtYtdPence: lelToPt,
    ptToUelYtdPence: ptToUel,
  };
}

/** YTD threshold caps = period threshold × periods elapsed (GOV.UK table method). */
export function ytdThresholdCaps(
  rates: ReturnType<typeof ratesForTaxYear>,
  frequency: PayFrequency,
  periodsElapsed: number,
  directorsAnnualMethod?: boolean,
): { lel: number; pt: number; uel: number; st: number; fust: number; ust: number } {
  if (directorsAnnualMethod) {
    return annualThresholds(rates);
  }
  const n = Math.max(1, periodsElapsed);
  const th = periodThresholds(rates, frequency);
  return {
    lel: th.lel * n,
    pt: th.pt * n,
    uel: th.uel * n,
    st: th.st * n,
    fust: th.fust * n,
    ust: th.ust * n,
  };
}

/**
 * Ordinary period NI, or directors annual-method (AN):
 * compute NI on YTD gross with annual thresholds, subtract prior YTD NI.
 */
export function calculateClass1Ni(input: NiCalcInput): NiCalcResult {
  const rates = ratesForTaxYear(input.taxYear ?? "2026-27");
  const cat = niCategoryRates(input.category || "A");
  const ytdGross = input.ytdGrossPence + input.grossPence;
  const n = Math.max(1, input.periodsElapsed ?? 1);
  const caps = ytdThresholdCaps(
    rates,
    input.frequency,
    n,
    input.directorsAnnualMethod,
  );

  if (input.directorsAnnualMethod) {
    const th = annualThresholds(rates);
    const empYtd = employeeNiOnEarnings(
      ytdGross,
      th,
      cat.employeeMainBps,
      cat.employeeAdditionalBps,
    );
    const erYtd = employerNiOnEarnings(
      ytdGross,
      th,
      cat.employerShape,
      cat.employerBps,
    );
    // Period charge cannot go negative if prior YTD was overstated — clamp at 0.
    return {
      employeeNiPence: Math.max(0, empYtd - input.ytdEmployeeNiPence),
      employerNiPence: Math.max(0, erYtd - input.ytdEmployerNiPence),
      ytdEmployeeNiPence: empYtd,
      ytdEmployerNiPence: erYtd,
      bandsYtd: allocateBandsYtd(ytdGross, caps.lel, caps.pt, caps.uel),
    };
  }

  const th = periodThresholds(rates, input.frequency);
  const employeeNiPence = employeeNiOnEarnings(
    input.grossPence,
    th,
    cat.employeeMainBps,
    cat.employeeAdditionalBps,
  );
  const employerNiPence = employerNiOnEarnings(
    input.grossPence,
    th,
    cat.employerShape,
    cat.employerBps,
  );

  return {
    employeeNiPence,
    employerNiPence,
    ytdEmployeeNiPence: input.ytdEmployeeNiPence + employeeNiPence,
    ytdEmployerNiPence: input.ytdEmployerNiPence + employerNiPence,
    bandsYtd: allocateBandsYtd(ytdGross, caps.lel, caps.pt, caps.uel),
  };
}
