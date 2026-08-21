import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/auth-return";

const ORG_TYPES = new Set([
  "company",
  "sole_trader",
  "partnership",
  "practice",
]);

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("=") || "");
  }
  return null;
}

function clearAuthIntentCookies(res: NextResponse) {
  for (const name of ["ht_auth_next", "ht_auth_org"]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthDesc = searchParams.get("error_description");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    forwardedHost && process.env.NODE_ENV !== "development"
      ? `https://${forwardedHost}`
      : url.origin;

  if (oauthError) {
    // Our own flag — never re-enter callback with error=auth
    if (oauthError === "auth") {
      const nextParam = encodeURIComponent(safeReturnPath(searchParams.get("next")));
      return NextResponse.redirect(
        `${origin}/sign-in?error=auth&next=${nextParam}`,
      );
    }
    const detail = encodeURIComponent(
      (oauthDesc || oauthError).replace(/\+/g, " ").slice(0, 200),
    );
    return NextResponse.redirect(
      `${origin}/sign-in?error=auth&detail=${detail}`,
    );
  }

  const next = safeReturnPath(
    searchParams.get("next") || readCookie(request, "ht_auth_next"),
  );
  const orgTypeRaw =
    searchParams.get("org_type") || readCookie(request, "ht_auth_org");
  const orgType =
    orgTypeRaw && ORG_TYPES.has(orgTypeRaw) ? orgTypeRaw : null;

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          const header = request.headers.get("cookie") ?? "";
          if (!header) return [];
          return header.split(";").map((part) => {
            const [name, ...rest] = part.trim().split("=");
            return { name, value: rest.join("=") };
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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

      clearAuthIntentCookies(redirectResponse);
      return redirectResponse;
    }

    const detail = encodeURIComponent(error.message.slice(0, 200));
    return NextResponse.redirect(
      `${origin}/sign-in?error=auth&detail=${detail}`,
    );
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
