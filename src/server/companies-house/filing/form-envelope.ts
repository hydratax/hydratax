import { getChFilingEnv } from "./config";
import {
  buildPresenterAuthenticationXml,
  resolveChPackageReference,
  sixCharSubmissionNumber,
  xmlEscape,
} from "./gateway-auth";
import {
  getHydraPresenterConfig,
  resolveChCompanyType,
} from "./presenter";

export type FormDocumentAttachment = {
  filename: string;
  dataBase64: string;
  category?: string;
};

export type FormEnvelopeInput = {
  messageClass: string;
  formIdentifier: string;
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  formBody: string;
  documents?: FormDocumentAttachment[];
  /** Override auto jurisdiction from company number (EW / SC / NI / R). */
  companyType?: string;
};

/** Wraps a Companies House form body in the standard GovTalk / FormSubmission envelope. */
export function buildFormSubmissionEnvelope(input: FormEnvelopeInput): string {
  const presenter = getHydraPresenterConfig();
  const packageRef = resolveChPackageReference();
  const submissionNumber = sixCharSubmissionNumber();
  const dateSigned = new Date().toISOString().slice(0, 10);
  const rawNumber = input.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const companyNumber = /^\d+$/.test(rawNumber)
    ? rawNumber.padStart(8, "0")
    : rawNumber;
  const companyType =
    input.companyType?.trim().toUpperCase() ||
    resolveChCompanyType(companyNumber);

  const contactXml =
    presenter.contactName && presenter.contactNumber
      ? `
        <ContactName>${xmlEscape(presenter.contactName.slice(0, 50))}</ContactName>
        <ContactNumber>${xmlEscape(presenter.contactNumber.slice(0, 25))}</ContactNumber>`
      : "";

  const documentsXml = (input.documents ?? [])
    .map(
      (doc) => `
      <Document>
        <Data>${doc.dataBase64}</Data>
        <Filename>${xmlEscape(doc.filename.slice(0, 32))}</Filename>${
          doc.category
            ? `\n        <Category>${xmlEscape(doc.category)}</Category>`
            : ""
        }
      </Document>`,
    )
    .join("");

  const cfg = getChFilingEnv();
  const gatewayTestXml = cfg.gatewayTest
    ? `
      <GatewayTest>1</GatewayTest>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${xmlEscape(input.messageClass)}</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>${gatewayTestXml}
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
        <CompanyNumber>${xmlEscape(companyNumber)}</CompanyNumber>
        <CompanyType>${xmlEscape(companyType)}</CompanyType>
        <CompanyName>${xmlEscape(input.companyName)}</CompanyName>
        <CompanyAuthenticationCode>${xmlEscape(input.companyAuthCode.toUpperCase())}</CompanyAuthenticationCode>
        <PackageReference>${xmlEscape(packageRef)}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>${xmlEscape(input.formIdentifier)}</FormIdentifier>
        <SubmissionNumber>${xmlEscape(submissionNumber)}</SubmissionNumber>${contactXml}
      </FormHeader>
      <DateSigned>${dateSigned}</DateSigned>
      <Form>
        ${input.formBody}
      </Form>${documentsXml}
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

export function splitPersonName(fullName: string) {
  const cleaned = fullName.replace(/,/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { forename: parts[0]!, surname: parts[0]! };
  return {
    forename: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1]!,
  };
}

export function parseFreeformAddress(raw: string) {
  const lines = raw
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    premise: lines[0] ?? "Address",
    street: lines[1] ?? lines[0] ?? "Street",
    postTown: lines.length > 3 ? lines[lines.length - 3]! : lines[2] ?? "Town",
    postcode: lines[lines.length - 1]?.match(/[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}/i)
      ? lines[lines.length - 1]!.toUpperCase()
      : "SW1A 1AA",
    country: "GBR",
  };
}

export type StructuredAddressInput = {
  premise: string;
  street: string;
  postTown: string;
  county?: string;
  postcode: string;
  country?: string;
};

export function parseStructuredAddressJson(raw: string): StructuredAddressInput | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StructuredAddressInput>;
    if (!parsed.premise || !parsed.street || !parsed.postTown || !parsed.postcode) {
      return null;
    }
    return {
      premise: String(parsed.premise).trim(),
      street: String(parsed.street).trim(),
      postTown: String(parsed.postTown).trim(),
      county: parsed.county ? String(parsed.county).trim() : undefined,
      postcode: String(parsed.postcode).trim().toUpperCase(),
      country: parsed.country ? String(parsed.country).trim() : "GBR",
    };
  } catch {
    return null;
  }
}

export function structuredAddressBlock(addr: StructuredAddressInput, indent: string) {
  const countyLine = addr.county
    ? `\n${indent}<County>${xmlEscape(addr.county)}</County>`
    : "";
  return `${indent}<Premise>${xmlEscape(addr.premise)}</Premise>
${indent}<Street>${xmlEscape(addr.street)}</Street>
${indent}<PostTown>${xmlEscape(addr.postTown)}</PostTown>${countyLine}
${indent}<Country>${xmlEscape(addr.country ?? "GBR")}</Country>
${indent}<Postcode>${xmlEscape(addr.postcode)}</Postcode>`;
}
