/** Company legal copy for HydraTax public pages. */

export const LEGAL_CONTACT_EMAIL = "info@hydratax.uk";

export const LEGAL_COMPANY = {
  /** Public product / brand name */
  tradingName: "HydraTax",
  /** Registered company name (Companies House) */
  legalName: "Hydra Consultancy Services Ltd",
  companyNumber: "14633422",
  supportEmail: LEGAL_CONTACT_EMAIL,
  companiesHouseUrl:
    "https://find-and-update.company-information.service.gov.uk/company/14633422",
} as const;

/** e.g. "Hydra Consultancy Services Ltd trading as HydraTax" */
export function legalTradingAs(): string {
  return `${LEGAL_COMPANY.legalName} trading as ${LEGAL_COMPANY.tradingName}`;
}

export const LEGAL_UPDATED = {
  terms: "13 August 2026",
  dpa: "8 August 2026",
} as const;
