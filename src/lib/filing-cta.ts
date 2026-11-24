/**
 * Public “File with HydraTax” CTA ids — recorded at signup so we can resume
 * the exact flow and send completion reminders.
 */

export const FILING_CTA_IDS = [
  "file-ct600-accounts",
  "confirmation-statement",
  "accounts-only",
  "file-cs01-deadline",
  "file-accounts-deadline",
  "start-ct600-deadline",
  "ch-service-confirmation-statement",
  "ch-service-accounts-ixbrl",
] as const;

export type FilingCtaId = (typeof FILING_CTA_IDS)[number];

const LABELS: Record<FilingCtaId, string> = {
  "file-ct600-accounts": "File CT600 & accounts",
  "confirmation-statement": "Confirmation statement",
  "accounts-only": "Accounts only",
  "file-cs01-deadline": "File CS01 (deadline)",
  "file-accounts-deadline": "File accounts (deadline)",
  "start-ct600-deadline": "Start CT600 (deadline)",
  "ch-service-confirmation-statement": "Confirmation statement",
  "ch-service-accounts-ixbrl": "Annual accounts",
};

export function isFilingCtaId(raw: string | null | undefined): raw is FilingCtaId {
  return Boolean(raw && (FILING_CTA_IDS as readonly string[]).includes(raw));
}

export function filingCtaLabel(ctaId: FilingCtaId): string {
  return LABELS[ctaId];
}

/** Infer CH service / year-end mode from a resume path. */
export function serviceIdFromResumePath(path: string): string | null {
  const p = path.split("?")[0] ?? "";
  if (p.includes("/confirmation-statement")) return "confirmation-statement";
  if (p.includes("/accounts-ixbrl")) return "accounts-ixbrl";
  if (p.includes("/year-end")) return "year-end";
  if (p.includes("/incorporation")) return "incorporation";
  return null;
}

export function companyNumberFromResumePath(path: string): string | null {
  try {
    const qs = new URLSearchParams(path.split("?")[1] ?? "");
    const raw = (qs.get("company") ?? "").trim().toUpperCase();
    return /^[A-Z0-9]{6,8}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Guess CTA from resume path when the query param is missing. */
export function inferFilingCtaId(path: string): FilingCtaId | null {
  const p = path.split("?")[0] ?? "";
  const qs = new URLSearchParams(path.split("?")[1] ?? "");
  if (p.includes("/year-end")) {
    const mode = qs.get("mode");
    if (mode === "both" || !mode) return "file-ct600-accounts";
    if (mode === "accounts") return "accounts-only";
    if (mode === "ct600") return "start-ct600-deadline";
  }
  if (p.includes("/confirmation-statement")) return "confirmation-statement";
  if (p.includes("/accounts-ixbrl")) return "accounts-only";
  return null;
}
