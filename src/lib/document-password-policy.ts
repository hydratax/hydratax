/**
 * Practice-wide rules for locking client document packs.
 * Each desk section picks an identifier; HydraTax derives the password from
 * that client’s record (never a shared practice password).
 */

export type DocumentPasswordSection =
  | "sa"
  | "ct"
  | "accounts"
  | "vat"
  | "payroll"
  | "letters"
  | "invoices";

export type DocumentPasswordIdentifier =
  | "none"
  | "date_of_birth"
  | "personal_utr"
  | "company_utr"
  | "nino"
  | "company_number"
  | "paye_ref"
  | "accounts_office_ref";

export type DocumentPasswordPolicy = Record<
  DocumentPasswordSection,
  DocumentPasswordIdentifier
>;

export const DOCUMENT_PASSWORD_SECTIONS: Array<{
  id: DocumentPasswordSection;
  label: string;
  help: string;
}> = [
  {
    id: "sa",
    label: "Self Assessment",
    help: "SA100 / SA302 packs and related SA PDFs emailed to the client.",
  },
  {
    id: "ct",
    label: "Corporation Tax",
    help: "CT600, computations and CT packs.",
  },
  {
    id: "accounts",
    label: "Accounts",
    help: "Year-end / filed accounts PDFs.",
  },
  {
    id: "vat",
    label: "VAT",
    help: "VAT return summaries and attachments (when locked).",
  },
  {
    id: "payroll",
    label: "Payroll",
    help: "Optional override for RTI pack zips (payroll also has its own pack password).",
  },
  {
    id: "letters",
    label: "Letters",
    help: "Formal client letters emailed as PDF.",
  },
  {
    id: "invoices",
    label: "Invoices",
    help: "Invoice PDFs / HTML attachments (usually left unlocked).",
  },
];

export const DOCUMENT_PASSWORD_IDENTIFIERS: Array<{
  id: DocumentPasswordIdentifier;
  label: string;
  hint: string;
}> = [
  {
    id: "none",
    label: "No password",
    hint: "Documents are sent unlocked.",
  },
  {
    id: "date_of_birth",
    label: "Date of birth (DDMMYYYY)",
    hint: "Taxpayer / signing director DOB as eight digits, no slashes.",
  },
  {
    id: "personal_utr",
    label: "Personal UTR",
    hint: "Individual’s Self Assessment UTR (digits only).",
  },
  {
    id: "company_utr",
    label: "Company UTR",
    hint: "Limited company Corporation Tax UTR (digits only).",
  },
  {
    id: "nino",
    label: "National Insurance number",
    hint: "NINO in uppercase with no spaces.",
  },
  {
    id: "company_number",
    label: "Company number",
    hint: "Companies House company number as stored on the client.",
  },
  {
    id: "paye_ref",
    label: "PAYE reference",
    hint: "Employer PAYE reference as stored (e.g. 123/AB456).",
  },
  {
    id: "accounts_office_ref",
    label: "Accounts Office reference",
    hint: "HMRC Accounts Office reference as stored on the employer.",
  },
];

export function defaultDocumentPasswordPolicy(): DocumentPasswordPolicy {
  return {
    sa: "date_of_birth",
    ct: "company_utr",
    accounts: "company_utr",
    vat: "none",
    payroll: "none",
    letters: "date_of_birth",
    invoices: "none",
  };
}

export function normalizeDocumentPasswordPolicy(
  raw: unknown,
): DocumentPasswordPolicy {
  const base = defaultDocumentPasswordPolicy();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(
    DOCUMENT_PASSWORD_IDENTIFIERS.map((i) => i.id),
  );
  for (const section of DOCUMENT_PASSWORD_SECTIONS) {
    const v = obj[section.id];
    if (typeof v === "string" && allowed.has(v as DocumentPasswordIdentifier)) {
      base[section.id] = v as DocumentPasswordIdentifier;
    }
  }
  return base;
}

export function identifierHint(
  id: DocumentPasswordIdentifier,
): string {
  return (
    DOCUMENT_PASSWORD_IDENTIFIERS.find((i) => i.id === id)?.hint ??
    "Password set by your accountant."
  );
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeNino(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** DOB → DDMMYYYY (same rules as PDF lock). */
export function dobToPassword(dob: string): string | null {
  const iso = dob.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  const digits = iso.replace(/\D/g, "");
  if (digits.length === 8) {
    const y = Number(digits.slice(4, 8));
    if (y >= 1900 && y <= 2100) return digits;
    return `${digits.slice(6, 8)}${digits.slice(4, 6)}${digits.slice(0, 4)}`;
  }
  return null;
}

export type PasswordResolveContext = {
  /** Limited company / client UTR (company CT UTR when ltd). */
  companyUtr?: string | null;
  /** Personal SA UTR when known. */
  personalUtr?: string | null;
  nino?: string | null;
  companyNumber?: string | null;
  /** Prefer explicit DOB (SA draft / director). */
  dateOfBirth?: string | null;
  payeRef?: string | null;
  accountsOfficeRef?: string | null;
};

export type ResolvedDocumentPassword =
  | { locked: false }
  | {
      locked: true;
      password: string;
      identifier: DocumentPasswordIdentifier;
      hint: string;
    };

export function resolveDocumentPassword(
  identifier: DocumentPasswordIdentifier,
  ctx: PasswordResolveContext,
): ResolvedDocumentPassword {
  if (identifier === "none") return { locked: false };

  if (identifier === "date_of_birth") {
    const raw = ctx.dateOfBirth?.trim();
    if (!raw) return { locked: false };
    const password = dobToPassword(raw);
    if (!password) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "personal_utr") {
    const password = digitsOnly(ctx.personalUtr ?? "");
    if (password.length < 8) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "company_utr") {
    const password = digitsOnly(ctx.companyUtr ?? "");
    if (password.length < 8) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "nino") {
    const password = normalizeNino(ctx.nino ?? "");
    if (password.length < 8) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "company_number") {
    const password = (ctx.companyNumber ?? "").trim().toUpperCase();
    if (password.length < 6) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "paye_ref") {
    const password = (ctx.payeRef ?? "").replace(/\s+/g, "").toUpperCase();
    if (password.length < 5) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  if (identifier === "accounts_office_ref") {
    const password = (ctx.accountsOfficeRef ?? "")
      .replace(/\s+/g, "")
      .toUpperCase();
    if (password.length < 8) return { locked: false };
    return {
      locked: true,
      password,
      identifier,
      hint: identifierHint(identifier),
    };
  }

  return { locked: false };
}
