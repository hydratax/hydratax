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
  const xml = isChXmlGatewayConfigured();
  const oauth = isChOauthFilingConfigured();
  return {
    xmlGateway: xml,
    oauthFiling: oauth,
    canAttemptLiveSubmit: xml,
    notes: [
      xml
        ? "XML presenter credentials present — live CS01 submit path enabled."
        : "Add COMPANIES_HOUSE_PRESENTER_ID + COMPANIES_HOUSE_PRESENTER_AUTH_CODE to enable live XML submit.",
      oauth
        ? "OAuth client set (for future REST API Filing scopes)."
        : "REST API Filing for CS01 is not in the public CH reference yet — XML gateway is the current path.",
      "HydraTax never issues personal codes — directors obtain them via GOV.UK One Login or an ACSP.",
    ],
  };
}
