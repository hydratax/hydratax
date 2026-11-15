import { randomBytes } from "crypto";
import { hmacSign, hmacVerify, safeEqual } from "@/server/auth/signing";

/**
 * CSRF-safe Stripe Connect OAuth `state` (same pattern as HMRC).
 * state  = base64url(JSON{u,n,e}) + "." + HMAC
 * cookie = nonce + "." + HMAC(cookie:nonce:userId)
 */
export const STRIPE_CONNECT_STATE_COOKIE = "ht_stripe_connect_oauth";
export const STRIPE_CONNECT_STATE_TTL_SECONDS = 600;

export type StripeConnectStatePayload = {
  userId: string;
  practiceId: string;
  nonce: string;
  expiresAt: number;
};

function cookieBody(nonce: string, userId: string) {
  return `cookie:${nonce}:${userId}`;
}

export function createStripeConnectState(input: {
  userId: string;
  practiceId: string;
  nowMs?: number;
}): { state: string; cookieValue: string } {
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt =
    Math.floor((input.nowMs ?? Date.now()) / 1000) +
    STRIPE_CONNECT_STATE_TTL_SECONDS;
  const body = Buffer.from(
    JSON.stringify({
      u: input.userId,
      p: input.practiceId,
      n: nonce,
      e: expiresAt,
    }),
  ).toString("base64url");
  const state = `${body}.${hmacSign("stripe-connect-oauth-state", body)}`;
  const cookieValue = `${nonce}.${hmacSign(
    "stripe-connect-oauth-state",
    cookieBody(nonce, input.userId),
  )}`;
  return { state, cookieValue };
}

export function verifyStripeConnectState(
  state: string | null | undefined,
  cookieValue: string | null | undefined,
  userId: string,
  nowMs: number = Date.now(),
): StripeConnectStatePayload | null {
  if (!state || !cookieValue || !userId) return null;

  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  if (!hmacVerify("stripe-connect-oauth-state", body, sig)) return null;

  let parsed: { u?: string; p?: string; n?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof parsed.u !== "string" ||
    typeof parsed.p !== "string" ||
    typeof parsed.n !== "string" ||
    typeof parsed.e !== "number"
  ) {
    return null;
  }
  if (parsed.u !== userId) return null;
  if (parsed.e < Math.floor(nowMs / 1000)) return null;

  const [cookieNonce, cookieSig] = cookieValue.split(".");
  if (!cookieNonce || !cookieSig) return null;
  if (!safeEqual(cookieNonce, parsed.n)) return null;
  if (
    !hmacVerify(
      "stripe-connect-oauth-state",
      cookieBody(cookieNonce, userId),
      cookieSig,
    )
  ) {
    return null;
  }

  return {
    userId: parsed.u,
    practiceId: parsed.p,
    nonce: parsed.n,
    expiresAt: parsed.e,
  };
}
