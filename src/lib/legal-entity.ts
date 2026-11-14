/**
 * Single source of truth for the legal-entity facts shown on the Privacy
 * Notice, DPA, cookie notice and security pages.
 *
 * OWNER ACTION: replace every value that starts with "[TODO" below. Do NOT
 * invent values — public pages render these strings verbatim, and
 * `pendingLegalEntityTodos()` is asserted in tests so TODOs stay visible
 * until they are completed.
 *
 * Values that already exist elsewhere (`src/lib/legal.ts`) are re-used so the
 * two files cannot drift.
 */

import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";

/** Marker prefix used for unfilled owner facts. */
export const TODO_PREFIX = "[TODO";

export function todo(what: string): string {
  return `${TODO_PREFIX}: ${what}]`;
}

export function isTodoValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(TODO_PREFIX);
}

export const LEGAL_ENTITY = {
  /** Controller for account / website data (UK GDPR Art 4(7)). */
  legalName: LEGAL_COMPANY.legalName,
  tradingName: LEGAL_COMPANY.tradingName,
  /** From legal.ts — owner: confirm it matches Companies House. */
  companyNumber: LEGAL_COMPANY.companyNumber,
  companiesHouseUrl: LEGAL_COMPANY.companiesHouseUrl,
  registeredOffice: todo(
    "registered office address exactly as on Companies House",
  ),
  /** ICO data protection fee registration (Z-number). */
  icoRegistrationNumber: todo(
    "ICO registration number (Z…) — pay the data protection fee at ico.org.uk",
  ),
  /** General privacy / data-rights contact (existing public inbox). */
  privacyEmail: LEGAL_CONTACT_EMAIL,
  /** Security incidents and breach reports from customers. */
  securityEmail: LEGAL_CONTACT_EMAIL,
  securityEmailNote: todo(
    "create a dedicated security@ mailbox/alias and replace securityEmail",
  ),
  /** Data Protection Officer — only mandatory in specific cases (Art 37). */
  dpoStatus: todo(
    "confirm with counsel whether a DPO is required; if not, say 'not appointed'",
  ),
  dpoName: todo("DPO / privacy lead name (or 'Privacy lead')"),
  dpoEmail: LEGAL_CONTACT_EMAIL,
  postalAddressForRequests: todo(
    "postal address for written data-rights requests (usually the registered office)",
  ),
  /** Customer breach notice target (DPA §9). */
  processorBreachNoticeHours: 48,
  /** Supabase / hosting region facts the owner must confirm. */
  hostingRegion: todo(
    "Supabase project region and Netlify function region (UK/EU/US) — record in docs/security/ropa.md",
  ),
  icoComplaintUrl: "https://ico.org.uk/make-a-complaint/",
  icoPhone: "0303 123 1113",
} as const;

/** All placeholder fields still unfilled — surfaced by tests and reports. */
export function pendingLegalEntityTodos(): string[] {
  return Object.entries(LEGAL_ENTITY)
    .filter(([, v]) => typeof v === "string" && isTodoValue(v))
    .map(([k]) => k);
}
