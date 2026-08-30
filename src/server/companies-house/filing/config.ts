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
      "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
    presenterId: process.env.COMPANIES_HOUSE_PRESENTER_ID?.trim() || null,
    presenterAuthCode:
      process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE?.trim() || null,
    /** Required for fee-bearing filings (CS01, IN01) — billed monthly by CH */
    creditAccountNumber:
      process.env.COMPANIES_HOUSE_CREDIT_ACCOUNT?.trim() || null,
    /**
     * Optional override for FormHeader PackageReference.
     * Live filings default to presenter ID when unset (not HMRC vendor IDs).
     */
    packageReference:
      process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE?.trim() || null,
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
  return {
    xmlGateway: xml,
    oauthFiling: oauth,
    canAttemptLiveSubmit: xml && (!cfg.live || credit),
    notes: [
      xml
        ? "Presenter ID and authentication code configured for software filing."
        : "Add COMPANIES_HOUSE_PRESENTER_ID + COMPANIES_HOUSE_PRESENTER_AUTH_CODE.",
      credit
        ? "Credit account configured — CS01 and other fee-bearing filings can bill to account."
        : cfg.live
          ? "Add COMPANIES_HOUSE_CREDIT_ACCOUNT for confirmation statements and other fee-bearing filings."
          : "Optional: COMPANIES_HOUSE_CREDIT_ACCOUNT for fee-bearing filings.",
      "Each company needs its own Companies House authentication code on file.",
      "HydraTax never issues personal codes — directors obtain them via GOV.UK One Login or an ACSP.",
      oauth
        ? "OAuth client set (for future REST API Filing scopes)."
        : "REST API Filing is not the primary CS01 path — XML gateway is current.",
    ],
  };
}
