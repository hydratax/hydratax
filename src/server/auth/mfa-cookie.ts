import { hmacSign, hmacVerify } from "@/server/auth/signing";

/**
 * Signed MFA step-up cookies.
 *
 * Value format: `v1.<kind>.<userId>.<expiresAtUnix>.<hmac>` where the HMAC
 * (SHA-256, purpose "mfa-cookie") covers everything before the last dot.
 * A raw user id (the old format) never validates, and a cookie minted for one
 * user, kind or expiry cannot be replayed for another.
 */
export type MfaCookieKind = "ok" | "pending";

const VERSION = "v1";
/** Hard ceiling on any cookie lifetime we will honour (trusted device = 7d). */
const MAX_TTL_SECONDS = 8 * 24 * 60 * 60;

function body(kind: MfaCookieKind, userId: string, exp: number): string {
  return `${VERSION}.${kind}.${userId}.${exp}`;
}

export function signMfaCookie(
  kind: MfaCookieKind,
  userId: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  if (!userId || userId.includes(".")) {
    throw new Error("Invalid user id for MFA cookie");
  }
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_TTL_SECONDS);
  const exp = Math.floor(nowMs / 1000) + ttl;
  const data = body(kind, userId, exp);
  return `${data}.${hmacSign("mfa-cookie", data)}`;
}

/** True only for an unexpired, correctly signed cookie of this kind for this user. */
export function verifyMfaCookie(
  kind: MfaCookieKind,
  value: string | null | undefined,
  userId: string,
  nowMs: number = Date.now(),
): boolean {
  if (!value || !userId) return false;
  const parts = value.split(".");
  if (parts.length !== 5) return false;
  const [version, k, uid, expRaw, sig] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION || k !== kind || uid !== userId) return false;
  if (!/^\d{1,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  const nowSec = Math.floor(nowMs / 1000);
  if (exp <= nowSec) return false;
  if (exp - nowSec > MAX_TTL_SECONDS) return false;
  return hmacVerify("mfa-cookie", body(kind, uid, exp), sig);
}
