/** Redact secrets before logging raw Companies House gateway XML. */
export function redactChGatewayXml(xml: string) {
  return xml
    .replace(
      /<Value>([^<]*)<\/Value>/g,
      "<Value>[REDACTED_PRESENTER_AUTH]</Value>",
    )
    .replace(
      /<CompanyAuthenticationCode>([^<]*)<\/CompanyAuthenticationCode>/g,
      "<CompanyAuthenticationCode>[REDACTED]</CompanyAuthenticationCode>",
    )
    .replace(
      /<CompaniesHousePersonalCode>([^<]*)<\/CompaniesHousePersonalCode>/g,
      "<CompaniesHousePersonalCode>[REDACTED]</CompaniesHousePersonalCode>",
    );
}

/** Log assembled XML immediately before gateway transmission (debug only). */
export function logChGatewayXmlPayload(label: string, xml: string) {
  const enabled =
    process.env.COMPANIES_HOUSE_DEBUG_XML === "1" ||
    process.env.NODE_ENV === "development";
  if (!enabled) return;

  const redacted = redactChGatewayXml(xml);
  const bodyMatch = redacted.match(/<Body>([\s\S]*?)<\/Body>/i);
  const bodyEmpty =
    !bodyMatch ||
    bodyMatch[1]!.replace(/\s+/g, "").length === 0 ||
    !/<FormSubmission/i.test(bodyMatch[1]!);

  console.info(
    `[ch.gateway.xml] ${label}`,
    {
    bytes: xml.length,
    bodyPopulated: !bodyEmpty,
    hasFormSubmission: /<FormSubmission/i.test(xml),
    hasRegisteredEmail: /<RegisteredEmailAddress>/i.test(xml),
    hasLawfulPurpose: /<AcceptLawfulPurposeStatement>true<\/AcceptLawfulPurposeStatement>/i.test(
      xml,
    ),
    hasSicCodes: /<SICCodes>/i.test(xml),
    hasStatementOfCapital: /<StatementOfCapital>/i.test(xml),
    presenterMethodClear: /<Method>clear<\/Method>/i.test(xml),
    gatewayTest: /<GatewayTest>1<\/GatewayTest>/i.test(xml),
  },
  );
  console.info(`[ch.gateway.xml] ${label} payload:\n${redacted}`);
}
