import { beforeEach, describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  rateLimit,
  rateLimitHeaders,
  resetRateLimits,
} from "./rate-limit";

const h = (m: Record<string, string>) => ({
  get: (n: string) => m[n.toLowerCase()] ?? null,
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks with retryAfterMs", () => {
    const base = 1_000_000;
    for (let i = 0; i < 3; i++) {
      const r = rateLimit({ key: "k", limit: 3, windowMs: 10_000, now: base + i });
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const blocked = rateLimit({ key: "k", limit: 3, windowMs: 10_000, now: base + 100 });
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(10_000 - 100);
  });

  it("recovers once hits leave the window", () => {
    const base = 5_000_000;
    rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base });
    expect(rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base + 500 }).ok).toBe(false);
    expect(rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base + 1001 }).ok).toBe(true);
  });

  it("keeps keys independent", () => {
    expect(rateLimit({ key: "a", limit: 1, windowMs: 1000, now: 1 }).ok).toBe(true);
    expect(rateLimit({ key: "b", limit: 1, windowMs: 1000, now: 1 }).ok).toBe(true);
    expect(rateLimit({ key: "a", limit: 1, windowMs: 1000, now: 2 }).ok).toBe(false);
  });

  it("does not count blocked attempts toward extending the lock", () => {
    const base = 9_000_000;
    rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base });
    for (let i = 1; i < 20; i++) rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base + i });
    expect(rateLimit({ key: "k", limit: 1, windowMs: 1000, now: base + 1001 }).ok).toBe(true);
  });

  it("resetRateLimits clears state", () => {
    rateLimit({ key: "k", limit: 1, windowMs: 60_000 });
    expect(rateLimit({ key: "k", limit: 1, windowMs: 60_000 }).ok).toBe(false);
    resetRateLimits();
    expect(rateLimit({ key: "k", limit: 1, windowMs: 60_000 }).ok).toBe(true);
  });

  it("rateLimitHeaders reports Retry-After in whole seconds (min 1)", () => {
    const r = { ok: false, remaining: 0, retryAfterMs: 1500, limit: 5 };
    expect(rateLimitHeaders(r)["Retry-After"]).toBe("2");
    expect(rateLimitHeaders({ ...r, retryAfterMs: 0 })["Retry-After"]).toBe("1");
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the Netlify edge IP over x-forwarded-for", () => {
    expect(
      clientIpFromHeaders(h({ "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" })),
    ).toBe("203.0.113.9");
  });
  it("falls back to the first XFF hop and ignores junk", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe("198.51.100.7");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(clientIpFromHeaders(h({}))).toBe("unknown");
  });
});
