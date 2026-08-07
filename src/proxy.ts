import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PREFIXES = [
  "/",
  "/pricing",
  "/companies-house",
  "/support",
  "/checkout",
  "/create-account",
  "/sign-in",
  "/sign-up",
  "/auth",
  "/api/hmrc/callback",
  "/api/checkout",
  "/api/stripe/webhook",
  "/api/companies-house",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Refresh Supabase session cookies when configured
  const response = await updateSession(request);

  if (isSupabaseConfigured() && !isPublicPath(pathname)) {
    // Lightweight gate: protected app routes need a session cookie present
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.includes("-auth-token"));
    if (!hasAuthCookie && !pathname.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
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
