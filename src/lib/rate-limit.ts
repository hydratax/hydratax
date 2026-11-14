/**
 * In-memory sliding-window rate limiter.
 *
 * IMPORTANT: state lives in the memory of a single server instance. On
 * serverless hosts (Netlify Functions / Next on Netlify) every cold start and
 * every concurrent instance has its own map, so this is a best-effort brake
 * against casual abuse and accidental loops, NOT a hard guarantee. The durable
 * solution is an edge / shared-store limiter: Netlify Rate Limiting rules
 * (netlify.toml `[[edge_functions]]` / WAF), Cloudflare in front of the site,
 * or a shared store such as Upstash Redis (`@upstash/ratelimit`). Replace the
 * `store` below with such a backend if/when one is provisioned; the call sites
 * only depend on the `rateLimit()` signature.
 */

export type RateLimitInput = {
  /** Namespaced key, e.g. `checkout:${ip}`. */
  key: string;
  /** Max hits allowed inside the window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
  /** Test hook. */
  now?: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** ms until the oldest hit leaves the window (0 when ok). */
  retryAfterMs: number;
  limit: number;
};

const MAX_KEYS = 20_000;

type Store = Map<string, number[]>;

const globalForLimiter = globalThis as unknown as {
  __hydrataxRateLimit?: Store;
};

function store(): Store {
  if (!globalForLimiter.__hydrataxRateLimit) {
    globalForLimiter.__hydrataxRateLimit = new Map();
  }
  return globalForLimiter.__hydrataxRateLimit;
}

function prune(map: Store, now: number) {
  if (map.size < MAX_KEYS) return;
  for (const [k, hits] of map) {
    if (hits.length === 0 || hits[hits.length - 1]! <= now - 3_600_000) {
      map.delete(k);
    }
  }
  // Still too big (attack with many unique keys): drop oldest insertions.
  if (map.size >= MAX_KEYS) {
    const drop = Math.ceil(map.size / 4);
    let i = 0;
    for (const k of map.keys()) {
      map.delete(k);
      if (++i >= drop) break;
    }
  }
}

/** Record one hit for `key` and report whether it is within the limit. */
export function rateLimit(input: RateLimitInput): RateLimitResult {
  const { key, limit, windowMs } = input;
  const now = input.now ?? Date.now();
  const map = store();
  prune(map, now);

  const cutoff = now - windowMs;
  const hits = (map.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    map.set(key, hits);
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, hits[0]! + windowMs - now),
      limit,
    };
  }

  hits.push(now);
  map.set(key, hits);
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0, limit };
}

/** Test helper. */
export function resetRateLimits() {
  store().clear();
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;

function cleanIp(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (IPV4.test(v) || (v.includes(":") && IPV6.test(v))) return v;
  return null;
}

/**
 * Best-effort client IP. Prefers `x-nf-client-connection-ip` (set by Netlify's
 * edge, not client-controllable there), then the first `x-forwarded-for` hop.
 * Off-Netlify the XFF fallback is spoofable, so treat the result as an
 * abuse-throttle key only — never as an authorisation signal.
 */
export function clientIpFromHeaders(h: {
  get(name: string): string | null;
}): string {
  return (
    cleanIp(h.get("x-nf-client-connection-ip")) ??
    cleanIp(h.get("x-forwarded-for")?.split(",")[0]) ??
    cleanIp(h.get("x-real-ip")) ??
    "unknown"
  );
}

/** Client IP inside a Server Action / Server Component. */
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    return clientIpFromHeaders(await headers());
  } catch {
    return "unknown";
  }
}

/** Convenience: limit by client IP inside a Server Action. */
export async function rateLimitByIp(
  scope: string,
  opts: { limit: number; windowMs: number; extraKey?: string },
): Promise<RateLimitResult> {
  const ip = await getClientIp();
  return rateLimit({
    key: `${scope}:${ip}${opts.extraKey ? `:${opts.extraKey}` : ""}`,
    limit: opts.limit,
    windowMs: opts.windowMs,
  });
}

/** Standard 429 headers. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))),
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
  };
}
