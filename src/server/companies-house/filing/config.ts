/** Companies House software / XML gateway + OAuth filing config */

export function getChFilingEnv() {
  const env = (process.env.COMPANIES_HOUSE_ENV ?? "test").toLowerCase();
  const live = env === "live" || env === "production";
  return {
    live,
    label: live ? "live" : "test",
    /** XML software filing gateway */
    xmlGatewayUrl:
      process.env.COMPANIES_HOUSE_XML_GATEWAY_URL?.trim() ||
      (live
        ? "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway"
        : "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway"),
    presenterId: process.env.COMPANIES_HOUSE_PRESENTER_ID?.trim() || null,
    presenterAuthCode:
      process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE?.trim() || null,
    /** Optional CH credit account for statutory fees */
    creditAccountNumber:
      process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT?.trim() || null,
    /**
     * Software package reference allocated by Companies House.
     * Test gateway commonly uses 0012; live value is issued with your presenter account.
     */
    packageReference:
      process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE?.trim() ||
      (live ? null : "0012"),
    /** Future REST API Filing OAuth app */
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
  return {
    xmlGateway: xml,
    oauthFiling: oauth,
    canAttemptLiveSubmit: xml,
    notes: [
      xml
        ? "XML presenter credentials present — live CS01 / IN01 submit path enabled."
        : "Add COMPANIES_HOUSE_PRESENTER_ID + COMPANIES_HOUSE_PRESENTER_AUTH_CODE to enable live XML submit.",
      oauth
        ? "OAuth client set (for future REST API Filing scopes)."
        : "REST API Filing for CS01/IN01 is not the primary path yet — XML gateway is current.",
      "HydraTax never issues personal codes — directors obtain them via GOV.UK One Login or an ACSP.",
      cfg.packageReference
        ? `Package reference set (${cfg.packageReference}).`
        : "Set COMPANIES_HOUSE_PACKAGE_REFERENCE (issued with your presenter account) for live IN01.",
      cfg.creditAccountNumber
        ? "Credit account present — statutory incorporation fees can be billed to account."
        : "Optional: COMPANIES_HOUSE_CREDIT_ACCOUNT for fee-bearing filings.",
    ],
  };
}
