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

export function safeReturnPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
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
