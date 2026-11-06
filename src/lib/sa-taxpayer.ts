/**
 * Personal Self Assessment taxpayers linked to a practice client.
 *
 * Limited companies file CT600 for the company; directors and shareholders
 * often need a personal SA100 for employment, dividends, interest, etc.
 * Sole traders / partners are themselves the taxpayer.
 */

import type { SaCompanyIncome, SaOtherIncome } from "@/lib/sa-income";

export const SA_TAXPAYER_ROLES = [
  "director",
  "shareholder",
  "director_shareholder",
  "partner",
  "sole_trader",
  "other",
] as const;

export type SaTaxpayerRole = (typeof SA_TAXPAYER_ROLES)[number];

export type SaTaxpayer = {
  id: string;
  fullName: string;
  role: SaTaxpayerRole;
  /** National Insurance number */
  nino: string;
  /**
   * Personal Self Assessment UTR — never the limited company CT UTR.
   * Company UTRs live on the company client record for CT600.
   */
  utr: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  /** SA100-style occupation / nature of trade */
  occupation?: string;
  /**
   * Business / trading name when self-employed without a limited company
   * (sole trader “trading as”).
   */
  tradingAs?: string;
  /** From Companies House officer / PSC sync when available */
  appointedOn?: string | null;
  shareholdingNote?: string;
  /** Income from each company this person directs / owns */
  companyIncomes?: SaCompanyIncome[];
  /** Rental, taxi, other payroll, freelance, etc. */
  otherIncomes?: SaOtherIncome[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Canonical person key for matching CH officer vs PSC spellings.
 * "JAVED, Muhammad Usama" and "Mr Muhammad Usama Javed" → same key.
 */
export function normalizePersonName(name: string): string {
  let s = name.toLowerCase().trim();
  // Companies House officers often use "SURNAME, Forenames"
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2);
    s = `${(rest ?? "").trim()} ${(last ?? "").trim()}`;
  }
  s = s
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(mr|mrs|ms|miss|dr|sir|lord|lady)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Order-independent so forename/surname swaps still match
  return s.split(/\s+/).filter(Boolean).sort().join(" ");
}

/** Prefer a readable "Forename Surname" display over "SURNAME, Forename". */
export function displayPersonName(name: string): string {
  let s = name.trim();
  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2);
    s = `${(rest ?? "").trim()} ${(last ?? "").trim()}`;
  }
  s = s
    .replace(/^(mr|mrs|ms|miss|dr|sir)\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return name.trim();
  return s.replace(/\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function mergeTaxpayerRoles(
  a: SaTaxpayerRole,
  b: SaTaxpayerRole,
): SaTaxpayerRole {
  const set = new Set([a, b]);
  if (set.has("director") && set.has("shareholder")) {
    return "director_shareholder";
  }
  if (set.has("director_shareholder")) return "director_shareholder";
  if (set.has("director") && b === "director_shareholder") {
    return "director_shareholder";
  }
  if (a === "director" || b === "director") return "director";
  if (a === "shareholder" || b === "shareholder") return "shareholder";
  return a;
}

export const SA_BOOK_KINDS = [
  "receipt",
  "p60",
  "bank_statement",
  "books",
  "other",
  "invoice",
] as const;

export type SaBookKind = (typeof SA_BOOK_KINDS)[number];

export const SA_BOOK_KIND_LABELS: Record<SaBookKind, string> = {
  invoice: "Invoices",
  receipt: "Receipts",
  p60: "P60 / employment",
  bank_statement: "Bank statements",
  books: "Bookkeeping",
  other: "Other SA records",
};

/** Document category encoding: sa:{taxpayerId}:{kind} */
export function saBookCategory(taxpayerId: string, kind: SaBookKind): string {
  return `sa:${taxpayerId}:${kind}`;
}

export function parseSaBookCategory(category: string): {
  taxpayerId: string;
  kind: SaBookKind;
} | null {
  const m = /^sa:([^:]+):([a-z0-9_]+)$/i.exec(category.trim());
  if (!m) return null;
  const kind = m[2] as SaBookKind;
  if (!(SA_BOOK_KINDS as readonly string[]).includes(kind)) return null;
  return { taxpayerId: m[1], kind };
}

export function roleLabel(role: SaTaxpayerRole): string {
  switch (role) {
    case "director":
      return "Director";
    case "shareholder":
      return "Shareholder";
    case "director_shareholder":
      return "Director & shareholder";
    case "partner":
      return "Partner";
    case "sole_trader":
      return "Sole trader";
    default:
      return "Taxpayer";
  }
}

/** Short face label for a company role inside a person card. */
export function companyRoleLabel(
  role: "director" | "shareholder" | "director_shareholder" | SaTaxpayerRole,
): string {
  if (role === "director_shareholder") return "Director & shareholder";
  if (role === "shareholder") return "Shareholder";
  if (role === "director") return "Director";
  return roleLabel(role);
}

/** "Director of 2 companies · Shareholder of 1 company" */
export function personCompanySummary(input: {
  directorOf: number;
  shareholderOf: number;
  companyCount: number;
}): string {
  const bits: string[] = [];
  if (input.directorOf > 0) {
    bits.push(
      `Director of ${input.directorOf} compan${input.directorOf === 1 ? "y" : "ies"}`,
    );
  }
  if (input.shareholderOf > 0) {
    bits.push(
      `Shareholder of ${input.shareholderOf} compan${input.shareholderOf === 1 ? "y" : "ies"}`,
    );
  }
  if (bits.length === 0) {
    bits.push(
      `${input.companyCount} compan${input.companyCount === 1 ? "y" : "ies"}`,
    );
  }
  return bits.join(" · ");
}

export function emptySaTaxpayer(
  partial?: Partial<SaTaxpayer>,
): Omit<SaTaxpayer, "id" | "createdAt" | "updatedAt"> {
  return {
    fullName: partial?.fullName ?? "",
    role: partial?.role ?? "sole_trader",
    nino: partial?.nino ?? "",
    utr: partial?.utr ?? "",
    dateOfBirth: partial?.dateOfBirth ?? "",
    email: partial?.email ?? "",
    phone: partial?.phone ?? "",
    address: partial?.address ?? "",
    occupation: partial?.occupation ?? "",
    tradingAs: partial?.tradingAs ?? "",
    appointedOn: partial?.appointedOn ?? null,
    shareholdingNote: partial?.shareholdingNote ?? "",
  };
}

/** Person-level SA role from practice company links (CH officers / PSCs). */
export function roleFromCompanyLinks(input: {
  directorOf: number;
  shareholderOf: number;
}): SaTaxpayerRole {
  if (input.directorOf > 0 && input.shareholderOf > 0) {
    return "director_shareholder";
  }
  if (input.directorOf > 0) return "director";
  if (input.shareholderOf > 0) return "shareholder";
  return "other";
}
