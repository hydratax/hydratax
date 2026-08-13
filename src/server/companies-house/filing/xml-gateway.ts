import type { ParsedCsFilingInput } from "./personal-codes";
import { getChFilingEnv } from "./config";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitName(fullName: string) {
  const cleaned = fullName.replace(/,/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { forename: parts[0], surname: parts[0] };
  return {
    forename: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1]!,
  };
}

/**
 * Builds a CS01 XML payload for the Companies House software gateway (TIS).
 * Schema evolves with CH releases — treat as the integration seam for live submit.
 */
export function buildConfirmationStatementXml(input: ParsedCsFilingInput) {
  const cfg = getChFilingEnv();
  const presenterId = cfg.presenterId ?? "PRESENTER_ID";
  const presenterAuth = cfg.presenterAuthCode ?? "PRESENTER_AUTH";

  const directorsXml = input.directors
    .map((d) => {
      const names = splitName(d.fullName);
      const forename = d.forename || names.forename;
      const surname = d.surname || names.surname;
      const title = d.title ? `<Title>${xmlEscape(d.title)}</Title>` : "";
      const mismatch = d.nameMismatchReason
        ? `<NameMismatchReason>${xmlEscape(d.nameMismatchReason)}</NameMismatchReason>`
        : "";
      return `
            <Director>
              <Person>
                ${title}
                <Forename>${xmlEscape(forename)}</Forename>
                <Surname>${xmlEscape(surname)}</Surname>
                <DOB>${xmlEscape(d.dateOfBirth)}</DOB>
                <VerificationDetails>
                  <CompaniesHousePersonalCode>${xmlEscape(d.personalCode)}</CompaniesHousePersonalCode>
                  <VerificationStatements>
                    <VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>
                  </VerificationStatements>
                  ${mismatch}
                </VerificationDetails>
              </Person>
            </Director>`;
    })
    .join("");

  const emailXml = input.registeredEmail
    ? `<RegisteredEmailAddress>${xmlEscape(input.registeredEmail)}</RegisteredEmailAddress>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompanyAuthorisation</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${xmlEscape(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${xmlEscape(presenterAuth)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body>
    <FormSubmission>
      <FormHeader>
        <CompanyNumber>${xmlEscape(input.companyNumber)}</CompanyNumber>
        <CompanyName>${xmlEscape(input.companyName)}</CompanyName>
        <CompanyAuthenticationCode>${xmlEscape(input.companyAuthCode)}</CompanyAuthenticationCode>
        <PackageReference>HydraTax-CS01</PackageReference>
        <FormIdentifier>ConfirmationStatement</FormIdentifier>
        <SubmissionNumber>${xmlEscape(`${input.companyNumber}-${input.confirmationDate}`)}</SubmissionNumber>
      </FormHeader>
      <ConfirmationStatement>
        <ConfirmationDate>${xmlEscape(input.confirmationDate)}</ConfirmationDate>
        <StatementOfLawfulPurpose>true</StatementOfLawfulPurpose>
        ${emailXml}
        <ConfirmationAndVerificationStatement>
          <VerificationStatement>
            ${directorsXml}
          </VerificationStatement>
        </ConfirmationAndVerificationStatement>
      </ConfirmationStatement>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

export type XmlGatewayResponse = {
  ok: boolean;
  submissionNumber?: string;
  raw?: string;
  error?: string;
};

/**
 * Posts CS01 XML to the Companies House gateway.
 * Requires live presenter credentials — returns a clear error when missing.
 */
export async function submitConfirmationStatementXml(
  xml: string,
): Promise<XmlGatewayResponse> {
  return postXmlToGateway(xml);
}

/**
 * Posts IN01 (CompanyIncorporation) XML to the Companies House gateway.
 */
export async function submitCompanyIncorporationXml(
  xml: string,
): Promise<XmlGatewayResponse> {
  return postXmlToGateway(xml);
}

async function postXmlToGateway(xml: string): Promise<XmlGatewayResponse> {
  const cfg = getChFilingEnv();
  if (!cfg.presenterId || !cfg.presenterAuthCode) {
    return {
      ok: false,
      error:
        "XML gateway not configured. Set COMPANIES_HOUSE_PRESENTER_ID and COMPANIES_HOUSE_PRESENTER_AUTH_CODE.",
    };
  }

  try {
    const res = await fetch(cfg.xmlGatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/xml",
      },
      body: xml,
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Companies House gateway ${res.status}`,
        raw: raw.slice(0, 2000),
      };
    }
    const fatal = raw.match(
      /<Number>(\d+)<\/Number>[\s\S]*?<Type>fatal<\/Type>/i,
    );
    const errorText = raw.match(/<Text>([^<]+)<\/Text>/i);
    if (fatal || /Authorisation Failure|fatal/i.test(raw)) {
      return {
        ok: false,
        error:
          errorText?.[1]?.trim() ||
          `Companies House rejected the package${fatal ? ` (${fatal[1]})` : ""}`,
        raw: raw.slice(0, 2000),
      };
    }
    const submissionMatch = raw.match(
      /<SubmissionNumber>([^<]+)<\/SubmissionNumber>/i,
    );
    return {
      ok: true,
      submissionNumber: submissionMatch?.[1],
      raw: raw.slice(0, 2000),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gateway request failed",
    };
  }
}
