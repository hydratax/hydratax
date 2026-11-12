import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-search", request.nextUrl.search);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isSupabaseConfigured()) {
    return { response: supabaseResponse, userId: null };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let userId: string | null = null;

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

  // Prefer local JWT claims when available; avoid hammering Auth on every hop.
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const sub = claimsData?.claims?.sub;
    if (typeof sub === "string" && sub.length > 0) {
      userId = sub;
      return { response: supabaseResponse, userId };
    }
  } catch {
    // Fall through to getUser / cookie session.
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      const rateLimited =
        error.status === 429 ||
        /rate limit|too many requests|over_request_rate_limit/i.test(
          error.message ?? "",
        );
      if (rateLimited) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userId = session?.user?.id ?? null;
      } else {
        userId = null;
      }
    } else {
      userId = user?.id ?? null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    if (/rate limit|too many requests|over_request_rate_limit/i.test(msg)) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userId = session?.user?.id ?? null;
      } catch {
        userId = null;
      }
    } else {
      userId = null;
    }
  }

  return { response: supabaseResponse, userId };
}

export { isSupabaseConfigured };
