import { NextResponse } from "next/server";
import {
  clientIpFromHeaders,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

/**
 * Throttle the public /api/companies-house/* proxies (they spend our Companies
 * House API quota). Returns a 429 response when over the limit, else null.
 * In-memory per instance — see src/lib/rate-limit.ts for the caveat.
 */
export function limitCompaniesHouseRoute(
  req: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): NextResponse | null {
  const result = rateLimit({
    key: `ch:${scope}:${clientIpFromHeaders(req.headers)}`,
    limit,
    windowMs,
  });
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: { "Cache-Control": "no-store", ...rateLimitHeaders(result) },
    },
  );
}

/** Never leak upstream response text / internals to anonymous callers. */
export function publicChError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (/not found on Companies House/i.test(raw)) return raw.split(" (/")[0]!;
  if (/COMPANIES_HOUSE_API_KEY/i.test(raw)) return fallback;
  return fallback;
}
