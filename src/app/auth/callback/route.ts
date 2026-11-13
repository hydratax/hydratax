import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnPath } from "@/lib/auth-return";
import {
  classifyOAuthCallbackFailure,
  resolveAuthOrigin,
} from "@/lib/auth-origin";

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
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  const origin = resolveAuthOrigin(request);

  const next = safeReturnPath(
    url.searchParams.get("next") || readIntentCookie(request, "ht_auth_next"),
  );
  const orgTypeRaw =
    url.searchParams.get("org_type") || readIntentCookie(request, "ht_auth_org");
  const orgType =
    orgTypeRaw && ORG_TYPES.has(orgTypeRaw) ? orgTypeRaw : null;

  const isPasswordRecovery = next.startsWith("/reset-password");

  const fail = (reason?: string) => {
    if (reason) console.warn("[auth/callback]", reason);
    const classified = classifyOAuthCallbackFailure(reason);
    // Password-reset links often open in a different browser (no PKCE cookie).
    // Don't dump users on Sign in with a misleading "Google" error.
    const dest = isPasswordRecovery
      ? `/forgot-password?error=link`
      : `/sign-in?error=${classified}&next=${encodeURIComponent(next)}`;
    const res = NextResponse.redirect(`${origin}${dest}`);
    res.cookies.set("ht_auth_next", "", { path: "/", maxAge: 0 });
    res.cookies.set("ht_auth_org", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (oauthError) {
    return fail(
      oauthErrorDescription
        ? `oauth error: ${oauthError} (${oauthErrorDescription})`
        : `oauth error: ${oauthError}`,
    );
  }
  if (!code) return fail("missing code");

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

  const hasVerifier = request.cookies
    .getAll()
    .some((c) => c.name.includes("code-verifier"));
  if (!hasVerifier) {
    console.warn("[auth/callback] no PKCE code-verifier cookie on request", {
      cookieNames: request.cookies.getAll().map((c) => c.name),
      origin,
      host: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    });
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Code may already have been exchanged (double redirect / Site URL handoff).
    // If a session exists, treat as success so the user never sees a false error flash.
    const {
      data: { user: existingUser },
    } = await supabase.auth.getUser();
    if (!existingUser) {
      return fail(
        hasVerifier
          ? error.message
          : `${error.message} (PKCE code verifier cookie missing)`,
      );
    }
    console.warn(
      "[auth/callback] code exchange failed but session present — continuing",
      error.message,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let mfaRequired = false;
  let suggest2fa = false;
  let secureDevicePath = `/secure-device?next=${encodeURIComponent(next)}`;

  if (user && isPasswordRecovery) {
    // Recovery session → set new password; skip MFA / device-trust / welcome.
    const redirectResponse = NextResponse.redirect(
      `${origin}/reset-password`,
    );
    for (const { name, value, options } of pendingCookies) {
      redirectResponse.cookies.set(name, value, options);
    }
    redirectResponse.cookies.set("ht_auth_next", "", { path: "/", maxAge: 0 });
    redirectResponse.cookies.set("ht_auth_org", "", { path: "/", maxAge: 0 });
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

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

    try {
      const { startProvisionalSession, recordSuccessfulLogin } = await import(
        "@/server/auth/session-policy"
      );
      await startProvisionalSession();
      const login = await recordSuccessfulLogin(user.id);
      suggest2fa = login.suggest2fa;
      const { postLoginPath } = await import("@/lib/session-policy");
      // First login (incl. email confirm / OAuth signup) skips Trust-device.
      secureDevicePath = postLoginPath(next, {
        suggest2fa,
        loginCount: login.loginCount,
      });
    } catch {
      /* session policy best-effort */
    }

    // Welcome email only for brand-new signups (email confirm / first OAuth),
    // never on every Google login. Persist the flag before sending.
    try {
      const freshMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const createdAtMs = user.created_at
        ? new Date(user.created_at).getTime()
        : 0;
      const accountAgeMs = createdAtMs > 0 ? Date.now() - createdAtMs : Infinity;
      const isFreshSignup =
        Number.isFinite(accountAgeMs) &&
        accountAgeMs >= 0 &&
        accountAgeMs < 30 * 60 * 1000;
      const alreadyWelcomed = freshMeta.hydra_welcome_sent === true;
      if (!alreadyWelcomed && isFreshSignup && user.email) {
        await supabase.auth.updateUser({
          data: { ...freshMeta, hydra_welcome_sent: true },
        });
        const { sendSignupEmails } = await import(
          "@/server/email/signup-notify"
        );
        await sendSignupEmails({
          to: user.email,
          firstName:
            typeof freshMeta.first_name === "string"
              ? freshMeta.first_name
              : null,
          surname:
            typeof freshMeta.surname === "string" ? freshMeta.surname : null,
          orgType:
            typeof freshMeta.org_type === "string" ? freshMeta.org_type : null,
          userId: user.id,
        });
      } else if (!alreadyWelcomed && user.email && !isFreshSignup) {
        // Returning OAuth users from before the flag existed — mark once, no email.
        await supabase.auth.updateUser({
          data: { ...freshMeta, hydra_welcome_sent: true },
        });
      }
    } catch (err) {
      console.error("[auth/callback] signup emails failed", err);
    }

    try {
      const { beginMfaIfRequired } = await import("@/server/actions/mfa");
      const mfa = await beginMfaIfRequired(user.id);
      mfaRequired = mfa.required;
    } catch {
      /* continue without MFA gate if settings table missing */
    }
  }

  const destination = mfaRequired
    ? `/verify-2fa?next=${encodeURIComponent(secureDevicePath)}`
    : secureDevicePath;
  const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
  for (const { name, value, options } of pendingCookies) {
    redirectResponse.cookies.set(name, value, options);
  }

  try {
    const { cookies: cookieStore } = await import("next/headers");
    const { MFA_OK_COOKIE, MFA_PENDING_COOKIE } = await import(
      "@/lib/mfa-cookies"
    );
    const {
      SESSION_EXPIRES_COOKIE,
      DEVICE_TRUSTED_COOKIE,
      sessionTtlSeconds,
    } = await import("@/lib/session-policy");
    const jar = await cookieStore();
    const secure = process.env.NODE_ENV === "production";
    const pendingVal = jar.get(MFA_PENDING_COOKIE)?.value;
    const okVal = jar.get(MFA_OK_COOKIE)?.value;
    const expiresVal = jar.get(SESSION_EXPIRES_COOKIE)?.value;
    const trustedVal = jar.get(DEVICE_TRUSTED_COOKIE)?.value;
    const ttl = sessionTtlSeconds(trustedVal === "1");
    if (pendingVal) {
      redirectResponse.cookies.set(MFA_PENDING_COOKIE, pendingVal, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 15,
      });
    }
    if (okVal) {
      redirectResponse.cookies.set(MFA_OK_COOKIE, okVal, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: ttl,
      });
    }
    if (expiresVal) {
      redirectResponse.cookies.set(SESSION_EXPIRES_COOKIE, expiresVal, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: ttl,
      });
    }
    if (trustedVal) {
      redirectResponse.cookies.set(DEVICE_TRUSTED_COOKIE, trustedVal, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: ttl,
      });
    }
  } catch {
    /* MFA cookies already applied via cookies() when available */
  }

  redirectResponse.cookies.set("ht_auth_next", "", { path: "/", maxAge: 0 });
  redirectResponse.cookies.set("ht_auth_org", "", { path: "/", maxAge: 0 });
  redirectResponse.headers.set("Cache-Control", "private, no-store");

  return redirectResponse;
}
