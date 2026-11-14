import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

function isRateLimitedError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return /rate limit|too many requests|over_request_rate_limit/i.test(
      String(err ?? ""),
    );
  }
  const status = Number((err as { status?: unknown }).status);
  const msg = String((err as { message?: unknown }).message ?? "");
  return (
    status === 429 ||
    /rate limit|too many requests|over_request_rate_limit/i.test(msg)
  );
}

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
  /**
   * True when Supabase Auth rate-limited us and the JWT could NOT be verified.
   * userId is null in that case — callers must never fall back to the
   * unverified cookie contents.
   */
  rateLimited: boolean;
}> {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isSupabaseConfigured()) {
    return { response: supabaseResponse, userId: null, rateLimited: false };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let rateLimited = false;

  // Prefer local JWT verification when asymmetric keys are enabled; avoid
  // hammering Auth on every hop. getClaims() verifies the signature.
  try {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const sub = claimsData?.claims?.sub;
    if (typeof sub === "string" && sub.length > 0) {
      return { response: supabaseResponse, userId: sub, rateLimited: false };
    }
    if (claimsError && isRateLimitedError(claimsError)) rateLimited = true;
  } catch (err) {
    if (isRateLimitedError(err)) rateLimited = true;
    // Otherwise fall through to getUser (server-verified).
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      if (isRateLimitedError(error)) rateLimited = true;
      return { response: supabaseResponse, userId: null, rateLimited };
    }
    return {
      response: supabaseResponse,
      userId: user?.id ?? null,
      rateLimited: false,
    };
  } catch (err) {
    if (isRateLimitedError(err)) rateLimited = true;
    return { response: supabaseResponse, userId: null, rateLimited };
  }
}

export { isSupabaseConfigured };
