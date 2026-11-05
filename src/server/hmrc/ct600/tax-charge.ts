/**
 * Corporation Tax charge for a single accounting period of taxable profits.
 * Rates from GOV.UK (from 1 April 2023):
 * - ≤ £50,000: small profits rate 19%
 * - £50,001–£250,000: main rate 25% less marginal relief (standard fraction 3/200)
 * - > £250,000: main rate 25%
 *
 * Limits assume no associated companies. Pass `associatedCompanies` to divide
 * the thresholds (n + 1) when associates apply.
 *
 * @see https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax
 */

export const CT_SMALL_PROFITS_RATE = 0.19;
export const CT_MAIN_RATE = 0.25;
export const CT_MARGINAL_LOWER_PENCE = 5_000_000; // £50,000
export const CT_MARGINAL_UPPER_PENCE = 25_000_000; // £250,000
/** Standard fraction 3/200 */
export const CT_STANDARD_FRACTION = 3 / 200;

export function ctThresholdsPence(associatedCompanies = 0) {
  const n = Math.max(0, Math.floor(associatedCompanies)) + 1;
  return {
    lower: Math.floor(CT_MARGINAL_LOWER_PENCE / n),
    upper: Math.floor(CT_MARGINAL_UPPER_PENCE / n),
  };
}

export function computeTaxChargePence(
  taxableProfitPence: number,
  opts?: { associatedCompanies?: number; financialYear?: number },
): number {
  const profit = Math.round(taxableProfitPence);
  if (profit <= 0) return 0;

  // Pre–1 Apr 2023: single 19% rate for non-ring-fence profits.
  if (opts?.financialYear != null && opts.financialYear < 2023) {
    return Math.round(profit * CT_SMALL_PROFITS_RATE);
  }

  const { lower, upper } = ctThresholdsPence(opts?.associatedCompanies ?? 0);

  if (profit <= lower) {
    return Math.round(profit * CT_SMALL_PROFITS_RATE);
  }
  if (profit >= upper) {
    return Math.round(profit * CT_MAIN_RATE);
  }

  const atMain = profit * CT_MAIN_RATE;
  const marginalRelief = (upper - profit) * CT_STANDARD_FRACTION;
  return Math.max(0, Math.round(atMain - marginalRelief));
}

/**
 * HMRC CT600 XML TaxRate enumeration (not a bare percentage like "19.00").
 * Company type 00 must use one of these labels or gateway error 9209 fires.
 */
export function ctRateLabelForProfitPence(
  taxableProfitPence: number,
  opts?: { associatedCompanies?: number; financialYear?: number },
): "FULL RATE OF CT" | "SMALL CO RATE OF CT" {
  const profit = Math.round(taxableProfitPence);
  if (opts?.financialYear != null && opts.financialYear < 2023) {
    return "SMALL CO RATE OF CT";
  }
  const { lower } = ctThresholdsPence(opts?.associatedCompanies ?? 0);
  if (profit <= lower) return "SMALL CO RATE OF CT";
  // Marginal band uses full-rate rows + separate marginal relief
  return "FULL RATE OF CT";
}
