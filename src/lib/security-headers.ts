/**
 * HTTP security headers for next.config.ts `headers()`.
 *
 * NOTE: imported from next.config.ts, so keep this file dependency-free and
 * use relative imports only (no `@/` alias).
 *
 * CSP is deliberately NOT nonce-based: a nonce needs a per-request value set
 * from the proxy and forces every page to render dynamically (it would break
 * static/ISR pages such as /company/[slug], /blog and the landing page). So
 * script-src keeps 'unsafe-inline' (Next's inline bootstrap + JSON-LD) and the
 * XSS mitigation relies on output escaping (safeJsonLd / escapeHtml) plus the
 * restrictive base-uri / object-src / frame-ancestors / form-action / connect
 * directives below. Tighten to a nonce/hash CSP if/when the site moves to
 * dynamic rendering.
 */

type Env = Record<string, string | undefined>;

export type HeaderEntry = { key: string; value: string };

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

function uniq(values: Array<string | null | undefined | false>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export function buildContentSecurityPolicy(env: Env = process.env): string {
  const isDev = env.NODE_ENV === "development";
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const r2Public = originOf(env.CLOUDFLARE_R2_PUBLIC_URL);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline': Next bootstrap + JSON-LD. unpkg.com: pdf.js worker for
    // browser-side bank statement extraction. 'wasm-unsafe-eval': pdf.js (JPX).
    "script-src": uniq([
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      "https://unpkg.com",
      isDev && "'unsafe-eval'",
    ]),
    // Google Fonts: printable invoice HTML links the stylesheet.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": uniq(["'self'", "data:", "blob:", supabase, r2Public]),
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": uniq([
      "'self'",
      supabase,
      supabaseWs,
      "https://unpkg.com",
      isDev && "ws://localhost:*",
    ]),
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:", "data:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Stripe Checkout + Google/Supabase OAuth are reached by redirect/link;
    // listed so a post-form redirect to them is not blocked.
    "form-action": [
      "'self'",
      "https://checkout.stripe.com",
      "https://accounts.google.com",
      ...(supabase ? [supabase] : []),
    ],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(" ")}`,
  );
  // upgrade-insecure-requests would break http://localhost in development.
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(env: Env = process.env): HeaderEntry[] {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      // Checkout is a redirect to checkout.stripe.com (no Payment Request API
      // / embedded Elements), so payment can be denied. Sign-in with Google is
      // a full-page redirect, so no popup relaxations are needed for COOP.
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(env) },
  ];
}

/**
 * Extra Server Action origins (deploy previews only). Never honoured on the
 * production deploy context.
 */
export function serverActionAllowedOrigins(env: Env = process.env): string[] {
  const base = ["hydratax.uk", "www.hydratax.uk"];
  if (env.CONTEXT === "production") return base;
  const extra = (env.SERVER_ACTIONS_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9.-]+(?::\d+)?$/i.test(s) && !s.includes("*"));
  return [...base, ...extra];
}
