/** HydraTax desk session length + device-trust cookies. */

export const SESSION_EXPIRES_COOKIE = "ht_session_expires";
export const DEVICE_TRUSTED_COOKIE = "ht_device_trusted";

/**
 * Wall-clock ceiling while the browser stays open (untrusted / default).
 * Untrusted auth cookies are *session* cookies (no Max-Age) so closing the
 * browser ends the session even if this ceiling has not been reached.
 */
export const SESSION_TTL_UNTRUSTED_SEC = 10 * 60 * 60; // 10 hours

/** Trusted device desk session (persistent cookie). */
export const SESSION_TTL_TRUSTED_SEC = 7 * 24 * 60 * 60; // 7 days

export function sessionTtlSeconds(trusted: boolean): number {
  return trusted ? SESSION_TTL_TRUSTED_SEC : SESSION_TTL_UNTRUSTED_SEC;
}

export function sessionExpiresAtUnix(trusted: boolean, now = Date.now()): number {
  return Math.floor(now / 1000) + sessionTtlSeconds(trusted);
}

export function isSessionExpiryPast(
  expiresUnix: string | undefined | null,
  now = Date.now(),
): boolean {
  if (!expiresUnix) return false;
  const n = Number(expiresUnix);
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.floor(now / 1000) >= n;
}

export function isDeviceTrustedCookie(
  value: string | undefined | null,
): boolean {
  return value === "1";
}

/** Supabase Auth session token cookies (not the short-lived PKCE verifier). */
export function isSupabaseAuthSessionCookie(name: string): boolean {
  return name.startsWith("sb-") && !name.includes("code-verifier");
}

export type DeskCookieAttrs = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  /** Only set when the device is trusted — omit for browser-session cookies. */
  maxAge?: number;
};

/**
 * Cookie attributes for desk auth / policy cookies.
 * - Trusted → persistent Max-Age (7 days).
 * - Untrusted → session cookie (deleted when the browser closes).
 */
export function deskAuthCookieAttrs(trusted: boolean): DeskCookieAttrs {
  const base: DeskCookieAttrs = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  if (trusted) {
    return { ...base, maxAge: SESSION_TTL_TRUSTED_SEC };
  }
  return base;
}

type CookieOptionBag = {
  maxAge?: number;
  expires?: Date | string | number;
  [key: string]: unknown;
};

/**
 * Align Set-Cookie options with the trust choice.
 * Untrusted strips Max-Age/Expires so the browser treats it as a session cookie.
 */
export function withDeskPersistence<T extends CookieOptionBag>(
  options: T,
  trusted: boolean,
): T {
  if (trusted) {
    return { ...options, maxAge: SESSION_TTL_TRUSTED_SEC, expires: undefined };
  }
  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}

/**
 * After password/OAuth, send the user to the device-trust screen from the
 * **second** successful login onward. First signup/login keeps the provisional
 * untrusted session and goes straight to `next`.
 */
export function postLoginPath(
  nextPath: string,
  opts?: { suggest2fa?: boolean; askDeviceTrust?: boolean; loginCount?: number },
): string {
  const next = nextPath.startsWith("/") ? nextPath : "/dashboard";
  const ask =
    opts?.askDeviceTrust ??
    (typeof opts?.loginCount === "number" ? opts.loginCount >= 2 : true);
  if (!ask) return next;

  const qs = new URLSearchParams();
  qs.set("next", next);
  if (opts?.suggest2fa) qs.set("suggest2fa", "1");
  return `/secure-device?${qs.toString()}`;
}
