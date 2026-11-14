/** Log-safe helpers (UK GDPR: keep personal data and secrets out of logs). */

export function maskEmail(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  const at = v.lastIndexOf("@");
  if (at < 1) return v ? "***" : "";
  return `${v[0]}***${v.slice(at)}`;
}

export function maskEmails(
  value: string | string[] | null | undefined,
): string | string[] {
  if (Array.isArray(value)) return value.map(maskEmail);
  return maskEmail(value);
}

/** Keep only the last 2 characters of an identifier (UTR / NINO / phone). */
export function maskId(value: string | null | undefined): string {
  const v = (value ?? "").replace(/\s+/g, "");
  if (v.length <= 2) return v ? "**" : "";
  return `${"*".repeat(Math.min(v.length - 2, 8))}${v.slice(-2)}`;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.NETLIFY);
}

/**
 * Log-safe description of an unknown error: class + short message with emails,
 * NINO/UTR-shaped values, bearer tokens and long secret-looking strings masked.
 * Never logs the error object itself (it may carry request bodies / row data).
 */
export function safeErr(err: unknown): string {
  let name = "Error";
  let msg = "";
  if (err instanceof Error) {
    name = err.name || "Error";
    msg = err.message;
  } else if (typeof err === "string") {
    msg = err;
  } else if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown };
    name = typeof o.code === "string" ? o.code : "Error";
    if (typeof o.message === "string") msg = o.message;
  }
  msg = msg
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => maskEmail(m))
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
    .replace(/\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, "[nino]")
    .replace(/\b\d{10}\b/g, "[utr]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return msg ? `${name}: ${msg}` : name;
}
