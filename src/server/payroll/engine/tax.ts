/**
 * PAYE Income Tax engine — cumulative + Week1/Month1, integer pence.
 * Tax codes: numeric L (+ S/C regime), BR, 0T, NT, K; W1/M1/X non-cumulative.
 */

import { multiplyPence, pence } from "@/server/money/pence";
import {
  periodShare,
  periodsInYear,
  ratesForTaxYear,
  type PayFrequency,
  type PayrollRates,
  type TaxBand,
  type TaxRegime,
  type TaxYearKey,
} from "./rates";

export type TaxBasis = "cumulative" | "week1Month1";

export type ParsedTaxCode = {
  raw: string;
  /** Code body without regime prefix / basis suffix (e.g. 1257L). */
  fpsCode: string;
  regime: TaxRegime;
  basis: TaxBasis;
  /** Positive = free pay allowance; negative = K code additive. */
  annualAllowancePence: number;
  special: "none" | "BR" | "0T" | "NT" | "D0" | "D1";
};

export type TaxCalcInput = {
  taxCode: string;
  /** Explicit override; otherwise parsed from code suffix. */
  taxBasis?: TaxBasis;
  frequency: PayFrequency;
  /** Taxable pay this period (after employee pension that reduces taxable). */
  taxablePayPence: number;
  /** Prior YTD taxable (before this period). */
  ytdTaxablePence: number;
  /** Prior YTD tax deducted (before this period). */
  ytdTaxPence: number;
  periodsElapsed: number;
  taxYear?: string | TaxYearKey;
};

export type TaxCalcResult = {
  taxPence: number;
  ytdTaxPence: number;
  parsed: ParsedTaxCode;
  freePayToDatePence: number;
  taxableToDatePence: number;
};

/** Apply rate in basis points to pence; half-away-from-zero. */
export function taxAtBps(amountPence: number, rateBps: number): number {
  if (amountPence <= 0 || rateBps <= 0) return 0;
  return Number(multiplyPence(pence(amountPence), rateBps / 10_000));
}

export function parseTaxCode(raw: string, taxBasisOverride?: TaxBasis): ParsedTaxCode {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  let regime: TaxRegime = "UK";
  let body = cleaned;
  if (body.startsWith("S")) {
    regime = "S";
    body = body.slice(1);
  } else if (body.startsWith("C")) {
    regime = "C";
    body = body.slice(1);
  }

  let basis: TaxBasis = taxBasisOverride ?? "cumulative";
  if (/W1|M1|X$/.test(body)) {
    basis = "week1Month1";
    body = body.replace(/(W1|M1|X)$/, "");
  }

  if (body === "BR") {
    return {
      raw: cleaned,
      fpsCode: "BR",
      regime,
      basis,
      annualAllowancePence: 0,
      special: "BR",
    };
  }
  if (body === "0T" || body === "OT") {
    return {
      raw: cleaned,
      fpsCode: "0T",
      regime,
      basis,
      annualAllowancePence: 0,
      special: "0T",
    };
  }
  if (body === "NT") {
    return {
      raw: cleaned,
      fpsCode: "NT",
      regime,
      basis,
      annualAllowancePence: 0,
      special: "NT",
    };
  }
  if (body === "D0") {
    return {
      raw: cleaned,
      fpsCode: "D0",
      regime,
      basis,
      annualAllowancePence: 0,
      special: "D0",
    };
  }
  if (body === "D1") {
    return {
      raw: cleaned,
      fpsCode: "D1",
      regime,
      basis,
      annualAllowancePence: 0,
      special: "D1",
    };
  }

  const k = /^K(\d+)([A-Z]?)$/.exec(body);
  if (k) {
    const n = Number(k[1]);
    return {
      raw: cleaned,
      fpsCode: `K${k[1]}${k[2] || ""}`,
      regime,
      basis,
      annualAllowancePence: -(n * 1000),
      special: "none",
    };
  }

  const m = /^(\d+)([A-Z]?)$/.exec(body);
  if (m) {
    const n = Number(m[1]);
    const suffix = m[2] || "L";
    return {
      raw: cleaned,
      fpsCode: `${m[1]}${suffix}`,
      regime,
      basis,
      annualAllowancePence: n * 1000,
      special: "none",
    };
  }

  // Fallback — treat as standard PA code 1257L
  return {
    raw: cleaned || "1257L",
    fpsCode: "1257L",
    regime,
    basis,
    annualAllowancePence: 12_570_00,
    special: "none",
  };
}

function bandsFor(parsed: ParsedTaxCode, rates: PayrollRates): TaxBand[] {
  if (parsed.regime === "S") return rates.scottishBands;
  if (parsed.regime === "C") return rates.welshBands;
  return rates.rukBands;
}

function taperedAllowance(
  annualAllowancePence: number,
  estimatedAnnualTaxablePence: number,
  rates: PayrollRates,
): number {
  if (annualAllowancePence <= 0) return annualAllowancePence;
  if (estimatedAnnualTaxablePence <= rates.paTaperFromPence) {
    return Math.min(annualAllowancePence, rates.personalAllowancePence);
  }
  const over = estimatedAnnualTaxablePence - rates.paTaperFromPence;
  const reduction = Math.floor(over / 2);
  // Align to whole pounds (HMRC PA taper)
  const reduced = Math.max(0, annualAllowancePence - Math.floor(reduction / 100) * 100);
  return reduced;
}

function taxOnTaxableIncome(
  taxableIncomePence: number,
  bands: TaxBand[],
  special: ParsedTaxCode["special"],
  rates: PayrollRates,
): number {
  if (taxableIncomePence <= 0) return 0;
  if (special === "NT") return 0;
  if (special === "BR") return taxAtBps(taxableIncomePence, 2000);
  if (special === "D0") return taxAtBps(taxableIncomePence, 4000);
  if (special === "D1") return taxAtBps(taxableIncomePence, 4500);
  // 0T and normal codes: apply bands from £0 of taxable income
  let remaining = taxableIncomePence;
  let tax = 0;
  for (const band of bands) {
    if (remaining <= 0) break;
    const width = band.widthPence === 0 ? remaining : Math.min(remaining, band.widthPence);
    tax += taxAtBps(width, band.rateBps);
    remaining -= width;
  }
  // Guard unused rates reference for future emergency-code variants
  void rates;
  return tax;
}

/**
 * Compute period PAYE tax. Cumulative uses proportioned free pay + bands to date;
 * Week1/Month1 taxes this period alone then adds to YTD.
 */
export function calculatePayeTax(input: TaxCalcInput): TaxCalcResult {
  const rates = ratesForTaxYear(input.taxYear ?? "2026-27");
  const parsed = parseTaxCode(input.taxCode, input.taxBasis);
  const periods = periodsInYear(input.frequency);
  const nonCumulative = parsed.basis === "week1Month1";
  const periodsElapsed = nonCumulative
    ? 1
    : Math.max(1, Math.min(periods, input.periodsElapsed || 1));

  const ytdTaxableIncluding =
    (nonCumulative ? 0 : input.ytdTaxablePence) + input.taxablePayPence;
  const priorTax = nonCumulative ? 0 : input.ytdTaxPence;

  // Estimate annual income for PA taper (annualise cumulative taxable to date)
  const estimatedAnnual =
    nonCumulative
      ? input.taxablePayPence * periods
      : Math.floor((ytdTaxableIncluding * periods) / periodsElapsed);

  const annualAllowance = taperedAllowance(
    parsed.annualAllowancePence,
    estimatedAnnual,
    rates,
  );

  const freePayToDate =
    parsed.special === "none"
      ? periodShare(annualAllowance, periodsElapsed, periods)
      : 0;

  // K codes: free pay is negative → more taxable
  const taxableToDate = Math.max(0, ytdTaxableIncluding - freePayToDate);

  // Proportion band widths to periods elapsed for cumulative; full for W1/M1 period
  const bands = bandsFor(parsed, rates).map((b) => ({
    ...b,
    widthPence:
      b.widthPence === 0
        ? 0
        : nonCumulative
          ? periodShare(b.widthPence, 1, periods)
          : periodShare(b.widthPence, periodsElapsed, periods),
  }));

  const taxToDate = taxOnTaxableIncome(taxableToDate, bands, parsed.special, rates);
  const periodTax = taxToDate - priorTax;

  return {
    taxPence: periodTax,
    ytdTaxPence: nonCumulative ? input.ytdTaxPence + periodTax : taxToDate,
    parsed,
    freePayToDatePence: freePayToDate,
    taxableToDatePence: taxableToDate,
  };
}
