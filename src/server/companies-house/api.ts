import { getEnv } from "@/lib/env";

const LIVE_BASE = "https://api.company-information.service.gov.uk";
const SANDBOX_BASE = "https://api-sandbox.company-information.service.gov.uk";

/** Test API keys only work on the sandbox host. */
export function getCompaniesHouseApiBase() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "test").toLowerCase();
  return env === "live" || env === "production" ? LIVE_BASE : SANDBOX_BASE;
}

export function isCompaniesHouseApiConfigured() {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY?.trim());
}

export function getCompaniesHouseEnvLabel() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "test").toLowerCase();
  return env === "live" || env === "production" ? "live" : "test";
}

function authHeader() {
  const key = process.env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "COMPANIES_HOUSE_API_KEY is not set. Create a free key at developer.company-information.service.gov.uk",
    );
  }
  // Companies House uses HTTP Basic with API key as username, blank password
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

async function chFetch<T>(path: string): Promise<T> {
  const base = getCompaniesHouseApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Companies House API ${res.status}: ${text.slice(0, 200) || res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

export type ChSearchItem = {
  company_number: string;
  title: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  address_snippet?: string;
};

export type ChCompanyProfile = {
  company_number: string;
  company_name: string;
  company_status?: string;
  type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: Record<string, string | undefined>;
  accounts?: { next_due?: string; last_accounts?: { made_up_to?: string } };
  confirmation_statement?: { next_due?: string; last_made_up_to?: string };
};

export type ChOfficer = {
  name: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  nationality?: string;
  occupation?: string;
  country_of_residence?: string;
  identity_verification_details?: {
    identity_verified_on?: string;
    appointment_verification_end_on?: string;
  };
};

export type ChPsc = {
  name?: string;
  kind?: string;
  natures_of_control?: string[];
  notified_on?: string;
  ceased_on?: string;
  nationality?: string;
  country_of_residence?: string;
};

/** Search by company name or number */
export async function searchCompanies(query: string, itemsPerPage = 10) {
  const q = encodeURIComponent(query.trim());
  const data = await chFetch<{ items?: ChSearchItem[] }>(
    `/search/companies?q=${q}&items_per_page=${itemsPerPage}`,
  );
  return data.items ?? [];
}

export async function getCompanyProfile(companyNumber: string) {
  return chFetch<ChCompanyProfile>(
    `/company/${encodeURIComponent(companyNumber)}`,
  );
}

export async function getCompanyOfficers(companyNumber: string) {
  const data = await chFetch<{ items?: ChOfficer[] }>(
    `/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=50`,
  );
  return data.items ?? [];
}

/**
 * Persons with significant control — closest structured “ownership” view.
 * Full historic shareholder lists are usually in filing documents, not this JSON API.
 */
export async function getCompanyPscs(companyNumber: string) {
  try {
    const data = await chFetch<{ items?: ChPsc[] }>(
      `/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control?items_per_page=50&start_index=0`,
    );
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function lookupCompanyBundle(companyNumber: string) {
  const [profile, officers, pscs] = await Promise.all([
    getCompanyProfile(companyNumber),
    getCompanyOfficers(companyNumber),
    getCompanyPscs(companyNumber),
  ]);
  return {
    profile,
    officers,
    pscs,
    source: {
      api: getCompaniesHouseApiBase(),
      register: "https://find-and-update.company-information.service.gov.uk/",
      note: "Data from Companies House Public Data API. PSC is not a full share register.",
      appUrl: getEnv().NEXT_PUBLIC_APP_URL,
    },
  };
}

/** Offline sample when API key missing — never claim it is live register data */
export function mockSearch(query: string): ChSearchItem[] {
  const q = query.toLowerCase();
  return [
    {
      company_number: "00000006",
      title: "SAMPLE COMPANY LIMITED",
      company_status: "active",
      company_type: "ltd",
      date_of_creation: "2000-01-01",
      address_snippet: "London (sample — set COMPANIES_HOUSE_API_KEY for live data)",
    },
  ].filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.company_number.includes(q) ||
      q.length < 2,
  );
}
