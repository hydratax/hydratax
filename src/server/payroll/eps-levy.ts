/**
 * EPS ApprenticeshipLevy fragment — XSD element names only.
 *
 * GOV.UK 2026–27 (and 2025–26): charge 0.5%, annual allowance £15,000.
 * https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * https://www.gov.uk/guidance/pay-apprenticeship-levy
 *
 * LevyDueYTD is net of allowance (whole pounds). AnnualAllce is the scheme’s
 * allocated annual allowance (usually £15,000).
 */

import { escapeXml } from "@/server/hmrc/rti-submit";

/** 0.5% — GOV.UK apprenticeship levy charge. */
export const APPRENTICESHIP_LEVY_BPS = 50;

/** £15,000 annual allowance (2025–26 / 2026–27). */
export const APPRENTICESHIP_LEVY_ALLOWANCE_PENCE = 15_000_00;

export type ApprenticeshipLevyAmounts = {
  /** Tax month 1–12 (required by XSD). */
  taxMonth: number;
  /** Levy due year-to-date, net of allowance (pence; filed as whole pounds). */
  levyDueYtdPence: number;
  /** Annual allowance allocated to this PAYE scheme (pence). */
  annualAllowancePence: number;
};

export function hasApprenticeshipLevy(
  amounts: ApprenticeshipLevyAmounts | null | undefined,
): boolean {
  if (!amounts) return false;
  return (
    amounts.taxMonth >= 1 &&
    amounts.taxMonth <= 12 &&
    (amounts.levyDueYtdPence >= 0 || amounts.annualAllowancePence > 0) &&
    // Require explicit levy reporting intent: allowance or due > 0
    (amounts.levyDueYtdPence > 0 || amounts.annualAllowancePence > 0)
  );
}

/** Floor to whole pounds for LevyDueYTD (IRwholeUnitsMonetaryType). */
export function wholePoundsPence(penceAmount: number): number {
  if (penceAmount <= 0) return 0;
  return Math.floor(penceAmount / 100) * 100;
}

/**
 * Cumulative levy due YTD = max(0, 0.5% × payBillYtd − allowance × taxMonth/12).
 * Result floored to whole pounds.
 */
export function computeLevyDueYtdPence(opts: {
  payBillYtdPence: number;
  taxMonth: number;
  annualAllowancePence?: number;
}): number {
  const month = Math.max(1, Math.min(12, Math.floor(opts.taxMonth)));
  const allowance =
    opts.annualAllowancePence ?? APPRENTICESHIP_LEVY_ALLOWANCE_PENCE;
  const levyGross = Math.floor(
    (Math.max(0, opts.payBillYtdPence) * APPRENTICESHIP_LEVY_BPS) / 10_000,
  );
  const allowanceToDate = Math.floor((allowance * month) / 12);
  return wholePoundsPence(Math.max(0, levyGross - allowanceToDate));
}

function money(penceAmount: number): string {
  return (Math.max(0, penceAmount) / 100).toFixed(2);
}

/** XSD order: LevyDueYTD → TaxMonth → AnnualAllce. */
export function buildApprenticeshipLevyXml(
  amounts: ApprenticeshipLevyAmounts,
): string {
  const due = wholePoundsPence(amounts.levyDueYtdPence);
  const allce = Math.min(
    APPRENTICESHIP_LEVY_ALLOWANCE_PENCE,
    Math.max(0, amounts.annualAllowancePence),
  );
  const month = Math.max(1, Math.min(12, Math.floor(amounts.taxMonth)));
  return `<ApprenticeshipLevy>
          <LevyDueYTD>${money(due)}</LevyDueYTD>
          <TaxMonth>${escapeXml(String(month))}</TaxMonth>
          <AnnualAllce>${money(allce)}</AnnualAllce>
        </ApprenticeshipLevy>`;
}
