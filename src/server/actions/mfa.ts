"use server";

import { createHash, randomInt } from "crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { MFA_OK_COOKIE, MFA_PENDING_COOKIE } from "@/lib/mfa-cookies";
import { getOptionalSession, requireSession } from "@/server/auth/session";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { sendSmsOtp, smsConfigured } from "@/server/mfa/sms";

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
  altEmail: z.string().email().optional().or(z.literal("")),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +447700900123")
    .optional()
    .or(z.literal("")),
});

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function maskDestination(channel: "email" | "phone", dest: string) {
  if (channel === "email") {
    const [u, d] = dest.split("@");
    if (!d) return "***";
    return `${(u ?? "").slice(0, 2)}***@${d}`;
  }
  return `***${dest.slice(-4)}`;
}

async function supabaseUserClient() {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

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

  try {
    const supabase = await supabaseUserClient();
    const { data } = await supabase
      .from("user_mfa_settings")
      .select("enabled, channel, alt_email, phone_e164")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (!data) return empty;
    return {
      enabled: Boolean(data.enabled),
      channel: (data.channel as "email" | "phone" | "totp" | null) ?? null,
      altEmail: (data.alt_email as string | null) ?? null,
      phoneE164: (data.phone_e164 as string | null) ?? null,
      smsAvailable: smsConfigured(),
    };
  } catch {
    return empty;
  }
}

export async function saveMfaSettings(input: z.infer<typeof saveSchema>) {
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
  // totp: factor is enrolled via supabase.auth.mfa on the client before save

  const supabase = await supabaseUserClient();
  const row = {
    user_id: session.userId,
    enabled: data.enabled,
    channel: data.channel,
    alt_email: data.channel === "email" ? data.altEmail!.trim().toLowerCase() : null,
    phone_e164: data.channel === "phone" ? data.phoneE164!.trim() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("user_mfa_settings").upsert(row, {
    onConflict: "user_id",
  });
  if (error) throw new Error(error.message);

  // Keep the current browser session usable after enabling 2FA.
  if (data.enabled) {
    const jar = await cookies();
    jar.set(MFA_OK_COOKIE, session.userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    jar.delete(MFA_PENDING_COOKIE);
  }
  return { ok: true as const };
}

export async function disableMfa() {
  const session = await requireSession();
  if (!isSupabaseConfigured()) return { ok: true as const };
  const supabase = await supabaseUserClient();
  await supabase.from("user_mfa_settings").upsert({
    user_id: session.userId,
    enabled: false,
    channel: null,
    alt_email: null,
    phone_e164: null,
    updated_at: new Date().toISOString(),
  });
  const jar = await cookies();
  jar.delete(MFA_PENDING_COOKIE);
  jar.delete(MFA_OK_COOKIE);
  return { ok: true as const };
}

/** After password login — start OTP if MFA enabled. */
export async function beginMfaIfRequired(userId: string): Promise<{
  required: boolean;
  maskedTo?: string;
  channel?: "email" | "phone" | "totp";
}> {
  if (!isSupabaseConfigured()) return { required: false };
  const supabase = await supabaseUserClient();
  const { data } = await supabase
    .from("user_mfa_settings")
    .select("enabled, channel, alt_email, phone_e164")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.enabled || !data.channel) {
    const jar = await cookies();
    jar.set(MFA_OK_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    jar.delete(MFA_PENDING_COOKIE);
    return { required: false };
  }

  const channel = data.channel as "email" | "phone" | "totp";
  const jar = await cookies();
  jar.set(MFA_PENDING_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  jar.delete(MFA_OK_COOKIE);

  // Authenticator app — code comes from Google Authenticator / Authy (free, no SMS).
  if (channel === "totp") {
    return { required: true, channel: "totp", maskedTo: "authenticator app" };
  }

  const destination =
    channel === "email"
      ? String(data.alt_email ?? "")
      : String(data.phone_e164 ?? "");
  if (!destination) return { required: false };

  await sendMfaChallengeInternal(userId, channel, destination);

  return {
    required: true,
    channel,
    maskedTo: maskDestination(channel, destination),
  };
}

/** Mark MFA complete after client-side TOTP verify (Supabase Auth MFA). */
export async function markMfaVerified(): Promise<{ ok: boolean; error?: string }> {
  const session = await getOptionalSession();
  if (!session) return { ok: false, error: "Sign in again." };
  const jar = await cookies();
  const pending = jar.get(MFA_PENDING_COOKIE)?.value;
  if (pending && pending !== session.userId) {
    return { ok: false, error: "Verification expired. Sign in again." };
  }
  jar.set(MFA_OK_COOKIE, session.userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  jar.delete(MFA_PENDING_COOKIE);
  return { ok: true };
}

async function sendMfaChallengeInternal(
  userId: string,
  channel: "email" | "phone",
  destination: string,
) {
  const code = String(randomInt(100000, 999999));
  const supabase = await supabaseUserClient();
  await supabase.from("mfa_challenges").delete().eq("user_id", userId);
  const { error } = await supabase.from("mfa_challenges").insert({
    user_id: userId,
    code_hash: hashCode(code),
    channel,
    destination,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);

  if (channel === "email") {
    await sendTransactionalEmail({
      to: destination,
      subject: "HydraTax sign-in code",
      text: `Your HydraTax verification code is ${code}. It expires in 10 minutes. If you did not try to sign in, ignore this email.`,
      html: `<p>Your HydraTax verification code is <strong style="font-size:20px;letter-spacing:0.12em">${code}</strong>.</p><p>It expires in 10 minutes. If you did not try to sign in, ignore this email.</p>`,
    });
    return;
  }

  const sent = await sendSmsOtp({
    toE164: destination,
    body: `HydraTax code: ${code}. Expires in 10 minutes.`,
  });
  if (sent === "unavailable") {
    throw new Error("SMS is not configured on this server.");
  }
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
  const code = String(input.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  const jar = await cookies();
  const pending = jar.get(MFA_PENDING_COOKIE)?.value;
  if (pending !== session.userId) {
    return { ok: false, error: "Verification expired. Sign in again." };
  }

  const supabase = await supabaseUserClient();
  const { data: challenge } = await supabase
    .from("mfa_challenges")
    .select("id, code_hash, expires_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return { ok: false, error: "No code found. Request a new one." };
  }
  if (new Date(challenge.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "Code expired. Request a new one." };
  }
  if (hashCode(code) !== challenge.code_hash) {
    return { ok: false, error: "Incorrect code. Try again." };
  }

  await supabase.from("mfa_challenges").delete().eq("user_id", session.userId);
  jar.set(MFA_OK_COOKIE, session.userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  jar.delete(MFA_PENDING_COOKIE);
  return { ok: true };
}

export async function userNeedsMfaStepUp(
  userId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await supabaseUserClient();
    const { data } = await supabase
      .from("user_mfa_settings")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.enabled) return false;
    const jar = await cookies();
    return jar.get(MFA_OK_COOKIE)?.value !== userId;
  } catch {
    return false;
  }
}
