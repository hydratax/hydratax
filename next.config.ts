import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Netlify may set x-forwarded-host to *.netlify.app while Origin is hydratax.uk.
      allowedOrigins: [
        "hydratax.uk",
        "www.hydratax.uk",
        "hydratax.netlify.app",
        "*.netlify.app",
      ],
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
