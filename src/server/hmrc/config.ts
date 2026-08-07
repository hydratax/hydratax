import { getEnv } from "@/lib/env";

const SANDBOX = {
  apiBase: "https://test-api.service.hmrc.gov.uk",
  authBase: "https://test-api.service.hmrc.gov.uk/oauth/authorize",
  tokenUrl: "https://test-api.service.hmrc.gov.uk/oauth/token",
  ctSubmissionUrl: "https://test-transaction-engine.tax.service.gov.uk/submission",
  rtiSubmissionUrl: "https://test-api.service.hmrc.gov.uk",
} as const;

const PRODUCTION = {
  apiBase: "https://api.service.hmrc.gov.uk",
  authBase: "https://www.tax.service.gov.uk/oauth/authorize",
  tokenUrl: "https://api.service.hmrc.gov.uk/oauth/token",
  ctSubmissionUrl: "https://transaction-engine.tax.service.gov.uk/submission",
  rtiSubmissionUrl: "https://api.service.hmrc.gov.uk",
} as const;

export type HmrcRuntimeConfig = {
  env: "sandbox" | "production";
  apiBase: string;
  authBase: string;
  tokenUrl: string;
  ctSubmissionUrl: string;
  rtiSubmissionUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  vendorPublicIp: string;
  vendorLicenseIds: string;
  vendorVersion: string;
};

export function getHmrcConfig(): HmrcRuntimeConfig {
  const env = getEnv();
  const endpoints = env.HMRC_ENV === "production" ? PRODUCTION : SANDBOX;

  if (env.HMRC_ENV === "production") {
    assertNoSandboxBleed(env.HMRC_CLIENT_ID, env.HMRC_CLIENT_SECRET);
    if (endpoints.apiBase.includes("test-api")) {
      throw new Error("Production HMRC_ENV resolved sandbox API base");
    }
  }

  return {
    env: env.HMRC_ENV,
    ...endpoints,
    clientId: env.HMRC_CLIENT_ID ?? "",
    clientSecret: env.HMRC_CLIENT_SECRET ?? "",
    redirectUri: `${env.NEXT_PUBLIC_APP_URL}/api/hmrc/callback`,
    vendorPublicIp: env.HMRC_VENDOR_PUBLIC_IP ?? "0.0.0.0",
    vendorLicenseIds: env.HMRC_VENDOR_LICENSE_IDS,
    vendorVersion: env.HMRC_VENDOR_VERSION,
  };
}

function assertNoSandboxBleed(
  clientId: string | undefined,
  clientSecret: string | undefined,
) {
  const haystack = `${clientId ?? ""} ${clientSecret ?? ""}`.toLowerCase();
  if (
    haystack.includes("sandbox") ||
    haystack.includes("test-only") ||
    haystack.includes("mock")
  ) {
    throw new Error(
      "Sandbox or mock HMRC credentials detected while HMRC_ENV=production",
    );
  }
}

export const HMRC_SCOPES = {
  vat: "read:vat write:vat",
  itsa: "read:self-assessment write:self-assessment",
  combined:
    "read:vat write:vat read:self-assessment write:self-assessment",
} as const;
