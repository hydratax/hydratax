/**
 * Canonical UK VAT rates (GOV.UK). Used by bank→VAT box mapping.
 * Keep in sync with `VAT_RATES` in `src/lib/hmrc-rulebook/rates.ts`.
 * Source: https://www.gov.uk/vat-rates
 */

export const VAT_STANDARD_RATE = 0.2;
export const VAT_REDUCED_RATE = 0.05;
export const VAT_ZERO_RATE = 0;

/** Inclusive gross → VAT element fraction (rate / (1 + rate)). */
export function vatInclusiveFraction(rate: number): number {
  if (rate <= 0) return 0;
  return rate / (1 + rate);
}

export const VAT_STANDARD_INCLUSIVE_FRACTION =
  vatInclusiveFraction(VAT_STANDARD_RATE); // 1/6
export const VAT_REDUCED_INCLUSIVE_FRACTION =
  vatInclusiveFraction(VAT_REDUCED_RATE); // 1/21
