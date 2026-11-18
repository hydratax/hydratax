import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_TRUSTED_SEC,
  deskAuthCookieAttrs,
  isDeviceTrustedCookie,
  isSupabaseAuthSessionCookie,
  withDeskPersistence,
} from "@/lib/session-policy";

describe("session-policy cookie persistence", () => {
  it("treats only explicit '1' as trusted", () => {
    expect(isDeviceTrustedCookie("1")).toBe(true);
    expect(isDeviceTrustedCookie("0")).toBe(false);
    expect(isDeviceTrustedCookie(undefined)).toBe(false);
    expect(isDeviceTrustedCookie("")).toBe(false);
  });

  it("identifies Supabase auth session cookies but not PKCE verifier", () => {
    expect(
      isSupabaseAuthSessionCookie("sb-abc-auth-token"),
    ).toBe(true);
    expect(
      isSupabaseAuthSessionCookie("sb-abc-auth-token.0"),
    ).toBe(true);
    expect(
      isSupabaseAuthSessionCookie("sb-abc-auth-token-code-verifier"),
    ).toBe(false);
  });

  it("omits Max-Age for untrusted desk cookies (browser session)", () => {
    const attrs = deskAuthCookieAttrs(false);
    expect(attrs.maxAge).toBeUndefined();
    expect(attrs.path).toBe("/");
    expect(attrs.httpOnly).toBe(true);
  });

  it("sets 7-day Max-Age when trusted", () => {
    const attrs = deskAuthCookieAttrs(true);
    expect(attrs.maxAge).toBe(SESSION_TTL_TRUSTED_SEC);
  });

  it("strips persistence from Supabase options when untrusted", () => {
    const next = withDeskPersistence(
      { path: "/", maxAge: 60 * 60 * 24 * 30, expires: new Date("2099-01-01") },
      false,
    );
    expect(next.maxAge).toBeUndefined();
    expect(next.expires).toBeUndefined();
    expect(next.path).toBe("/");
  });

  it("clamps Max-Age to trusted TTL when trusted", () => {
    const next = withDeskPersistence({ path: "/", maxAge: 999_999_999 }, true);
    expect(next.maxAge).toBe(SESSION_TTL_TRUSTED_SEC);
  });
});
