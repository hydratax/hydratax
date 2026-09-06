/** Resolve the public site origin for auth redirects (avoid Netlify *.netlify.app host). */
export function resolveAuthOrigin(request: {
  headers: Headers;
  nextUrl: { origin: string };
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null;
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim() ?? "";
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const forwardedRaw =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const forwarded = forwardedRaw.split(":")[0]?.toLowerCase() ?? "";
  const protoHeader = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    protoHeader === "http" || protoHeader === "https"
      ? protoHeader
      : host.includes("localhost")
        ? "http"
        : "https";

  if (appUrl) {
    try {
      const appHost = new URL(appUrl).hostname.toLowerCase();
      const matchesApp =
        host === appHost ||
        host === `www.${appHost}` ||
        forwarded === appHost ||
        forwarded === `www.${appHost}`;
      if (matchesApp) return appUrl;
    } catch {
      /* ignore bad NEXT_PUBLIC_APP_URL */
    }
  }

  // Prefer the public Host (custom domain) over Netlify's internal forwarded host.
  if (host && !host.endsWith(".netlify.app")) {
    return `${proto}://${host}`;
  }
  if (forwarded && !forwarded.endsWith(".netlify.app")) {
    return `https://${forwarded}`;
  }

  if (appUrl) return appUrl;
  return request.nextUrl.origin;
}

/** Classify OAuth / code-exchange failures for the sign-in UI. */
export function classifyOAuthCallbackFailure(
  reason: string | null | undefined,
): "account_exists" | "pkce" | "auth" {
  const m = (reason ?? "").toLowerCase();
  if (!m) return "auth";
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("identity_already_exists") ||
    m.includes("identity is already linked") ||
    m.includes("email address is already associated") ||
    m.includes("user already exists") ||
    (m.includes("email") && m.includes("already"))
  ) {
    return "account_exists";
  }
  if (
    m.includes("pkce") ||
    m.includes("code verifier") ||
    m.includes("not found in storage") ||
    m.includes("auth flow was initiated") ||
    m.includes("both auth code and code verifier")
  ) {
    return "pkce";
  }
  return "auth";
}
