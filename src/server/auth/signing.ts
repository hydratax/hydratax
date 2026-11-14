import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { isProductionRuntime } from "@/lib/env";

/**
 * Purpose-separated HMAC signing for short-lived auth artefacts
 * (MFA step-up cookies, HMRC OAuth state, ...).
 *
 * Root secret resolution (per purpose):
 *   1. the purpose-specific env var (e.g. MFA_COOKIE_SECRET, HMRC_STATE_SECRET)
 *   2. TOKEN_ENCRYPTION_KEY
 *   3. development only: a random per-process key (artefacts do not survive a restart)
 *
 * Production fails closed: with no root secret every sign() throws and every
 * verify() returns false. A per-purpose sub-key is derived with HMAC so a
 * signature minted for one purpose can never validate for another.
 */
export type SigningPurpose = "mfa-cookie" | "mfa-otp" | "hmrc-oauth-state";

const PURPOSE_ENV: Record<SigningPurpose, string> = {
  "mfa-cookie": "MFA_COOKIE_SECRET",
  "mfa-otp": "MFA_COOKIE_SECRET",
  "hmrc-oauth-state": "HMRC_STATE_SECRET",
};

const globalForDevKey = globalThis as unknown as {
  __hydrataxDevSigningKey?: Buffer;
};

function rootSecret(purpose: SigningPurpose): string | Buffer | null {
  const specific = process.env[PURPOSE_ENV[purpose]]?.trim();
  if (specific) return specific;
  const shared = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (shared) return shared;
  if (isProductionRuntime()) return null;
  if (!globalForDevKey.__hydrataxDevSigningKey) {
    globalForDevKey.__hydrataxDevSigningKey = randomBytes(32);
  }
  return globalForDevKey.__hydrataxDevSigningKey!;
}

function subKey(purpose: SigningPurpose): Buffer {
  const root = rootSecret(purpose);
  if (!root) {
    throw new Error(
      `Signing secret missing for ${purpose}: set ${PURPOSE_ENV[purpose]} (or TOKEN_ENCRYPTION_KEY).`,
    );
  }
  return createHmac("sha256", root)
    .update(`hydratax:${purpose}:v1`)
    .digest();
}

/** base64url(HMAC-SHA256(subkey(purpose), data)). Throws if no secret in production. */
export function hmacSign(purpose: SigningPurpose, data: string): string {
  return createHmac("sha256", subKey(purpose)).update(data).digest("base64url");
}

/** Constant-time signature check. Never throws; missing secret => false. */
export function hmacVerify(
  purpose: SigningPurpose,
  data: string,
  signature: string,
): boolean {
  try {
    const expected = Buffer.from(hmacSign(purpose, data));
    const given = Buffer.from(signature);
    if (expected.length !== given.length) return false;
    return timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/** Constant-time string comparison that tolerates different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
