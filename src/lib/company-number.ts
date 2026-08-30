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
