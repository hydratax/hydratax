import { getEnv } from "@/lib/env";

const LIVE_BASE = "https://api.company-information.service.gov.uk";
const SANDBOX_BASE = "https://api-sandbox.company-information.service.gov.uk";

/** Live REST keys work on the production host. Test keys only work on sandbox. */
export function getCompaniesHouseApiBase() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "live").toLowerCase();
  return env === "test" || env === "sandbox" ? SANDBOX_BASE : LIVE_BASE;
}

export function isCompaniesHouseApiConfigured() {
  return Boolean(normalizeCompaniesHouseApiKey(process.env.COMPANIES_HOUSE_API_KEY));
}

export function getCompaniesHouseEnvLabel() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "live").toLowerCase();
  return env === "test" || env === "sandbox" ? "test" : "live";
}

function normalizeCompaniesHouseApiKey(raw: string | undefined) {
  // Strip all whitespace (keys are sometimes pasted with tabs/newlines).
  return (raw ?? "").replace(/\s+/g, "");
}

function authHeader() {
  const key = normalizeCompaniesHouseApiKey(process.env.COMPANIES_HOUSE_API_KEY);
  if (!key) {
    throw new Error(
      "COMPANIES_HOUSE_API_KEY is not set. Create a free key at developer.company-information.service.gov.uk",
    );
  }
  // Companies House uses HTTP Basic with API key as username, blank password
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

async function chFetch<T>(path: string, revalidate = 0): Promise<T> {
  const base = getCompaniesHouseApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    next: { revalidate },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `Company not found on Companies House (${path}). Check the company number, or search by company name instead.`,
      );
    }
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
    next_made_up_to?: string;
    last_accounts?: {
      made_up_to?: string;
      period_end_on?: string;
      period_start_on?: string;
      type?: string;
    };
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

export type AdvancedCompanySearchOpts = {
  sicCodes?: string[];
  location?: string;
  companyStatus?: string[];
  size?: number;
  startIndex?: number;
  revalidate?: number;
};

/**
 * Advanced register search — filter by SIC and/or registered-office location.
 * CH caps results (typically 5,000 per request / 10,000 per query).
 */
export async function advancedSearchCompanies(
  opts: AdvancedCompanySearchOpts,
): Promise<ChSearchItem[]> {
  const params = new URLSearchParams();
  const size = Math.min(Math.max(opts.size ?? 20, 1), 100);
  params.set("size", String(size));
  params.set("start_index", String(Math.max(0, opts.startIndex ?? 0)));
  for (const sic of opts.sicCodes ?? []) {
    const code = sic.replace(/\D/g, "").slice(0, 5);
    if (code) params.append("sic_codes", code);
  }
  if (opts.location?.trim()) {
    params.set("location", opts.location.trim());
  }
  for (const status of opts.companyStatus ?? ["active"]) {
    if (status) params.append("company_status", status);
  }
  const data = await chFetch<{
    items?: Array<
      ChSearchItem & {
        company_name?: string;
        registered_office_address?: {
          address_line_1?: string;
          locality?: string;
          postal_code?: string;
        };
      }
    >;
  }>(`/advanced-search/companies?${params.toString()}`, opts.revalidate ?? 86_400);

  // Advanced search uses company_name; normalise to search-item shape (title).
  return (data.items ?? []).map((item) => {
    const addr = item.registered_office_address;
    const snippet =
      item.address_snippet ||
      [addr?.address_line_1, addr?.locality, addr?.postal_code]
        .filter(Boolean)
        .join(", ") ||
      undefined;
    return {
      company_number: item.company_number,
      title: item.title || item.company_name || item.company_number,
      company_status: item.company_status,
      company_type: item.company_type,
      date_of_creation: item.date_of_creation,
      address_snippet: snippet,
    } satisfies ChSearchItem;
  });
}

export async function getCompanyProfile(
  companyNumber: string,
  revalidate = 0,
) {
  return chFetch<ChCompanyProfile>(
    `/company/${encodeURIComponent(companyNumber)}`,
    revalidate,
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

/**
 * SSRF guard for URLs that come back inside Companies House API responses.
 * Only https URLs on the official Companies House document hosts (or the S3
 * bucket host used for the signed content redirect) may be fetched.
 */
const CH_DOCUMENT_HOSTS = new Set([
  "document-api.company-information.service.gov.uk",
  "document-api-sandbox.company-information.service.gov.uk",
  "frontend-doc-api.company-information.service.gov.uk",
  "document-api.companieshouse.gov.uk",
  "api.company-information.service.gov.uk",
  "api-sandbox.company-information.service.gov.uk",
]);

export function assertCompaniesHouseUrl(
  raw: string,
  opts?: { allowS3?: boolean },
): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Refusing to fetch an invalid Companies House URL");
  }
  const host = u.hostname.toLowerCase();
  const hostOk =
    CH_DOCUMENT_HOSTS.has(host) ||
    (opts?.allowS3 === true && host.endsWith(".amazonaws.com"));
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !hostOk
  ) {
    throw new Error("Refusing to fetch a non-Companies House URL");
  }
  return u.toString();
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

function mapAccountsFilingItem(
  companyNumber: string,
  preferred: ChFilingHistoryItem,
): LastAccountsFiling {
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
}

function isAccountsAaType(type: string | undefined) {
  return /^(AA|AAMD|AA01|AA02|AA03|AA04|AA05|AA06)/i.test(type ?? "");
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
      items.find((i) => isAccountsAaType(i.type)) ?? items[0];
    if (!preferred) return null;
    return mapAccountsFilingItem(companyNumber, preferred);
  } catch {
    return null;
  }
}

/**
 * Accounts filing to use as the comparative year:
 * - exact made-up-to match for `targetMadeUpTo` when present
 * - else the latest AA filing with made-up-to strictly before `currentPeriodEnd`
 * - else the latest AA filing
 */
export async function getAccountsFilingForComparatives(
  companyNumber: string,
  opts?: { targetMadeUpTo?: string | null; currentPeriodEnd?: string | null },
): Promise<LastAccountsFiling | null> {
  try {
    const data = await chFetch<{ items?: ChFilingHistoryItem[] }>(
      `/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts&items_per_page=25`,
    );
    const items = (data.items ?? []).filter((i) => isAccountsAaType(i.type));
    const pool = items.length ? items : (data.items ?? []);
    if (!pool.length) return null;

    const target = opts?.targetMadeUpTo;
    if (target) {
      const exact = pool.find(
        (i) => i.description_values?.made_up_date === target,
      );
      if (exact) return mapAccountsFilingItem(companyNumber, exact);
    }

    const currentEnd = opts?.currentPeriodEnd;
    if (currentEnd) {
      const earlier = pool.find((i) => {
        const made = i.description_values?.made_up_date;
        return Boolean(made && made < currentEnd);
      });
      if (earlier) return mapAccountsFilingItem(companyNumber, earlier);
    }

    return mapAccountsFilingItem(companyNumber, pool[0]!);
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
  const metaUrl = assertCompaniesHouseUrl(
    normalizeDocumentApiUrl(documentMetadataUrl),
  );
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

function pickDocumentContentType(
  meta: ChDocumentMetadata,
  preferIxbrl = false,
) {
  const resources = meta.resources ?? {};
  if (preferIxbrl) {
    if (resources["application/xhtml+xml"]) return "application/xhtml+xml";
    if (resources["application/xml"]) return "application/xml";
    if (resources["text/html"]) return "text/html";
  }
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
 * Download a filing document via the Companies House Document API.
 * Content requests return a 302 to S3 — follow without the API key.
 */
export async function downloadFilingDocument(
  documentMetadataUrl: string,
  opts?: { preferIxbrl?: boolean },
): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  pages: number | null;
}> {
  const auth = authHeader();
  const meta = await fetchDocumentMetadata(documentMetadataUrl);
  const contentType = pickDocumentContentType(meta, opts?.preferIxbrl === true);
  if (!contentType || !meta.links?.document) {
    throw new Error("No downloadable document content on this filing");
  }

  const contentUrl = assertCompaniesHouseUrl(
    normalizeDocumentApiUrl(meta.links.document),
  );
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
    // S3 signed URL — do not send API key (only follow to https S3/CH hosts)
    finalRes = await fetch(assertCompaniesHouseUrl(location, { allowS3: true }), {
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

/** Prefer iXBRL/XHTML so we can extract comparative figures. */
export async function downloadFilingDocumentPreferringIxbrl(
  documentMetadataUrl: string,
) {
  return downloadFilingDocument(documentMetadataUrl, { preferIxbrl: true });
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
