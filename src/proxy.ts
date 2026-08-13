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
  "/sign-in",
  "/sign-up",
  "/auth",
  "/terms",
  "/privacy",
  "/legal",
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

export default async function proxy(request: NextRequest) {
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
    const returnTo = `${pathname}${request.nextUrl.search}`;
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
