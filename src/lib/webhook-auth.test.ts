import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeBearer,
  bearerMatches,
  safeEqual,
  signSvix,
  verifyMetaSignature,
  verifySvixSignature,
} from "./webhook-auth";

const req = (authorization?: string) => ({
  headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? (authorization ?? null) : null) },
});

describe("safeEqual", () => {
  it("compares equal / unequal / different-length strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("bearer / cron auth (fail closed)", () => {
  it("fails closed when the secret is unset or empty", () => {
    expect(bearerMatches("Bearer anything", undefined)).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(authorizeBearer(req("Bearer x"), undefined, "Cron")).toMatchObject({ ok: false, status: 503 });
    expect(authorizeBearer(req("Bearer x"), "", "Cron")).toMatchObject({ ok: false, status: 503 });
  });

  it("rejects missing, malformed and wrong credentials with 401", () => {
    expect(authorizeBearer(req(), "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeBearer(req("s3cret"), "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeBearer(req("Basic s3cret"), "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeBearer(req("Bearer nope"), "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
    expect(authorizeBearer(req("Bearer s3cre"), "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts the exact bearer secret", () => {
    expect(authorizeBearer(req("Bearer s3cret"), "s3cret", "Cron")).toEqual({ ok: true });
  });

  it("ignores a ?secret= query string (header only)", () => {
    const r = {
      url: "https://x.test/api/cron/notifications?secret=s3cret",
      headers: { get: () => null },
    };
    expect(authorizeBearer(r, "s3cret", "Cron")).toMatchObject({ ok: false, status: 401 });
  });
});

describe("verifyMetaSignature (WhatsApp X-Hub-Signature-256)", () => {
  const secret = "meta_app_secret";
  const body = JSON.stringify({ entry: [{ id: "1" }] });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature over the raw body", () => {
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
    expect(verifyMetaSignature(new TextEncoder().encode(body), sig, secret)).toBe(true);
  });

  it("fails closed with no secret / no header / bad format", () => {
    expect(verifyMetaSignature(body, sig, undefined)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifyMetaSignature(body, sig.replace("sha256=", ""), secret)).toBe(false);
  });

  it("rejects a tampered body or wrong secret", () => {
    expect(verifyMetaSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
  });
});

describe("verifySvixSignature (Resend)", () => {
  const secret = "whsec_" + Buffer.from("super-secret-key-bytes").toString("base64");
  const id = "msg_123";
  const body = '{"type":"email.received"}';
  const nowMs = 1_800_000_000_000;
  const ts = String(Math.floor(nowMs / 1000));
  const good = signSvix(secret, id, ts, body);

  it("accepts a correctly signed, fresh payload", () => {
    expect(verifySvixSignature({ secret, id, timestamp: ts, signature: good, rawBody: body, nowMs })).toBe(true);
  });

  it("accepts when one of several space-separated signatures matches", () => {
    const sig = `v1,AAAA ${good}`;
    expect(verifySvixSignature({ secret, id, timestamp: ts, signature: sig, rawBody: body, nowMs })).toBe(true);
  });

  it("rejects a bad signature, tampered body, wrong id", () => {
    expect(verifySvixSignature({ secret, id, timestamp: ts, signature: "v1,AAAA", rawBody: body, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id, timestamp: ts, signature: good, rawBody: body + "x", nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id: "msg_other", timestamp: ts, signature: good, rawBody: body, nowMs })).toBe(false);
  });

  it("rejects stale and future timestamps (replay protection)", () => {
    const old = String(Number(ts) - 3600);
    const oldSig = signSvix(secret, id, old, body);
    expect(verifySvixSignature({ secret, id, timestamp: old, signature: oldSig, rawBody: body, nowMs })).toBe(false);
    const fut = String(Number(ts) + 3600);
    const futSig = signSvix(secret, id, fut, body);
    expect(verifySvixSignature({ secret, id, timestamp: fut, signature: futSig, rawBody: body, nowMs })).toBe(false);
  });

  it("fails closed when secret or any header is missing / non-numeric ts", () => {
    expect(verifySvixSignature({ secret: undefined, id, timestamp: ts, signature: good, rawBody: body, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id: null, timestamp: ts, signature: good, rawBody: body, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id, timestamp: null, signature: good, rawBody: body, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id, timestamp: "abc", signature: good, rawBody: body, nowMs })).toBe(false);
    expect(verifySvixSignature({ secret, id, timestamp: ts, signature: null, rawBody: body, nowMs })).toBe(false);
  });
});

/**
 * Stripe-style fail-closed: the Stripe route returns 503 without the secret and
 * 400 without a valid signature. Stripe's own `constructEvent` does the HMAC, so
 * here we pin the contract of the pieces we own (secret presence + header presence).
 */
describe("webhook fail-closed contract", () => {
  it("an unset secret never authorises, whatever the header says", () => {
    expect(verifyMetaSignature("{}", "sha256=" + "0".repeat(64), "")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });
});
