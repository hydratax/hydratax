import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";
import { isClientUuid } from "@/lib/client-slug";

const PUBLIC_PREFIXES = [
  "/",
  "/pricing",
  "/companies-house",
  "/support",
  "/feature-requests",
  "/checkout",
  "/create-account",
  "/quick-signup",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/terms",
  "/privacy",
  "/legal",
  "/blog",
  "/api/hmrc/callback",
  "/api/checkout",
  "/api/stripe/webhook",
  "/api/cron",
  "/api/unsubscribe",
  "/unsubscribe",
  "/api/companies-house",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

/**
 * Supabase sometimes returns the OAuth `code` to Site URL (e.g. /dashboard)
 * instead of /auth/callback. Catch that and hand off to the callback route.
 * Only intercept real PKCE codes — never our own `error=auth` flag (that loops).
 */
function oauthCodeHandoff(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/auth/callback" || pathname.startsWith("/api/")) {
    return null;
  }

  const code = searchParams.get("code");
  if (
    !code ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      code,
    )
  ) {
    return null;
  }

  // Already signed in — strip leftover oauth params instead of re-exchanging.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && !c.name.includes("code-verifier") && c.value.length > 10);
  if (hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = "/auth/callback";
  url.search = "";
  url.searchParams.set("code", code);

  // Never put oauth params into `next` or the used code will be replayed after success.
  const cleanSearch = new URLSearchParams(searchParams);
  cleanSearch.delete("code");
  cleanSearch.delete("state");
  cleanSearch.delete("error");
  cleanSearch.delete("error_description");
  const qs = cleanSearch.toString();

  const resume =
    pathname === "/" ||
    pathname === "/sign-in" ||
    pathname === "/create-account" ||
    pathname === "/quick-signup"
      ? "/dashboard"
      : qs
        ? `${pathname}?${qs}`
        : pathname;
  url.searchParams.set("next", resume);

  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const handoff = oauthCodeHandoff(request);
  if (handoff) return handoff;

  const { pathname } = request.nextUrl;

  // OAuth code exchange runs in /auth/callback — avoid middleware cookie churn first.
  if (pathname === "/auth/callback") {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Public pages: skip Supabase round-trip (saves 5–20s locally on every navigation).
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // No auth cookies — redirect to sign-in without calling Supabase.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.value.length > 10);
  if (isSupabaseConfigured() && !hasAuthCookie && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    const cleanSearch = new URLSearchParams(request.nextUrl.search);
    cleanSearch.delete("code");
    cleanSearch.delete("error");
    cleanSearch.delete("error_description");
    const qs = cleanSearch.toString();
    const returnTo = qs ? `${pathname}?${qs}` : pathname;
    url.searchParams.set("next", returnTo);
    return NextResponse.redirect(url);
  }

  // Refresh Supabase session cookies and validate JWT
  const { response, userId } = await updateSession(request);

  if (
    isSupabaseConfigured() &&
    !isPublicPath(pathname) &&
    !pathname.startsWith("/api/") &&
    !userId
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    // Don't pass OAuth codes through the sign-in return URL
    const cleanSearch = new URLSearchParams(request.nextUrl.search);
    cleanSearch.delete("code");
    cleanSearch.delete("error");
    cleanSearch.delete("error_description");
    const qs = cleanSearch.toString();
    const returnTo = qs ? `${pathname}?${qs}` : pathname;
    url.searchParams.set("next", returnTo);
    const redirectResponse = NextResponse.redirect(url);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  // Canonical client URLs: /clients/<uuid>/… → /clients/<name-slug>/…
  const clientMatch = pathname.match(/^\/clients\/([^/]+)(\/.*)?$/);
  if (
    clientMatch &&
    isClientUuid(clientMatch[1]) &&
    process.env.NODE_ENV === "production"
  ) {
    try {
      const slugRes = await fetch(
        new URL(`/api/internal/client-slug/${clientMatch[1]}`, request.url),
        { headers: { cookie: request.headers.get("cookie") ?? "" } },
      );
      if (slugRes.ok) {
        const { slug } = (await slugRes.json()) as { slug: string };
        const url = request.nextUrl.clone();
        url.pathname = `/clients/${slug}${clientMatch[2] ?? ""}`;
        const redirectResponse = NextResponse.redirect(url, 308);
        copyCookies(response, redirectResponse);
        return redirectResponse;
      }
    } catch {
      // page loader resolves or 404s
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
