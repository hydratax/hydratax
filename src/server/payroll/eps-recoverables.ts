/**
 * EPS RecoverableAmountsYTD — element names from
 * fixtures/hmrc-rti/(tax-year)/EmployerPaymentSummary.xsd only.
 */

import { escapeXml } from "@/server/hmrc/rti-submit";

export type EpsRecoverableAmounts = {
  /** Tax month 1–12 */
  taxMonth?: number;
  smpRecoveredPence?: number;
  sppRecoveredPence?: number;
  sapRecoveredPence?: number;
  shppRecoveredPence?: number;
  spbpRecoveredPence?: number;
  sncpRecoveredPence?: number;
  nicCompensationOnSmpPence?: number;
  nicCompensationOnSppPence?: number;
  nicCompensationOnSapPence?: number;
  nicCompensationOnShppPence?: number;
  nicCompensationOnSpbpPence?: number;
  nicCompensationOnSncpPence?: number;
};

function money(penceAmount: number): string {
  return (penceAmount / 100).toFixed(2);
}

function opt(tag: string, penceAmount: number | undefined): string {
  if (!penceAmount || penceAmount <= 0) return "";
  return `\n          <${tag}>${money(penceAmount)}</${tag}>`;
}

export function hasRecoverableAmounts(
  amounts: EpsRecoverableAmounts | null | undefined,
): boolean {
  if (!amounts) return false;
  return (
    (amounts.smpRecoveredPence ?? 0) > 0 ||
    (amounts.sppRecoveredPence ?? 0) > 0 ||
    (amounts.sapRecoveredPence ?? 0) > 0 ||
    (amounts.shppRecoveredPence ?? 0) > 0 ||
    (amounts.spbpRecoveredPence ?? 0) > 0 ||
    (amounts.sncpRecoveredPence ?? 0) > 0 ||
    (amounts.nicCompensationOnSmpPence ?? 0) > 0 ||
    (amounts.nicCompensationOnSppPence ?? 0) > 0 ||
    (amounts.nicCompensationOnSapPence ?? 0) > 0 ||
    (amounts.nicCompensationOnShppPence ?? 0) > 0 ||
    (amounts.nicCompensationOnSpbpPence ?? 0) > 0 ||
    (amounts.nicCompensationOnSncpPence ?? 0) > 0
  );
}

/** Build RecoverableAmountsYTD fragment (XSD order). */
export function buildRecoverableAmountsYtdXml(
  amounts: EpsRecoverableAmounts,
): string {
  const month =
    amounts.taxMonth != null
      ? `\n          <TaxMonth>${escapeXml(String(amounts.taxMonth))}</TaxMonth>`
      : "";
  return `<RecoverableAmountsYTD>${month}${opt("SMPRecovered", amounts.smpRecoveredPence)}${opt("SPPRecovered", amounts.sppRecoveredPence)}${opt("SAPRecovered", amounts.sapRecoveredPence)}${opt("ShPPRecovered", amounts.shppRecoveredPence)}${opt("SPBPRecovered", amounts.spbpRecoveredPence)}${opt("SNCPRecovered", amounts.sncpRecoveredPence)}${opt("NICCompensationOnSMP", amounts.nicCompensationOnSmpPence)}${opt("NICCompensationOnSPP", amounts.nicCompensationOnSppPence)}${opt("NICCompensationOnSAP", amounts.nicCompensationOnSapPence)}${opt("NICCompensationOnShPP", amounts.nicCompensationOnShppPence)}${opt("NICCompensationOnSPBP", amounts.nicCompensationOnSpbpPence)}${opt("NICCompensationOnSNCP", amounts.nicCompensationOnSncpPence)}
        </RecoverableAmountsYTD>`;
}
