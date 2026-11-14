import { randomInt } from "crypto";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/env";
import { MFA_OK_COOKIE, MFA_PENDING_COOKIE } from "@/lib/mfa-cookies";
import {
  DEVICE_TRUSTED_COOKIE,
  sessionTtlSeconds,
} from "@/lib/session-policy";
import { rateLimit } from "@/lib/rate-limit";
import { signMfaCookie, verifyMfaCookie } from "@/server/auth/mfa-cookie";
import { hmacSign, safeEqual } from "@/server/auth/signing";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { logSecurityEvent } from "@/server/privacy/security-events";
import { sendSmsOtp } from "@/server/mfa/sms";

/**
 * Internal MFA primitives.
 *
 * This module is deliberately NOT a "use server" file: every export of a
 * "use server" module is a public endpoint callable from the browser, and these
 * helpers take a userId argument. Public actions live in
 * src/server/actions/mfa.ts and derive the userId from the verified session.
 */

export type MfaChannel = "email" | "phone" | "totp";

export type MfaStatus =
  | { state: "off" }
  | {
      state: "on";
      channel: MfaChannel;
      altEmail: string | null;
      phoneE164: string | null;
    }
  /** Settings could not be read — callers must fail closed. */
  | { state: "unknown" };

export const MFA_MAX_ATTEMPTS = 5;
const MFA_PENDING_TTL_SECONDS = 15 * 60;
const MFA_CODE_TTL_MS = 10 * 60 * 1000;
const MFA_RESEND_COOLDOWN_MS = 30 * 1000;

/**
 * Best-effort, non-throwing audit of MFA failures / lockouts. Records the
 * verified user id and a fixed reason code only — never the code, its hash,
 * the destination address / number, or any secret.
 */
export async function logMfaEvent(
  userId: string,
  type: "auth.mfa_failed" | "auth.mfa_locked",
  reason: string,
): Promise<void> {
  await logSecurityEvent({
    type,
    severity: type === "auth.mfa_locked" ? "medium" : "low",
    actorUserId: userId,
    throttleKey: `mfa:${userId}`,
    details: { reason },
  });
}

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * MFA settings / challenges are written ONLY by the server with the service
 * role (RLS gives the browser no write access), so a stolen password session
 * cannot disable 2FA or plant a challenge with a known code.
 */
export async function getMfaAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Two-factor authentication requires SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin();
}

async function readClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return getMfaAdminClient();
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

export function maskDestination(channel: "email" | "phone", dest: string) {
  if (channel === "email") {
    const [u, d] = dest.split("@");
    if (!d) return "***";
    return `${(u ?? "").slice(0, 2)}***@${d}`;
  }
  return `***${dest.slice(-4)}`;
}

export async function readMfaStatus(userId: string): Promise<MfaStatus> {
  if (!isSupabaseConfigured()) return { state: "off" };
  try {
    const client = await readClient();
    const { data, error } = await client
      .from("user_mfa_settings")
      .select("enabled, channel, alt_email, phone_e164")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { state: "unknown" };
    if (!data || !data.enabled) return { state: "off" };
    const channel = data.channel as MfaChannel | null;
    if (channel !== "email" && channel !== "phone" && channel !== "totp") {
      return { state: "unknown" };
    }
    return {
      state: "on",
      channel,
      altEmail: (data.alt_email as string | null) ?? null,
      phoneE164: (data.phone_e164 as string | null) ?? null,
    };
  } catch {
    return { state: "unknown" };
  }
}

/** Has the signed ok-cookie for THIS user been presented? */
export async function hasValidMfaOkCookie(userId: string): Promise<boolean> {
  const jar = await cookies();
  return verifyMfaCookie("ok", jar.get(MFA_OK_COOKIE)?.value, userId);
}

export async function hasValidMfaPendingCookie(
  userId: string,
): Promise<boolean> {
  const jar = await cookies();
  return verifyMfaCookie("pending", jar.get(MFA_PENDING_COOKIE)?.value, userId);
}

/**
 * True when the user has MFA enabled and has not completed step-up in this
 * browser. FAILS CLOSED: any error / unreadable settings => step-up required.
 */
export async function userNeedsMfaStepUp(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const status = await readMfaStatus(userId);
    if (status.state === "off") return false;
    if (status.state === "unknown") return true;
    return !(await hasValidMfaOkCookie(userId));
  } catch {
    return true;
  }
}

export async function setMfaOkCookie(userId: string, trusted?: boolean) {
  const jar = await cookies();
  const isTrusted =
    trusted ?? jar.get(DEVICE_TRUSTED_COOKIE)?.value === "1";
  const ttl = sessionTtlSeconds(isTrusted);
  jar.set(MFA_OK_COOKIE, signMfaCookie("ok", userId, ttl), {
    ...cookieBase(),
    maxAge: ttl,
  });
  jar.delete(MFA_PENDING_COOKIE);
}

async function setMfaPendingCookie(userId: string) {
  const jar = await cookies();
  jar.set(
    MFA_PENDING_COOKIE,
    signMfaCookie("pending", userId, MFA_PENDING_TTL_SECONDS),
    { ...cookieBase(), maxAge: MFA_PENDING_TTL_SECONDS },
  );
  jar.delete(MFA_OK_COOKIE);
}

/**
 * Re-issue the ok-cookie with a fresh expiry aligned to the desk session
 * (used when trust-device changes the TTL). Only ever re-signs a cookie that
 * is currently valid for this user — it can never mint step-up from nothing.
 */
export async function refreshMfaOkCookie(userId: string, trusted: boolean) {
  if (!(await hasValidMfaOkCookie(userId))) return;
  await setMfaOkCookie(userId, trusted);
}

export async function clearMfaCookies() {
  const jar = await cookies();
  jar.delete(MFA_OK_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
}

function hashCode(userId: string, code: string) {
  return hmacSign("mfa-otp", `${userId}:${code}`);
}

/** After password / OAuth login — start OTP when MFA is enabled. */
export async function beginMfaIfRequired(userId: string): Promise<{
  required: boolean;
  maskedTo?: string;
  channel?: MfaChannel;
}> {
  if (!isSupabaseConfigured()) return { required: false };

  const status = await readMfaStatus(userId);

  if (status.state === "off") {
    // No 2FA: no step-up cookie is needed (and none is minted).
    await clearMfaCookies();
    return { required: false };
  }

  await setMfaPendingCookie(userId);

  if (status.state === "unknown") {
    // Fail closed: the verify page explains the problem.
    return { required: true };
  }

  if (status.channel === "totp") {
    return { required: true, channel: "totp", maskedTo: "authenticator app" };
  }

  const destination =
    status.channel === "email"
      ? String(status.altEmail ?? "")
      : String(status.phoneE164 ?? "");
  if (!destination) return { required: true, channel: status.channel };

  await sendMfaChallenge(userId, status.channel, destination);

  return {
    required: true,
    channel: status.channel,
    maskedTo: maskDestination(status.channel, destination),
  };
}

async function sendMfaChallenge(
  userId: string,
  channel: "email" | "phone",
  destination: string,
) {
  const admin = await getMfaAdminClient();

  // Resend cooldown: a reload / resend spam must not mint endless codes
  // (email bombing) or keep resetting the attempt counter.
  const { data: latest } = await admin
    .from("mfa_challenges")
    .select("created_at, expires_at, attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    const age = Date.now() - new Date(latest.created_at as string).getTime();
    const live =
      new Date(latest.expires_at as string).getTime() > Date.now() &&
      Number(latest.attempts ?? 0) < MFA_MAX_ATTEMPTS;
    if (live && age < MFA_RESEND_COOLDOWN_MS) return;
  }

  const sendLimit = rateLimit({
    key: `mfa-send:${userId}`,
    limit: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (!sendLimit.ok) {
    await logMfaEvent(userId, "auth.mfa_locked", "send_rate_limited");
    throw new Error("Too many codes requested. Wait a few minutes and try again.");
  }

  const code = String(randomInt(100000, 1000000));
  await admin.from("mfa_challenges").delete().eq("user_id", userId);
  const { error } = await admin.from("mfa_challenges").insert({
    user_id: userId,
    code_hash: hashCode(userId, code),
    channel,
    destination,
    attempts: 0,
    expires_at: new Date(Date.now() + MFA_CODE_TTL_MS).toISOString(),
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

export type VerifyChallengeResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verify an emailed / SMS OTP. At most MFA_MAX_ATTEMPTS guesses per challenge,
 * after which the challenge is destroyed. Constant-time comparison.
 */
export async function verifyMfaChallenge(
  userId: string,
  code: string,
): Promise<VerifyChallengeResult> {
  const lim = rateLimit({
    key: `mfa-verify:${userId}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!lim.ok) {
    await logMfaEvent(userId, "auth.mfa_locked", "verify_rate_limited");
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }

  let admin;
  try {
    admin = await getMfaAdminClient();
  } catch {
    return { ok: false, error: "Verification is unavailable. Try again later." };
  }

  const { data: challenge, error } = await admin
    .from("mfa_challenges")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Verification is unavailable. Try again later." };
  }
  if (!challenge) {
    return { ok: false, error: "No code found. Request a new one." };
  }
  if (new Date(challenge.expires_at as string).getTime() < Date.now()) {
    await admin.from("mfa_challenges").delete().eq("id", challenge.id);
    return { ok: false, error: "Code expired. Request a new one." };
  }

  const attempts = Number(challenge.attempts ?? 0);
  if (attempts >= MFA_MAX_ATTEMPTS) {
    await admin.from("mfa_challenges").delete().eq("id", challenge.id);
    await logMfaEvent(userId, "auth.mfa_locked", "challenge_attempts_exhausted");
    return {
      ok: false,
      error: "Too many incorrect attempts. Request a new code.",
    };
  }

  // Count the attempt BEFORE comparing (optimistic lock on the old counter so
  // parallel guesses cannot all ride on the same counter value).
  const { data: bumped } = await admin
    .from("mfa_challenges")
    .update({ attempts: attempts + 1 })
    .eq("id", challenge.id)
    .eq("attempts", attempts)
    .select("id");
  if (!bumped?.length) {
    return { ok: false, error: "Try again." };
  }

  if (!safeEqual(hashCode(userId, code), String(challenge.code_hash))) {
    if (attempts + 1 >= MFA_MAX_ATTEMPTS) {
      await admin.from("mfa_challenges").delete().eq("id", challenge.id);
      await logMfaEvent(userId, "auth.mfa_locked", "challenge_attempts_exhausted");
      return {
        ok: false,
        error: "Too many incorrect attempts. Request a new code.",
      };
    }
    await logMfaEvent(userId, "auth.mfa_failed", "incorrect_code");
    return { ok: false, error: "Incorrect code. Try again." };
  }

  await admin.from("mfa_challenges").delete().eq("user_id", userId);
  return { ok: true };
}
