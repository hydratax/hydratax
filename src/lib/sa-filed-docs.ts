/**
 * Durable prior-year SA filings live as client_documents with a tagged category.
 * Format: sa_filed:{taxYear}:{kind}[:{taxpayerId}]
 * kind = return | sa302
 */

export type SaFiledKind = "return" | "sa302";

export type SaFiledCategory = {
  taxYear: string;
  kind: SaFiledKind;
  taxpayerId: string | null;
};

const YEAR = "(\\d{4}-\\d{2})";
const KIND = "(return|sa302)";

export function saFiledCategory(
  taxYear: string,
  kind: SaFiledKind,
  taxpayerId?: string | null,
): string {
  const base = `sa_filed:${taxYear}:${kind}`;
  return taxpayerId ? `${base}:${taxpayerId}` : base;
}

export function parseSaFiledCategory(
  category: string,
): SaFiledCategory | null {
  const withTp = new RegExp(`^sa_filed:${YEAR}:${KIND}:([^:]+)$`, "i").exec(
    category.trim(),
  );
  if (withTp) {
    return {
      taxYear: withTp[1],
      kind: withTp[2] as SaFiledKind,
      taxpayerId: withTp[3],
    };
  }
  const bare = new RegExp(`^sa_filed:${YEAR}:${KIND}$`, "i").exec(
    category.trim(),
  );
  if (bare) {
    return {
      taxYear: bare[1],
      kind: bare[2] as SaFiledKind,
      taxpayerId: null,
    };
  }
  return null;
}

export function isLegacySaUploadCategory(category: string): boolean {
  return category === "self_assessment";
}

/** Guess tax year / kind from a filename like "SA302 2024-25.pdf" or "Forms(2023-24).pdf". */
export function guessSaFilingFromFilename(filename: string): {
  taxYear: string | null;
  kind: SaFiledKind;
} {
  const lower = filename.toLowerCase();
  const kind: SaFiledKind = /sa\s*302|tax\s*calc/i.test(lower)
    ? "sa302"
    : "return";
  const m =
    /(\d{4})\s*[-_/]\s*(\d{2,4})/.exec(filename) ||
    /(\d{4})\s*(\d{2})/.exec(filename);
  if (!m) return { taxYear: null, kind };
  const start = m[1];
  let end = m[2];
  if (end.length === 4) end = end.slice(2);
  return { taxYear: `${start}-${end}`, kind };
}
