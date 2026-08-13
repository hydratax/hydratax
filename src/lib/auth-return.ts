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

export function authEntryHref(
  entry: "sign-in" | "create-account",
  returnPath: string,
  params?: { step?: "submit"; pay?: boolean; resume?: boolean },
): string {
  const destination = appendReturnParams(returnPath, params ?? {});
  return `/${entry === "sign-in" ? "sign-in" : "create-account"}?next=${encodeURIComponent(destination)}`;
}

export function safeReturnPath(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
