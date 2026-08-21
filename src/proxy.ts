import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";

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
  "/auth",
  "/terms",
  "/privacy",
  "/legal",
  "/blog",
  "/api/hmrc/callback",
  "/api/checkout",
  "/api/stripe/webhook",
  "/api/cron",
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

  const url = request.nextUrl.clone();
  url.pathname = "/auth/callback";
  url.search = "";
  url.searchParams.set("code", code);

  const resume =
    pathname === "/" ||
    pathname === "/sign-in" ||
    pathname === "/create-account" ||
    pathname === "/quick-signup"
      ? "/dashboard"
      : pathname;
  url.searchParams.set("next", resume);

  return NextResponse.redirect(url);
}

export default async function proxy(request: NextRequest) {
  const handoff = oauthCodeHandoff(request);
  if (handoff) return handoff;

  const { pathname } = request.nextUrl;

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
