import { randomBytes } from "crypto";
import { hmacSign, hmacVerify, safeEqual } from "@/server/auth/signing";

/**
 * CSRF-safe HMRC OAuth `state`.
 *
 * state  = base64url(JSON{c,r,u,n,e}) + "." + HMAC   (purpose "hmrc-oauth-state")
 * cookie = nonce + "." + HMAC(cookie:nonce:userId)    (HttpOnly, path /api/hmrc, 10 min)
 *
 * The callback only accepts a state that (1) carries a valid signature,
 * (2) is unexpired, (3) was minted for the signed-in user, and (4) whose nonce
 * equals the one in the browser's own cookie — so a state forged or replayed
 * from another browser cannot attach HMRC tokens to a client.
 */
export const HMRC_STATE_COOKIE = "ht_hmrc_oauth";
export const HMRC_STATE_TTL_SECONDS = 600;

export type HmrcReturnTo = "vat" | "overview";

export type HmrcStatePayload = {
  clientId: string;
  returnTo: HmrcReturnTo;
  userId: string;
  nonce: string;
  expiresAt: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHmrcClientUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseHmrcReturnTo(value: unknown): HmrcReturnTo {
  return value === "vat" ? "vat" : "overview";
}

function cookieBody(nonce: string, userId: string) {
  return `cookie:${nonce}:${userId}`;
}

export function createHmrcState(input: {
  clientId: string;
  returnTo: HmrcReturnTo;
  userId: string;
  nowMs?: number;
}): { state: string; cookieValue: string; nonce: string } {
  if (!isHmrcClientUuid(input.clientId)) {
    throw new Error("Invalid client id");
  }
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt =
    Math.floor((input.nowMs ?? Date.now()) / 1000) + HMRC_STATE_TTL_SECONDS;
  const body = Buffer.from(
    JSON.stringify({
      c: input.clientId,
      r: input.returnTo,
      u: input.userId,
      n: nonce,
      e: expiresAt,
    }),
  ).toString("base64url");
  const state = `${body}.${hmacSign("hmrc-oauth-state", body)}`;
  const cookieValue = `${nonce}.${hmacSign(
    "hmrc-oauth-state",
    cookieBody(nonce, input.userId),
  )}`;
  return { state, cookieValue, nonce };
}

/** Returns the verified payload, or null for ANY problem. */
export function verifyHmrcState(
  state: string | null | undefined,
  cookieValue: string | null | undefined,
  userId: string,
  nowMs: number = Date.now(),
): HmrcStatePayload | null {
  if (!state || !cookieValue || !userId) return null;

  const sp = state.split(".");
  if (sp.length !== 2) return null;
  const [body, sig] = sp as [string, string];
  if (!hmacVerify("hmrc-oauth-state", body, sig)) return null;

  let raw: { c?: unknown; r?: unknown; u?: unknown; n?: unknown; e?: unknown };
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !isHmrcClientUuid(raw.c) ||
    typeof raw.u !== "string" ||
    typeof raw.n !== "string" ||
    typeof raw.e !== "number" ||
    (raw.r !== "vat" && raw.r !== "overview")
  ) {
    return null;
  }
  if (raw.e <= Math.floor(nowMs / 1000)) return null;
  if (!safeEqual(raw.u, userId)) return null;

  const cp = cookieValue.split(".");
  if (cp.length !== 2) return null;
  const [cookieNonce, cookieSig] = cp as [string, string];
  if (
    !hmacVerify("hmrc-oauth-state", cookieBody(cookieNonce, userId), cookieSig)
  ) {
    return null;
  }
  if (!safeEqual(cookieNonce, raw.n)) return null;

  return {
    clientId: raw.c,
    returnTo: raw.r,
    userId: raw.u,
    nonce: raw.n,
    expiresAt: raw.e,
  };
}

/** Fixed, validated redirect target — never built from raw input. */
export function hmrcReturnPath(
  clientId: string,
  returnTo: HmrcReturnTo,
  result: "connected" | string,
): string {
  if (!isHmrcClientUuid(clientId)) return "/settings/hmrc";
  const base = returnTo === "vat" ? `/clients/${clientId}/vat` : `/clients/${clientId}`;
  return `${base}?hmrc=${encodeURIComponent(result)}`;
}
