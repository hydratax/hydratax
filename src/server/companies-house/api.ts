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
  accounts?: {
    next_due?: string;
    last_accounts?: { made_up_to?: string };
    next_accounts?: {
      period_start_on?: string;
      period_end_on?: string;
      due_on?: string;
    };
  };
  confirmation_statement?: {
    next_due?: string;
    next_made_up_to?: string;
    last_made_up_to?: string;
  };
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
  /** Present on live API when the PSC has left the register */
  ceased?: boolean;
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

export type ChFilingHistoryItem = {
  transaction_id: string;
  description?: string;
  date?: string;
  type?: string;
  category?: string;
  pages?: number;
  barcode?: string;
  description_values?: { made_up_date?: string };
  links?: {
    self?: string;
    document_metadata?: string;
  };
};

export type LastAccountsFiling = {
  transactionId: string;
  type: string | null;
  description: string;
  filedOn: string | null;
  madeUpTo: string | null;
  pages: number | null;
  registerUrl: string;
  companyFilingHistoryUrl: string;
  documentMetadataUrl: string | null;
};

const FILING_DESCRIPTION_LABELS: Record<string, string> = {
  "accounts-with-accounts-type-micro-entity": "Micro-entity accounts",
  "accounts-with-accounts-type-full": "Full accounts",
  "accounts-with-accounts-type-small": "Small company accounts",
  "accounts-with-accounts-type-medium": "Medium company accounts",
  "accounts-with-accounts-type-large": "Large company accounts",
  "accounts-with-accounts-type-audit-exempt-subsidiary":
    "Audit-exempt subsidiary accounts",
  "accounts-with-accounts-type-dormant": "Dormant company accounts",
  "accounts-with-accounts-type-total-exemption-full":
    "Total exemption full accounts",
  "accounts-with-accounts-type-total-exemption-small":
    "Total exemption small accounts",
  "accounts-with-accounts-type-partial-exemption": "Partial exemption accounts",
  "legacy-accounts": "Accounts",
  "change-account-reference-date-companies-house-limited-by-guarantee-company":
    "Change of accounting reference date",
};

export function humanizeFilingDescription(raw: string | undefined) {
  if (!raw) return "Accounts";
  if (FILING_DESCRIPTION_LABELS[raw]) return FILING_DESCRIPTION_LABELS[raw];
  if (!raw.includes("-")) return raw;
  return raw
    .replace(/^accounts-with-accounts-type-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeDocumentApiUrl(url: string) {
  return url
    .replace(
      "frontend-doc-api.company-information.service.gov.uk",
      "document-api.company-information.service.gov.uk",
    )
    .replace(
      "document-api.companieshouse.gov.uk",
      "document-api.company-information.service.gov.uk",
    );
}

/** Most recent accounts filing from the public register (AA / micro / etc.). */
export async function getLastAccountsFiling(
  companyNumber: string,
): Promise<LastAccountsFiling | null> {
  try {
    const data = await chFetch<{ items?: ChFilingHistoryItem[] }>(
      `/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts&items_per_page=15`,
    );
    const items = data.items ?? [];
    const preferred =
      items.find((i) =>
        /^(AA|AAMD|AA01|AA02|AA03|AA04|AA05|AA06)/i.test(i.type ?? ""),
      ) ?? items[0];
    if (!preferred) return null;
    const registerBase =
      "https://find-and-update.company-information.service.gov.uk";
    const meta = preferred.links?.document_metadata
      ? normalizeDocumentApiUrl(preferred.links.document_metadata)
      : null;
    return {
      transactionId: preferred.transaction_id,
      type: preferred.type ?? null,
      description: humanizeFilingDescription(preferred.description),
      filedOn: preferred.date ?? null,
      madeUpTo: preferred.description_values?.made_up_date ?? null,
      pages: preferred.pages ?? null,
      registerUrl: `${registerBase}/company/${encodeURIComponent(companyNumber)}/filing-history/${encodeURIComponent(preferred.transaction_id)}`,
      companyFilingHistoryUrl: `${registerBase}/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts`,
      documentMetadataUrl: meta,
    };
  } catch {
    return null;
  }
}

type ChDocumentMetadata = {
  company_number?: string;
  filename?: string;
  pages?: number;
  links?: { self?: string; document?: string };
  resources?: Record<string, { content_length?: number }>;
};

async function fetchDocumentMetadata(documentMetadataUrl: string) {
  const auth = authHeader();
  const metaUrl = normalizeDocumentApiUrl(documentMetadataUrl);
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => "");
    throw new Error(
      `Companies House document metadata ${metaRes.status}: ${text.slice(0, 200) || metaRes.statusText}`,
    );
  }
  return (await metaRes.json()) as ChDocumentMetadata;
}

function pickDocumentContentType(meta: ChDocumentMetadata) {
  const resources = meta.resources ?? {};
  if (resources["application/pdf"]) return "application/pdf";
  if (resources["application/xhtml+xml"]) return "application/xhtml+xml";
  return Object.keys(resources)[0] ?? null;
}

/** Lightweight check that a filing document is downloadable (no PDF bytes). */
export async function peekFilingDocument(documentMetadataUrl: string) {
  const meta = await fetchDocumentMetadata(documentMetadataUrl);
  const contentType = pickDocumentContentType(meta);
  if (!contentType || !meta.links?.document) {
    throw new Error("No downloadable document content on this filing");
  }
  return {
    contentType,
    filename: meta.filename?.trim() || null,
    pages: meta.pages ?? null,
  };
}

/**
 * Download a filing document (PDF preferred) via the Companies House Document API.
 * Content requests return a 302 to S3 — follow without the API key.
 */
export async function downloadFilingDocument(
  documentMetadataUrl: string,
): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  pages: number | null;
}> {
  const auth = authHeader();
  const meta = await fetchDocumentMetadata(documentMetadataUrl);
  const contentType = pickDocumentContentType(meta);
  if (!contentType || !meta.links?.document) {
    throw new Error("No downloadable document content on this filing");
  }

  const contentUrl = normalizeDocumentApiUrl(meta.links.document);
  const contentRes = await fetch(contentUrl, {
    headers: {
      Authorization: auth,
      Accept: contentType,
    },
    redirect: "manual",
    cache: "no-store",
  });

  let finalRes = contentRes;
  if (contentRes.status === 302 || contentRes.status === 301) {
    const location = contentRes.headers.get("location");
    if (!location) {
      throw new Error("Companies House document redirect missing Location");
    }
    // S3 signed URL — do not send API key
    finalRes = await fetch(location, {
      headers: { Accept: contentType },
      cache: "no-store",
    });
  }

  if (!finalRes.ok) {
    const text = await finalRes.text().catch(() => "");
    throw new Error(
      `Companies House document content ${finalRes.status}: ${text.slice(0, 200) || finalRes.statusText}`,
    );
  }

  const bytes = await finalRes.arrayBuffer();
  const filename =
    meta.filename?.trim() ||
    (contentType === "application/pdf"
      ? "accounts.pdf"
      : "accounts.xhtml");

  return {
    bytes,
    contentType: finalRes.headers.get("content-type") || contentType,
    filename,
    pages: meta.pages ?? null,
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
