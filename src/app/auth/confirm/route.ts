import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/auth-return";
import { resolveAuthOrigin } from "@/lib/auth-origin";
import type { EmailOtpType } from "@supabase/supabase-js";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Password recovery / email confirm without PKCE.
 * Supabase Auth email templates should link here with token_hash + type so the
 * link works when opened in a different browser than "Forgot password".
 *
 * Recovery template example:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = resolveAuthOrigin(request);
  const tokenHash = url.searchParams.get("token_hash");
  const typeRaw = url.searchParams.get("type");
  const next = safeReturnPath(
    url.searchParams.get("next") ||
      (typeRaw === "recovery" ? "/reset-password" : "/dashboard"),
  );

  const fail = (reason: string) => {
    console.warn("[auth/confirm]", reason);
    const dest =
      typeRaw === "recovery"
        ? `/forgot-password?error=link`
        : `/sign-in?error=auth&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(`${origin}${dest}`);
  };

  if (!tokenHash || !typeRaw || !OTP_TYPES.has(typeRaw as EmailOtpType)) {
    return fail("missing or invalid token_hash/type");
  }
  const type = typeRaw as EmailOtpType;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  };
  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => pendingCookies.push(c));
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error) {
    return fail(error.message);
  }

  const destination =
    type === "recovery"
      ? "/reset-password"
      : next.startsWith("/reset-password")
        ? "/reset-password"
        : next;

  const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
  for (const { name, value, options } of pendingCookies) {
    redirectResponse.cookies.set(name, value, options);
  }
  redirectResponse.headers.set("Cache-Control", "private, no-store");
  return redirectResponse;
}
