/**
 * Display masking for sensitive identifiers (UK GDPR Art 5(1)(c) data
 * minimisation, Art 25 privacy by design).
 *
 * Use in LIST / summary views where the full value is not needed. Show the
 * full value only on the single-record edit / filing screens where the
 * accountant must verify or type it.
 */

const DOT = "\u2022";

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function dots(n: number): string {
  return DOT.repeat(Math.max(0, n));
}

/** NI number → `QQ••••••C` (keeps prefix letters and suffix letter). */
export function maskNino(nino: string | null | undefined): string {
  const v = compact(nino ?? "").toUpperCase();
  if (!v) return "";
  if (v.length < 4) return dots(v.length);
  return `${v.slice(0, 2)}${dots(v.length - 3)}${v.slice(-1)}`;
}

/** 10-digit UTR (also works for any numeric reference) → `••••••1234`. */
export function maskUtr(utr: string | null | undefined): string {
  const v = compact(utr ?? "");
  if (!v) return "";
  if (v.length <= 4) return dots(v.length);
  return `${dots(v.length - 4)}${v.slice(-4)}`;
}

/**
 * Accounts Office reference (e.g. `123PA00012345`) → keep a short prefix
 * and last few characters: `123••••••••345`.
 */
export function maskAccountsOfficeRef(
  ref: string | null | undefined,
): string {
  const v = compact(ref ?? "").toUpperCase();
  if (!v) return "";
  if (v.length <= 6) return dots(v.length);
  const head = Math.min(3, Math.floor(v.length / 3));
  const tail = Math.min(3, v.length - head);
  return `${v.slice(0, head)}${dots(v.length - head - tail)}${v.slice(-tail)}`;
}

/** Date of birth (any format) → year only, e.g. `••/••/1980`. */
export function maskDob(dob: string | null | undefined): string {
  const v = (dob ?? "").trim();
  if (!v) return "";
  const year = v.match(/(19|20)\d{2}/)?.[0];
  return year ? `${DOT}${DOT}/${DOT}${DOT}/${year}` : dots(8);
}

/** Bank account number → `••••1234`. */
export function maskAccountNumber(n: string | null | undefined): string {
  const v = compact(n ?? "");
  if (!v) return "";
  if (v.length <= 4) return dots(v.length);
  return `${dots(4)}${v.slice(-4)}`;
}

/** Sort code → `••-••-56`. */
export function maskSortCode(sc: string | null | undefined): string {
  const digits = compact(sc ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `${DOT}${DOT}-${DOT}${DOT}-${digits.slice(-2)}`;
}

/** Email → `jo•••@example.com`. */
export function maskEmail(email: string | null | undefined): string {
  const v = (email ?? "").trim();
  const at = v.indexOf("@");
  if (at < 1) return v ? dots(v.length) : "";
  return `${v.slice(0, Math.min(2, at))}${dots(3)}${v.slice(at)}`;
}
