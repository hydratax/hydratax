import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signMfaCookie, verifyMfaCookie } from "@/server/auth/mfa-cookie";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const T0 = 1_800_000_000_000;

describe("signed MFA cookie", () => {
  beforeEach(() => {
    vi.stubEnv("MFA_COOKIE_SECRET", "test-mfa-secret-0123456789abcdef");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips for the same user and kind", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    expect(verifyMfaCookie("ok", c, USER, T0 + 1000)).toBe(true);
  });

  it("rejects a raw user id (legacy unsigned format)", () => {
    expect(verifyMfaCookie("ok", USER, USER, T0)).toBe(false);
  });

  it("rejects empty / missing values", () => {
    expect(verifyMfaCookie("ok", "", USER, T0)).toBe(false);
    expect(verifyMfaCookie("ok", null, USER, T0)).toBe(false);
    expect(verifyMfaCookie("ok", undefined, USER, T0)).toBe(false);
  });

  it("rejects a cookie minted for a different user", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    expect(verifyMfaCookie("ok", c, OTHER, T0)).toBe(false);
  });

  it("rejects when the embedded user id is swapped (signature mismatch)", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    const forged = c.replace(USER, OTHER);
    expect(verifyMfaCookie("ok", forged, OTHER, T0)).toBe(false);
  });

  it("rejects an expired cookie", () => {
    const c = signMfaCookie("ok", USER, 60, T0);
    expect(verifyMfaCookie("ok", c, USER, T0 + 59_000)).toBe(true);
    expect(verifyMfaCookie("ok", c, USER, T0 + 60_000)).toBe(false);
    expect(verifyMfaCookie("ok", c, USER, T0 + 3_600_000)).toBe(false);
  });

  it("rejects a tampered expiry (extended lifetime)", () => {
    const c = signMfaCookie("ok", USER, 60, T0);
    const parts = c.split(".");
    parts[3] = String(Number(parts[3]) + 86_400);
    expect(verifyMfaCookie("ok", parts.join("."), USER, T0)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    const flipped = c.slice(0, -1) + (c.endsWith("A") ? "B" : "A");
    expect(verifyMfaCookie("ok", flipped, USER, T0)).toBe(false);
    expect(verifyMfaCookie("ok", `${c}x`, USER, T0)).toBe(false);
  });

  it("does not let a pending cookie satisfy the ok check (and vice versa)", () => {
    const pending = signMfaCookie("pending", USER, 600, T0);
    const ok = signMfaCookie("ok", USER, 600, T0);
    expect(verifyMfaCookie("ok", pending, USER, T0)).toBe(false);
    expect(verifyMfaCookie("pending", ok, USER, T0)).toBe(false);
    expect(verifyMfaCookie("pending", pending, USER, T0)).toBe(true);
  });

  it("rejects a cookie signed under a different secret", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    vi.stubEnv("MFA_COOKIE_SECRET", "a-completely-different-secret-value");
    expect(verifyMfaCookie("ok", c, USER, T0)).toBe(false);
  });

  it("rejects malformed shapes", () => {
    expect(verifyMfaCookie("ok", "a.b.c", USER, T0)).toBe(false);
    expect(verifyMfaCookie("ok", "v2.ok.x.1.sig", USER, T0)).toBe(false);
    expect(verifyMfaCookie("ok", `v1.ok.${USER}.abc.sig`, USER, T0)).toBe(false);
  });

  it("caps the lifetime it will sign", () => {
    const c = signMfaCookie("ok", USER, 10 * 365 * 24 * 3600, T0);
    const exp = Number(c.split(".")[3]);
    expect(exp - T0 / 1000).toBeLessThanOrEqual(8 * 24 * 3600);
  });

  it("refuses to sign for an id containing a dot", () => {
    expect(() => signMfaCookie("ok", "a.b", 60, T0)).toThrow();
  });

  it("fails closed in production when no secret is configured", () => {
    const c = signMfaCookie("ok", USER, 3600, T0);
    vi.stubEnv("MFA_COOKIE_SECRET", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(verifyMfaCookie("ok", c, USER, T0)).toBe(false);
    expect(() => signMfaCookie("ok", USER, 60, T0)).toThrow();
  });
});
