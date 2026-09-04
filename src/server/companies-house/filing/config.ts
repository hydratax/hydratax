/** Companies House software / XML gateway + OAuth filing config */

/** Production software-filing gateway (fee-bearing live submissions). */
export const CH_XML_GATEWAY_LIVE_URL =
  "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

/**
 * Schema / sandpit test gateway (PackageReference 0012 + GatewayTest=1).
 * Do not send live fee filings here.
 */
export const CH_XML_GATEWAY_TEST_URL =
  "https://xmlgw-sandpit-staging.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

export type ChXmlGatewayHostKind = "live" | "test" | "unknown";

/** Classify a gateway URL as live, test/sandpit, or unknown. */
export function classifyChXmlGatewayUrl(url: string): ChXmlGatewayHostKind {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes("sandpit") ||
      host.includes("sandbox") ||
      host.includes("staging") ||
      host.startsWith("xmlgw-test")
    ) {
      return "test";
    }
    if (host === "xmlgw.companieshouse.gov.uk") return "live";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function parseChFilingEnvFlag() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "test").toLowerCase();
  const live = env === "live" || env === "production";
  return { live, label: live ? ("live" as const) : ("test" as const) };
}

/**
 * Resolve the XML gateway socket from COMPANIES_HOUSE_ENV.
 * Explicit COMPANIES_HOUSE_XML_GATEWAY_URL wins, but must match the env
 * (live credentials must not hit sandpit, and vice versa).
 */
export function resolveChXmlGatewayUrl(opts?: {
  live?: boolean;
  overrideUrl?: string | null;
}): { url: string; hostKind: ChXmlGatewayHostKind; override: boolean } {
  const live = opts?.live ?? parseChFilingEnvFlag().live;
  const override =
    opts?.overrideUrl !== undefined
      ? opts.overrideUrl?.trim() || null
      : process.env.COMPANIES_HOUSE_XML_GATEWAY_URL?.trim() || null;
  const expected = live ? CH_XML_GATEWAY_LIVE_URL : CH_XML_GATEWAY_TEST_URL;
  const url = override || expected;
  return {
    url,
    hostKind: classifyChXmlGatewayUrl(url),
    override: Boolean(override),
  };
}

/**
 * Detect live/test socket vs credential-env mismatches that commonly cause 502.
 */
export function getChXmlGatewayEnvMismatch(opts?: {
  live?: boolean;
  url?: string;
}): string | null {
  const live = opts?.live ?? parseChFilingEnvFlag().live;
  const url = opts?.url ?? resolveChXmlGatewayUrl({ live }).url;
  const kind = classifyChXmlGatewayUrl(url);
  if (live && kind === "test") {
    return `COMPANIES_HOUSE_ENV=live but XML gateway URL is a test/sandpit host (${url}). Use the live gateway or set COMPANIES_HOUSE_ENV=test.`;
  }
  if (!live && kind === "live") {
    return `COMPANIES_HOUSE_ENV=test but XML gateway URL is the live host (${url}). Use the sandpit gateway or set COMPANIES_HOUSE_ENV=live.`;
  }
  return null;
}

export function getChFilingEnv() {
  const { live, label } = parseChFilingEnvFlag();
  const presenterId =
    process.env.COMPANIES_HOUSE_PRESENTER_ID?.trim().toUpperCase() || null;
  const presenterAuthCode =
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE?.trim().toUpperCase() ||
    null;
  const creditAccountNumber =
    process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT?.trim().toUpperCase() || null;
  const packageReference =
    process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE?.trim().toUpperCase() ||
    null;
  const resolved = resolveChXmlGatewayUrl({ live });
  const gatewayMismatch = getChXmlGatewayEnvMismatch({
    live,
    url: resolved.url,
  });
  return {
    live,
    label,
    /** XML software filing gateway — always paired with `label` unless override mismatches. */
    xmlGatewayUrl: resolved.url,
    xmlGatewayHostKind: resolved.hostKind,
    xmlGatewayOverride: resolved.override,
    gatewayMismatch,
    /** GovTalk GatewayTest: 1 for test/sandpit, omit/0 for live. */
    gatewayTest: live ? false : true,
    presenterId,
    presenterAuthCode,
    /** Required for fee-bearing filings (CS01, IN01) — billed monthly by CH */
    creditAccountNumber,
    /**
     * Optional override for FormHeader PackageReference.
     * Live filings default to presenter ID when unset (not HMRC vendor IDs).
     * Test filings default to 0012.
     */
    packageReference,
    oauthClientId: process.env.COMPANIES_HOUSE_OAUTH_CLIENT_ID?.trim() || null,
    oauthClientSecret:
      process.env.COMPANIES_HOUSE_OAUTH_CLIENT_SECRET?.trim() || null,
  };
}

export function isChXmlGatewayConfigured() {
  const cfg = getChFilingEnv();
  return Boolean(cfg.presenterId && cfg.presenterAuthCode);
}

export function isChOauthFilingConfigured() {
  const cfg = getChFilingEnv();
  return Boolean(cfg.oauthClientId && cfg.oauthClientSecret);
}

export function describeChFilingReadiness() {
  const cfg = getChFilingEnv();
  const xml = Boolean(cfg.presenterId && cfg.presenterAuthCode);
  const oauth = Boolean(cfg.oauthClientId && cfg.oauthClientSecret);
  const credit = Boolean(cfg.creditAccountNumber);
  const presenterEmail = Boolean(
    process.env.COMPANIES_HOUSE_PRESENTER_EMAIL?.trim(),
  );
  return {
    xmlGateway: xml,
    oauthFiling: oauth,
    canAttemptLiveSubmit: xml && (!cfg.live || credit) && !cfg.gatewayMismatch,
    notes: [
      "HydraTax is the software presenter for all client filings (fixed Presenter ID / auth / credit account).",
      `XML gateway env=${cfg.label}; host=${cfg.xmlGatewayHostKind}; url=${cfg.xmlGatewayUrl}`,
      cfg.gatewayMismatch
        ? `BLOCKER: ${cfg.gatewayMismatch}`
        : "Presenter env and XML gateway host are aligned (live↔live or test↔sandpit).",
      xml
        ? "Fixed presenter ID and authentication code are configured."
        : "Add COMPANIES_HOUSE_PRESENTER_ID + COMPANIES_HOUSE_PRESENTER_AUTH_CODE.",
      credit
        ? "Fixed credit account configured for fee-bearing filings (CS01, IN01)."
        : cfg.live
          ? "Add COMPANIES_HOUSE_CREDIT_ACCOUNT for live fee filings."
          : "Optional: COMPANIES_HOUSE_CREDIT_ACCOUNT for fee-bearing filings.",
      presenterEmail
        ? "Presenter email set (must match the email registered with Companies House for this presenter)."
        : "Set COMPANIES_HOUSE_PRESENTER_EMAIL to the email registered with CH for this presenter.",
      "Per filing, clients supply company number, company auth code, and director/PSC personal codes.",
      oauth
        ? "OAuth client set (for future REST API Filing scopes)."
        : "REST API Filing is not the primary CS01 path — XML gateway is current.",
    ],
  };
}
