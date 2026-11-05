import { addCalendarYear } from "@/lib/accounting-periods";

export type PublicCompanyInput = {
  company_number: string;
  company_name: string;
  company_status?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: Record<string, string | undefined>;
  accounts?: {
    next_due?: string;
    next_made_up_to?: string;
    last_accounts?: { made_up_to?: string; period_end_on?: string };
    next_accounts?: { period_end_on?: string; due_on?: string };
  };
  confirmation_statement?: {
    next_due?: string;
    next_made_up_to?: string;
  };
};

export type CompanyProfileFacts = {
  companyNumber: string;
  companyName: string;
  statusLabel: string;
  active: boolean;
  ageYears: number | null;
  sic: string | null;
  location: string | null;
  address: string | null;
  lastAccountsFiled: string | null;
  accountsDue: string | null;
  ct600Due: string | null;
  confirmationDate: string | null;
  yearEnd: string | null;
};

function iso(value?: string | null) {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function utcDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function daysUntil(isoDate: string | null, now = new Date()): number | null {
  if (!isoDate) return null;
  const due = utcDate(isoDate);
  if (!due) return null;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function wholeYears(createdOn: string | null, now = new Date()): number | null {
  if (!createdOn) return null;
  const created = utcDate(createdOn);
  if (!created) return null;
  let years = now.getUTCFullYear() - created.getUTCFullYear();
  const monthDay =
    now.getUTCMonth() < created.getUTCMonth() ||
    (now.getUTCMonth() === created.getUTCMonth() &&
      now.getUTCDate() < created.getUTCDate());
  if (monthDay) years -= 1;
  return Math.max(0, years);
}

export function formatUkDate(isoDate: string | null) {
  if (!isoDate) return null;
  const date = utcDate(isoDate);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function companyProfileFacts(
  profile: PublicCompanyInput,
  now = new Date(),
): CompanyProfileFacts {
  const address = profile.registered_office_address;
  const location =
    address?.locality || address?.region || address?.postal_code || null;
  const addressLine = [
    address?.address_line_1,
    address?.address_line_2,
    address?.locality,
    address?.region,
    address?.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const periodEnd =
    iso(profile.accounts?.next_accounts?.period_end_on) ||
    iso(profile.accounts?.next_made_up_to);
  const status = profile.company_status?.replace(/-/g, " ") || "Unknown";

  return {
    companyNumber: profile.company_number.toUpperCase(),
    companyName: profile.company_name,
    statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
    active: profile.company_status === "active",
    ageYears: wholeYears(iso(profile.date_of_creation), now),
    sic: profile.sic_codes?.[0] ?? null,
    location,
    address: addressLine || null,
    lastAccountsFiled:
      iso(profile.accounts?.last_accounts?.made_up_to) ||
      iso(profile.accounts?.last_accounts?.period_end_on),
    accountsDue:
      iso(profile.accounts?.next_accounts?.due_on) || iso(profile.accounts?.next_due),
    ct600Due: periodEnd ? addCalendarYear(periodEnd, 1) : null,
    confirmationDate:
      iso(profile.confirmation_statement?.next_made_up_to) ||
      iso(profile.confirmation_statement?.next_due),
    yearEnd: periodEnd,
  };
}
