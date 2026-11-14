/**
 * UK Companies House company numbers are either:
 * - 6–8 digits (padded), or
 * - 2-letter prefix + 6 digits (e.g. SC123456, NI123456, OC123456)
 *
 * Letter-only strings like "tassests" must NOT be treated as numbers.
 */
export function looksLikeCompanyNumber(raw: string): boolean {
  const q = raw.trim().toUpperCase();
  if (!q || /\s/.test(q)) return false;
  if (/^\d{6,8}$/.test(q)) return true;
  if (/^[A-Z]{2}\d{6}$/.test(q)) return true;
  return false;
}

export function normalizeCompanyNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Strict, SSRF/path-safe company number for outbound API paths. Digit-only
 * numbers are zero-padded to 8; everything must match /^[A-Z0-9]{8}$/.
 * Returns null when invalid.
 */
export function parseCompanyNumberStrict(raw: string | null | undefined): string | null {
  const n = normalizeCompanyNumber(raw ?? "");
  const padded = /^\d{1,8}$/.test(n) ? n.padStart(8, "0") : n;
  return /^[A-Z0-9]{8}$/.test(padded) ? padded : null;
}
