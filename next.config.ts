import type { NextConfig } from "next";
import {
  securityHeaders,
  serverActionAllowedOrigins,
} from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
      {
        // Private / dynamic API responses must never be cached by shared
        // caches. (Route handlers may still set stricter values themselves.)
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Exact hosts only. Netlify may set x-forwarded-host to *.netlify.app
      // while Origin is hydratax.uk, which is why the canonical origins are
      // listed explicitly. Deploy previews: set SERVER_ACTIONS_EXTRA_ORIGINS
      // (comma-separated exact hosts) on non-production contexts only.
      allowedOrigins: serverActionAllowedOrigins(),
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
