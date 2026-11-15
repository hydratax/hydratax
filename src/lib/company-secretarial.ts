/**
 * Company Secretarial desk — filing option catalogue + banded pricing.
 *
 * Pricing: £5 / month per band of 10 companies (ceil(n / 10) × £5).
 * Up to 10 → £5; 11–20 → £10; 21–30 → £15; …
 */

import { formatGBP } from "@/lib/pricing";

export const SECRETARIAL_BAND_SIZE = 10;
export const SECRETARIAL_PRICE_PER_BAND_POUNDS = 5;
export const SECRETARIAL_STARTER_MAX_COMPANIES = 10;
export const SECRETARIAL_SCALE_MIN_COMPANIES = 11;
export const SECRETARIAL_SCALE_MAX_COMPANIES = 10_000;

/** Monthly software fee for a given limited-company count. */
export function secretarialMonthlyPounds(companyCount: number): number {
  const n = Math.max(1, Math.floor(companyCount));
  return (
    Math.ceil(n / SECRETARIAL_BAND_SIZE) * SECRETARIAL_PRICE_PER_BAND_POUNDS
  );
}

export function secretarialBandsFor(companyCount: number): number {
  return Math.ceil(Math.max(1, Math.floor(companyCount)) / SECRETARIAL_BAND_SIZE);
}

export function formatSecretarialPriceLine(companyCount: number): string {
  const bands = secretarialBandsFor(companyCount);
  const pounds = secretarialMonthlyPounds(companyCount);
  return `${formatGBP(pounds)}/month · ${bands}×${formatGBP(SECRETARIAL_PRICE_PER_BAND_POUNDS)} per ${SECRETARIAL_BAND_SIZE} companies`;
}

export type SecretarialFilingStatus = "live" | "prepare" | "coming_soon";

export type SecretarialFilingOption = {
  id: string;
  title: string;
  summary: string;
  /** Companies House web-filing style category */
  category:
    | "company_details"
    | "officers"
    | "psc"
    | "share_capital"
    | "accounts_cs"
    | "closure";
  /** Existing CH service / filings route when live or prepare */
  href: string | null;
  status: SecretarialFilingStatus;
  statusLabel: string;
};

/**
 * Desk options mirroring typical Companies House web-filing groups.
 * Live/prepare hrefs point at existing Hydra wizards; scaffolded items stay honest.
 */
export const SECRETARIAL_FILING_OPTIONS: SecretarialFilingOption[] = [
  {
    id: "change-of-name",
    title: "Change of name",
    summary: "File a company name change (NM01) digitally.",
    category: "company_details",
    href: "/companies-house/change-of-name",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "change-of-name-same-day",
    title: "Same-day change of name",
    summary: "Expedited digital name change before the CH cut-off.",
    category: "company_details",
    href: "/companies-house/change-of-name-same-day",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "registered-office",
    title: "Change of registered office",
    summary: "Update the company’s registered office address (AD01).",
    category: "company_details",
    href: "/companies-house/change-registered-office",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "appoint-director",
    title: "Appoint a director",
    summary: "Appoint a director with personal code identity confirmation.",
    category: "officers",
    href: "/companies-house/appoint-director",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "resign-director",
    title: "Resign / terminate director",
    summary: "Notify Companies House that a director has left office.",
    category: "officers",
    href: "/companies-house/resign-director",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "notify-psc",
    title: "Notify a PSC",
    summary: "Register a person with significant control.",
    category: "psc",
    href: "/companies-house/notify-psc",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "change-psc",
    title: "Change of PSC details",
    summary: "Update an existing PSC’s particulars.",
    category: "psc",
    href: "/companies-house/change-psc",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "cease-psc",
    title: "Cease a PSC",
    summary: "Notify that a person is no longer a PSC.",
    category: "psc",
    href: "/companies-house/cease-psc",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "return-of-allotment",
    title: "Return of allotment of shares",
    summary: "File a return of allotment (SH01) for new shares.",
    category: "share_capital",
    href: "/companies-house/return-of-allotment",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "confirmation-statement",
    title: "Confirmation statement",
    summary: "Annual CS01 — confirm the register and director identity codes.",
    category: "accounts_cs",
    href: "/filings/confirmation-statement",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "accounts-ixbrl",
    title: "Annual accounts",
    summary: "File statutory accounts to Companies House (iXBRL).",
    category: "accounts_cs",
    href: "/filings/annual-accounts",
    status: "live",
    statusLabel: "Open",
  },
  {
    id: "dissolve-company",
    title: "Apply to dissolve",
    summary: "Strike-off application when the company is eligible to close.",
    category: "closure",
    href: "/companies-house/dissolve-company",
    status: "live",
    statusLabel: "Open",
  },
];

export const SECRETARIAL_CATEGORY_LABELS: Record<
  SecretarialFilingOption["category"],
  string
> = {
  company_details: "Company details",
  officers: "Directors & officers",
  psc: "Persons with significant control",
  share_capital: "Share capital",
  accounts_cs: "Confirmation statement & accounts",
  closure: "Closure",
};

/** Plan key helpers */
export const SECRETARIAL_SECTION_ID = "company-secretarial";
export const SECRETARIAL_STARTER_PLAN_NAME = "Up to 10 companies";
export const SECRETARIAL_SCALE_CHECKOUT_PREFIX = "company-secretarial:Scale";

export function secretarialStarterPlanKey() {
  return `${SECRETARIAL_SECTION_ID}:${SECRETARIAL_STARTER_PLAN_NAME}`;
}

export function secretarialScalePlanKey(companyCount: number) {
  const n = Math.max(
    SECRETARIAL_SCALE_MIN_COMPANIES,
    Math.min(SECRETARIAL_SCALE_MAX_COMPANIES, Math.floor(companyCount)),
  );
  return `${SECRETARIAL_SCALE_CHECKOUT_PREFIX}:${n}`;
}

export function parseSecretarialScaleCount(planKey: string): number | null {
  if (!planKey.startsWith(`${SECRETARIAL_SCALE_CHECKOUT_PREFIX}:`)) return null;
  const raw = planKey.slice(`${SECRETARIAL_SCALE_CHECKOUT_PREFIX}:`.length);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < SECRETARIAL_SCALE_MIN_COMPANIES) return null;
  return Math.min(SECRETARIAL_SCALE_MAX_COMPANIES, n);
}

export function isCompanySecretarialPlan(planKey: string) {
  return planKey.startsWith(`${SECRETARIAL_SECTION_ID}:`);
}

/** Company cap unlocked by a secretarial plan key (null = unlimited / practice desk). */
export function secretarialCompanyCapFromPlanKey(
  planKey: string,
): number | null {
  if (planKey === secretarialStarterPlanKey()) {
    return SECRETARIAL_STARTER_MAX_COMPANIES;
  }
  const scale = parseSecretarialScaleCount(planKey);
  if (scale != null) return scale;
  return null;
}
