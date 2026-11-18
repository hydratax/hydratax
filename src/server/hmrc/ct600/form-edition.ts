/**
 * CT600 stationery / fill edition selected from the accounting period.
 * SDS packs land as soon as HMRC issues them; the correct form is chosen
 * by period so current filings stay on the live edition and future periods
 * use the new one from the HMRC effective date.
 *
 * CT600 (2027) Version 3 — draft SDS 17 Nov 2026 / form marked HMRC 04/27.
 * Use for accounting periods starting on or after 1 April 2027.
 */

export type Ct600FormEdition = "2026" | "2027";

/** First day the April 2027 CT600 stationery applies (AP start). */
export const CT600_2027_AP_START = "2027-04-01";

export function ct600FormEditionForPeriod(periodStart: string): Ct600FormEdition {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) return "2026";
  return periodStart >= CT600_2027_AP_START ? "2027" : "2026";
}

export function ct600TemplateFileName(edition: Ct600FormEdition): string {
  return edition === "2027" ? "CT600-2027-v3.pdf" : "CT600-2026-v3.pdf";
}

export function ct600SpecModuleName(edition: Ct600FormEdition): string {
  return edition === "2027" ? "spec-ct600-2027-v3.json" : "spec-ct600-v3.json";
}
