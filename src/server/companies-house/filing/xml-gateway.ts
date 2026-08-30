import type { ParsedCsFilingInput } from "./personal-codes";
import { getChFilingEnv } from "./config";
import {
  buildPresenterAuthenticationXml,
  resolveChPackageReference,
  sixCharSubmissionNumber,
  xmlEscape,
} from "./gateway-auth";

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
 * Builds a CS01 XML payload for the Companies House software filing gateway.
 *
 * Required per GOV.UK software filing guidance:
 * - Presenter ID + presenter authentication code (authorises fee to credit account)
 * - Company authentication code (per company)
 * - Director personal codes when identity verification is required
 */
export function buildConfirmationStatementXml(input: ParsedCsFilingInput) {
  getChFilingEnv(); // validate env readable
  const packageRef = resolveChPackageReference();
  const submissionNumber = sixCharSubmissionNumber();
  const dateSigned = new Date().toISOString().slice(0, 10);
  const reviewDate = input.confirmationDate;
  const needsVerification = input.directors.some((d) => d.personalCode?.trim());

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

  const formBody = needsVerification
    ? `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationAndVerificationStatement-v1-0.xsd">
          <TradingOnMarket>false</TradingOnMarket>
          <DTR5Applies>false</DTR5Applies>
          <PSCExemptAsTradingOnRegulatedMarket>false</PSCExemptAsTradingOnRegulatedMarket>
          <PSCExemptAsSharesAdmittedOnMarket>false</PSCExemptAsSharesAdmittedOnMarket>
          <PSCExemptAsTradingOnUKRegulatedMarket>false</PSCExemptAsTradingOnUKRegulatedMarket>
          <ReviewDate>${xmlEscape(reviewDate)}</ReviewDate>
          ${emailXml}
          <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
          <StateConfirmation>true</StateConfirmation>
          <VerificationStatement>${directorsXml}
          </VerificationStatement>
        </ConfirmationAndVerificationStatement>`
    : `<ConfirmationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationStatement-v1-3.xsd">
          <ReviewDate>${xmlEscape(reviewDate)}</ReviewDate>
          ${emailXml}
          <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
          <StateConfirmation>true</StateConfirmation>
        </ConfirmationStatement>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>ConfirmationStatement</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      ${buildPresenterAuthenticationXml()}
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body>
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:bs="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyNumber>${xmlEscape(input.companyNumber.replace(/\D/g, ""))}</CompanyNumber>
        <CompanyType>EW</CompanyType>
        <CompanyName>${xmlEscape(input.companyName)}</CompanyName>
        <CompanyAuthenticationCode>${xmlEscape(input.companyAuthCode.toUpperCase())}</CompanyAuthenticationCode>
        <PackageReference>${xmlEscape(packageRef)}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>ConfirmationStatement</FormIdentifier>
        <SubmissionNumber>${xmlEscape(submissionNumber)}</SubmissionNumber>
      </FormHeader>
      <DateSigned>${dateSigned}</DateSigned>
      <Form>
        ${formBody}
      </Form>
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

export async function submitConfirmationStatementXml(
  xml: string,
): Promise<XmlGatewayResponse> {
  return postXmlToGateway(xml);
}

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
        "Companies House presenter credentials are not configured. Contact support.",
    };
  }
  if (cfg.live && !cfg.creditAccountNumber) {
    return {
      ok: false,
      error:
        "Companies House credit account is required for fee-bearing filings (CS01). Contact support.",
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
        error: "Companies House could not accept the filing. Contact support.",
        raw: raw.slice(0, 2000),
      };
    }
    const fatal = raw.match(
      /<Number>(\d+)<\/Number>[\s\S]*?<Type>fatal<\/Type>/i,
    );
    const errorText = raw.match(/<Text>([^<]+)<\/Text>/i);
    if (fatal || /Authorisation Failure|fatal/i.test(raw)) {
      const chMessage = errorText?.[1]?.trim();
      return {
        ok: false,
        error: mapChError(chMessage),
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
  } catch {
    return {
      ok: false,
      error: "Could not reach Companies House. Try again or contact support.",
    };
  }
}

function mapChError(message?: string) {
  if (!message) {
    return "Companies House rejected the confirmation statement.";
  }
  if (/Authorisation Failure/i.test(message)) {
    return "Companies House authorisation failed — check the company authentication code and that presenter credentials are active.";
  }
  return message;
}
