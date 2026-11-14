"use server";

/**
 * Public MFA server actions. EVERY export of this file is callable from the
 * browser, so none of them accept a userId — it always comes from the verified
 * session. Helpers that take a userId live in "@/server/auth/mfa-core".
 */

import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { getOptionalSession, requireSession } from "@/server/auth/session";
import { smsConfigured } from "@/server/mfa/sms";
import {
  beginMfaIfRequired,
  clearMfaCookies,
  getMfaAdminClient,
  hasValidMfaPendingCookie,
  logMfaEvent,
  readMfaStatus,
  setMfaOkCookie,
  verifyMfaChallenge,
} from "@/server/auth/mfa-core";
import { rateLimit } from "@/lib/rate-limit";

export type MfaSettings = {
  enabled: boolean;
  channel: "email" | "phone" | "totp" | null;
  altEmail: string | null;
  phoneE164: string | null;
  smsAvailable: boolean;
};

const saveSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(["email", "phone", "totp"]),
  altEmail: z.string().email().max(254).optional().or(z.literal("")),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +447700900123")
    .optional()
    .or(z.literal("")),
});

const codeSchema = z.object({
  code: z.string().max(32),
});

export async function getMfaSettings(): Promise<MfaSettings> {
  const session = await getOptionalSession();
  const empty: MfaSettings = {
    enabled: false,
    channel: null,
    altEmail: null,
    phoneE164: null,
    smsAvailable: smsConfigured(),
  };
  if (!session || !isSupabaseConfigured()) return empty;

  const status = await readMfaStatus(session.userId);
  if (status.state !== "on") return empty;
  return {
    enabled: true,
    channel: status.channel,
    altEmail: status.altEmail,
    phoneE164: status.phoneE164,
    smsAvailable: smsConfigured(),
  };
}

export async function saveMfaSettings(input: z.infer<typeof saveSchema>) {
  // requireSession enforces step-up first, so an attacker holding only the
  // password cannot re-point 2FA at their own email / phone.
  const session = await requireSession();
  if (!isSupabaseConfigured()) {
    throw new Error("Two-factor authentication needs Supabase Auth configured.");
  }
  const data = saveSchema.parse(input);

  if (data.channel === "email" && !data.altEmail?.trim()) {
    throw new Error("Enter an alternative email address for codes.");
  }
  if (data.channel === "phone") {
    if (!data.phoneE164?.trim()) {
      throw new Error("Enter a mobile number in international format (+44…).");
    }
    if (!smsConfigured()) {
      throw new Error(
        "SMS is not configured yet. Use Authenticator app or email 2FA instead (no SMS cost).",
      );
    }
  }
  if (data.enabled && data.channel === "totp") {
    // The factor is enrolled + verified in the browser before this call; make
    // sure a verified TOTP factor really exists so the user is not locked out.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (!factors?.totp?.some((f) => f.status === "verified")) {
      throw new Error("Link and verify your authenticator app first.");
    }
  }

  const admin = await getMfaAdminClient();
  const row = {
    user_id: session.userId,
    enabled: data.enabled,
    channel: data.channel,
    alt_email: data.channel === "email" ? data.altEmail!.trim().toLowerCase() : null,
    phone_e164: data.channel === "phone" ? data.phoneE164!.trim() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("user_mfa_settings").upsert(row, {
    onConflict: "user_id",
  });
  if (error) throw new Error(error.message);

  // Keep the current browser session usable after enabling 2FA (the user just
  // passed requireSession step-up / is configuring it themselves).
  if (data.enabled) {
    await setMfaOkCookie(session.userId);
  }
  return { ok: true as const };
}

export async function disableMfa() {
  // Step-up enforced by requireSession.
  const session = await requireSession();
  if (!isSupabaseConfigured()) return { ok: true as const };
  const admin = await getMfaAdminClient();
  const { error } = await admin.from("user_mfa_settings").upsert({
    user_id: session.userId,
    enabled: false,
    channel: null,
    alt_email: null,
    phone_e164: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await admin.from("mfa_challenges").delete().eq("user_id", session.userId);
  await clearMfaCookies();
  return { ok: true as const };
}

/**
 * Mark MFA complete after the browser verified a TOTP code with Supabase Auth.
 * We do NOT trust the client: the VERIFIED JWT must carry aal2.
 */
export async function markMfaVerified(): Promise<{ ok: boolean; error?: string }> {
  const session = await getOptionalSession();
  if (!session) return { ok: false, error: "Sign in again." };

  const limited = rateLimit({
    key: `mfa-mark:${session.userId}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    await logMfaEvent(session.userId, "auth.mfa_locked", "mark_rate_limited");
    return { ok: false, error: "Too many attempts. Wait a few minutes." };
  }

  const status = await readMfaStatus(session.userId);
  if (status.state !== "on" || status.channel !== "totp") {
    return { ok: false, error: "Authenticator verification is not required." };
  }
  // No pending-cookie requirement here: the verified aal2 claim below is the proof.
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    if (
      claimsData?.claims?.sub !== session.userId ||
      claimsData.claims.aal !== "aal2"
    ) {
      await logMfaEvent(session.userId, "auth.mfa_failed", "totp_aal2_missing");
      return { ok: false, error: "Authenticator code was not verified." };
    }
  } catch {
    return { ok: false, error: "Could not confirm verification. Try again." };
  }

  await setMfaOkCookie(session.userId);
  return { ok: true };
}

export async function resendMfaChallenge(): Promise<{
  ok: boolean;
  maskedTo?: string;
  channel?: "email" | "phone" | "totp";
  error?: string;
}> {
  try {
    const session = await getOptionalSession();
    if (!session) {
      return { ok: false, error: "Sign in again to verify." };
    }
    const started = await beginMfaIfRequired(session.userId);
    if (!started.required) {
      return { ok: false, error: "2FA is not required for this account." };
    }
    return {
      ok: true,
      channel: started.channel,
      maskedTo: started.maskedTo,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send code",
    };
  }
}

export async function verifyMfaCode(input: {
  code: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getOptionalSession();
  if (!session) {
    return { ok: false, error: "Sign in again to verify." };
  }
  const parsed = codeSchema.safeParse(input);
  const code = String(parsed.success ? parsed.data.code : "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  if (!(await hasValidMfaPendingCookie(session.userId))) {
    await logMfaEvent(session.userId, "auth.mfa_failed", "pending_cookie_missing");
    return { ok: false, error: "Verification expired. Sign in again." };
  }

  const result = await verifyMfaChallenge(session.userId, code);
  if (!result.ok) return result;

  await setMfaOkCookie(session.userId);
  return { ok: true };
}
