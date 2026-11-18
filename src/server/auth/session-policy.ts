import { cookies } from "next/headers";
import {
  DEVICE_TRUSTED_COOKIE,
  SESSION_EXPIRES_COOKIE,
  deskAuthCookieAttrs,
  isSessionExpiryPast,
  isSupabaseAuthSessionCookie,
  sessionExpiresAtUnix,
} from "@/lib/session-policy";
import { MFA_OK_COOKIE, MFA_PENDING_COOKIE } from "@/lib/mfa-cookies";

/**
 * Apply trusted / untrusted desk session policy.
 *
 * Trusted → persistent cookies (7d Max-Age) for Supabase auth + policy cookies.
 * Untrusted → browser *session* cookies (no Max-Age) so closing the browser
 * ends the login; wall-clock `ht_session_expires` still caps an open tab at 10h.
 */
export async function applyDeviceTrustPolicy(trusted: boolean) {
  const jar = await cookies();
  const expires = String(sessionExpiresAtUnix(trusted));
  const attrs = deskAuthCookieAttrs(trusted);

  jar.set(SESSION_EXPIRES_COOKIE, expires, attrs);
  jar.set(DEVICE_TRUSTED_COOKIE, trusted ? "1" : "0", attrs);

  // Convert any already-issued Supabase Auth cookies to match persistence.
  // Declining trust must demote long-lived sb-* cookies to session cookies.
  for (const c of jar.getAll()) {
    if (!isSupabaseAuthSessionCookie(c.name) || !c.value) continue;
    jar.set(c.name, c.value, attrs);
  }

  // Keep MFA step-up cookie aligned with the same desk session. The cookie is
  // HMAC-signed and carries its own expiry, so it is re-issued (not just
  // re-stamped) — and only when the current one is valid for this user.
  if (jar.get(MFA_OK_COOKIE)?.value) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase.auth.getClaims();
      const sub = data?.claims?.sub;
      if (typeof sub === "string" && sub) {
        const { refreshMfaOkCookie } = await import("@/server/auth/mfa-core");
        await refreshMfaOkCookie(sub, trusted);
      }
    } catch {
      /* leave the existing signed cookie as-is */
    }
  }
}

/** Provisional untrusted window right after password / OAuth (until trust answer). */
export async function startProvisionalSession() {
  await applyDeviceTrustPolicy(false);
}

export async function clearSessionPolicyCookies() {
  const jar = await cookies();
  jar.delete(SESSION_EXPIRES_COOKIE);
  jar.delete(DEVICE_TRUSTED_COOKIE);
  jar.delete(MFA_OK_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
}

export async function deskSessionExpired(): Promise<boolean> {
  const jar = await cookies();
  return isSessionExpiryPast(jar.get(SESSION_EXPIRES_COOKIE)?.value);
}

/**
 * Bump successful sign-in count on the user. On the 3rd login (and if 2FA is
 * off and not previously skipped), callers should suggest enabling 2FA.
 */
export async function recordSuccessfulLogin(userId: string): Promise<{
  loginCount: number;
  suggest2fa: boolean;
}> {
  if (!userId) return { loginCount: 0, suggest2fa: false };

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return { loginCount: 0, suggest2fa: false };
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const prev = Number(meta.hydra_login_count ?? 0);
    const loginCount = (Number.isFinite(prev) ? prev : 0) + 1;
    const skipped = Boolean(meta.hydra_2fa_prompt_skipped);

    await supabase.auth.updateUser({
      data: {
        ...meta,
        hydra_login_count: loginCount,
        hydra_last_login_at: new Date().toISOString(),
      },
    });

    let mfaEnabled = false;
    try {
      const { data } = await supabase
        .from("user_mfa_settings")
        .select("enabled")
        .eq("user_id", userId)
        .maybeSingle();
      mfaEnabled = Boolean(data?.enabled);
    } catch {
      mfaEnabled = false;
    }

    const suggest2fa = loginCount === 3 && !mfaEnabled && !skipped;
    return { loginCount, suggest2fa };
  } catch (err) {
    console.warn("[session-policy] recordSuccessfulLogin failed", err);
    return { loginCount: 0, suggest2fa: false };
  }
}

export async function skipTwoFactorPrompt() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sign in again." };
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  await supabase.auth.updateUser({
    data: {
      ...meta,
      hydra_2fa_prompt_skipped: true,
    },
  });
  return { ok: true as const };
}
