import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  securityHeaders,
  serverActionAllowedOrigins,
} from "./security-headers";

describe("securityHeaders", () => {
  const map = new Map(securityHeaders({ NODE_ENV: "production" }).map((h) => [h.key, h.value]));

  it("sets the baseline hardening headers", () => {
    expect(map.get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(map.get("Permissions-Policy")).toContain("camera=()");
    expect(map.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("locks down framing/objects/base and has no wildcard script source", () => {
    const csp = buildContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("https://abc.supabase.co");
    expect(csp).toContain("wss://abc.supabase.co");
    expect(csp).not.toMatch(/script-src[^;]*\*/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("only allows unsafe-eval / http in development", () => {
    const dev = buildContentSecurityPolicy({ NODE_ENV: "development" });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("serverActionAllowedOrigins", () => {
  it("never contains a wildcard and is canonical-only in production", () => {
    const prod = serverActionAllowedOrigins({
      CONTEXT: "production",
      SERVER_ACTIONS_EXTRA_ORIGINS: "evil.example,*.netlify.app",
    });
    expect(prod).toEqual(["hydratax.uk", "www.hydratax.uk"]);
  });

  it("allows exact extra hosts in previews but drops wildcards/garbage", () => {
    const preview = serverActionAllowedOrigins({
      CONTEXT: "deploy-preview",
      SERVER_ACTIONS_EXTRA_ORIGINS: "deploy-preview-1--x.netlify.app, *.netlify.app, bad host",
    });
    expect(preview).toContain("deploy-preview-1--x.netlify.app");
    expect(preview.some((o) => o.includes("*"))).toBe(false);
    expect(preview).not.toContain("bad host");
  });
});
