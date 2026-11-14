/** Build sign-in / sign-up URLs that return the user to an in-progress filing. */

export function appendReturnParams(
  path: string,
  params: { step?: "submit"; pay?: boolean; resume?: boolean },
): string {
  const [pathname, search = ""] = path.split("?");
  const qs = new URLSearchParams(search);
  if (params.step === "submit") qs.set("step", "submit");
  if (params.pay) qs.set("pay", "1");
  if (params.resume) qs.set("resume", "1");
  const q = qs.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export type AuthEntry = "sign-in" | "create-account" | "quick-signup";

export function authEntryHref(
  entry: AuthEntry,
  returnPath: string,
  params?: { step?: "submit"; pay?: boolean; resume?: boolean },
): string {
  const destination = appendReturnParams(returnPath, params ?? {});
  const page =
    entry === "sign-in"
      ? "sign-in"
      : entry === "quick-signup"
        ? "quick-signup"
        : "create-account";
  return `/${page}?next=${encodeURIComponent(destination)}`;
}

const MAX_RETURN_PATH_LENGTH = 2048;
const LOCAL_PATH_START = /^\/(?![\/\\])/;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * Only same-origin, absolute-path return targets are allowed. Rejects
 * protocol-relative (`//evil.com`), backslash tricks (`/\evil.com`), control
 * characters (browsers strip tab/CR/LF inside URLs, so `/\t/evil.com` becomes
 * `//evil.com`), and encoded slashes/backslashes in the path portion.
 */
export function safeReturnPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (next.length > MAX_RETURN_PATH_LENGTH) return fallback;
  if (!LOCAL_PATH_START.test(next)) return fallback;
  if (FORBIDDEN_CHARS.test(next)) return fallback;

  const pathPart = next.split(/[?#]/, 1)[0] ?? "";
  if (/%2f|%5c/i.test(pathPart)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    return fallback;
  }
  if (!LOCAL_PATH_START.test(decoded) || FORBIDDEN_CHARS.test(decoded)) {
    return fallback;
  }
  return next;
}

/** One-off CH filings — prefer quick signup over full practice onboarding. */
export function isOneOffFilingPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.split("?")[0] ?? "";
  return (
    p.startsWith("/companies-house/confirmation-statement") ||
    p.startsWith("/companies-house/accounts-ixbrl") ||
    p.startsWith("/companies-house/year-end") ||
    p.startsWith("/companies-house/incorporation")
  );
}
