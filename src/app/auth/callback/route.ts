import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/auth-return";

const ORG_TYPES = new Set([
  "company",
  "sole_trader",
  "partnership",
  "practice",
]);

function readIntentCookie(request: NextRequest, name: string): string | null {
  const raw = request.cookies.get(name)?.value;
  return raw ? decodeURIComponent(raw) : null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    forwardedHost && process.env.NODE_ENV !== "development"
      ? `https://${forwardedHost}`
      : url.origin;

  const next = safeReturnPath(
    searchParams.get("next") || readIntentCookie(request, "ht_auth_next"),
  );
  const orgTypeRaw =
    searchParams.get("org_type") || readIntentCookie(request, "ht_auth_org");
  const orgType =
    orgTypeRaw && ORG_TYPES.has(orgTypeRaw) ? orgTypeRaw : null;

  const fail = () => {
    const res = NextResponse.redirect(
      `${origin}/sign-in?error=auth&next=${encodeURIComponent(next)}`,
    );
    res.cookies.set("ht_auth_next", "", { path: "/", maxAge: 0 });
    res.cookies.set("ht_auth_org", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (oauthError || !code) {
    return fail();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let redirectResponse = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed", error.message);
    return fail();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};
    if (orgType) updates.org_type = orgType;

    const hasFirst =
      typeof meta.first_name === "string" && meta.first_name.trim();
    if (!hasFirst) {
      const full =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        "";
      const parts = full.trim().split(/\s+/).filter(Boolean);
      if (parts[0]) updates.first_name = parts[0];
      if (parts.length > 1) updates.surname = parts.slice(1).join(" ");
    }

    if (Object.keys(updates).length > 0) {
      await supabase.auth.updateUser({ data: updates });
    }

    try {
      const { ensureSupabasePractice } = await import(
        "@/server/auth/ensure-practice"
      );
      await ensureSupabasePractice({
        ...user,
        user_metadata: { ...meta, ...updates },
      });
    } catch {
      /* practice seeded on first desk visit */
    }
  }

  redirectResponse.cookies.set("ht_auth_next", "", { path: "/", maxAge: 0 });
  redirectResponse.cookies.set("ht_auth_org", "", { path: "/", maxAge: 0 });
  redirectResponse.headers.set("Cache-Control", "private, no-store");

  return redirectResponse;
}
