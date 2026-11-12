/** HydraTax desk session length + device-trust cookies. */

export const SESSION_EXPIRES_COOKIE = "ht_session_expires";
export const DEVICE_TRUSTED_COOKIE = "ht_device_trusted";

/** Untrusted / default desk session. */
export const SESSION_TTL_UNTRUSTED_SEC = 10 * 60 * 60; // 10 hours

/** Trusted device desk session. */
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

/**
 * After password/OAuth, send the user to the device-trust screen from the
 * **second** successful login onward. First signup/login keeps the provisional
 * 10-hour untrusted session and goes straight to `next`.
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
