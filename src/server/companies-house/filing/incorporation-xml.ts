import { randomBytes } from "crypto";
import {
  ownershipNatures,
  type ParsedIncorporationInput,
  type UkAddress,
} from "./incorporation-schema";
import { getChFilingEnv } from "./config";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressXml(addr: UkAddress, indent = "        ") {
  const thoroughfare = addr.thoroughfare?.trim()
    ? `\n${indent}  <Thoroughfare>${xmlEscape(addr.thoroughfare.trim())}</Thoroughfare>`
    : "";
  const county = addr.county?.trim()
    ? `\n${indent}  <County>${xmlEscape(addr.county.trim())}</County>`
    : "";
  return `${indent}<Premise>${xmlEscape(addr.premise)}</Premise>
${indent}<Street>${xmlEscape(addr.street)}</Street>${thoroughfare}
${indent}<PostTown>${xmlEscape(addr.postTown)}</PostTown>${county}
${indent}<Country>${xmlEscape(addr.country)}</Country>
${indent}<Postcode>${xmlEscape(addr.postcode.toUpperCase())}</Postcode>`;
}

function verificationXml(personalCode: string, indent = "            ") {
  return `${indent}<VerificationDetails>
${indent}  <CompaniesHousePersonalCode>${xmlEscape(personalCode)}</CompaniesHousePersonalCode>
${indent}  <VerificationStatements>
${indent}    <VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>
${indent}  </VerificationStatements>
${indent}</VerificationDetails>`;
}

function sixCharSubmissionNumber() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/**
 * Builds IN01 (CompanyIncorporation v3-8) GovTalk XML for the software gateway.
 * Uses model articles + data memorandum (no MEMARTS PDF attachment).
 */
export function buildCompanyIncorporationXml(input: ParsedIncorporationInput) {
  const cfg = getChFilingEnv();
  const presenterId = cfg.presenterId ?? "PRESENTER_ID";
  const presenterAuth = cfg.presenterAuthCode ?? "PRESENTER_AUTH";
  const packageRef = cfg.packageReference ?? "0012";
  const submissionNumber = sixCharSubmissionNumber();
  const today = new Date().toISOString().slice(0, 10);

  const totalShares = input.subscribers.reduce((s, x) => s + x.shares, 0);
  const nominal = input.nominalValue;
  const paid =
    input.amountPaidPerShare ?? Math.min(nominal, Math.max(0, nominal));
  const unpaid = Math.max(0, Number((nominal - paid).toFixed(4)));
  const aggregateNominal = Number((totalShares * nominal).toFixed(2));
  const totalUnpaid = Number((totalShares * unpaid).toFixed(2));

  const appointmentsXml = input.directors
    .map((d) => {
      const service = d.serviceAddressSameAsRo
        ? `              <SameAsRegisteredOffice>true</SameAsRegisteredOffice>`
        : `              <Address>
${addressXml(d.serviceAddress!, "                ")}
              </Address>`;
      return `
      <Appointment>
        <ConsentToAct>true</ConsentToAct>
        <Director>
          <Person>
            <Forename>${xmlEscape(d.forename)}</Forename>
            <Surname>${xmlEscape(d.surname)}</Surname>
            <ServiceAddress>
${service}
            </ServiceAddress>
            <DOB>${xmlEscape(d.dateOfBirth)}</DOB>
            <Nationality>${xmlEscape(d.nationality)}</Nationality>
            <CountryOfResidence>${xmlEscape(d.countryOfResidence)}</CountryOfResidence>
            <ResidentialAddress>
              <Address>
${addressXml(d.residentialAddress, "                ")}
              </Address>
            </ResidentialAddress>
${verificationXml(d.personalCode, "            ")}
          </Person>
        </Director>
      </Appointment>`;
    })
    .join("");

  const pscCandidates = input.subscribers
    .map((s) => {
      const pct = totalShares > 0 ? (s.shares / totalShares) * 100 : 0;
      const natures = ownershipNatures(pct);
      return { s, pct, natures };
    })
    .filter((x) => x.natures.length > 0 && x.s.isPsc !== false);

  let pscsXml: string;
  if (pscCandidates.length === 0) {
    pscsXml = `
      <PSCs>
        <NoPSCStatement>NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL</NoPSCStatement>
      </PSCs>`;
  } else {
    const rows = pscCandidates
      .map(({ s, natures }) => {
        const dob = s.dateOfBirth?.trim() || "1900-01-01";
        const nationality = s.nationality?.trim() || "British";
        const residence = s.countryOfResidence?.trim() || "United Kingdom";
        const residential = s.residentialAddress ?? s.address;
        const code = s.personalCode?.trim();
        const verification = code
          ? `\n${verificationXml(code, "              ")}`
          : "";
        return `
        <PSC>
          <PSCNotification>
            <Individual>
              <Forename>${xmlEscape(s.forename)}</Forename>
              <Surname>${xmlEscape(s.surname)}</Surname>
              <ServiceAddress>
                <SameAsRegisteredOffice>true</SameAsRegisteredOffice>
              </ServiceAddress>
              <DOB>${xmlEscape(dob)}</DOB>
              <Nationality>${xmlEscape(nationality)}</Nationality>
              <CountryOfResidence>${xmlEscape(residence)}</CountryOfResidence>
              <ResidentialAddress>
                <Address>
${addressXml(residential, "                  ")}
                </Address>
              </ResidentialAddress>${verification}
              <ConsentStatement>true</ConsentStatement>
            </Individual>
            <NatureOfControls>
              ${natures
                .map(
                  (n) =>
                    `<NatureOfControl>${xmlEscape(n)}</NatureOfControl>`,
                )
                .join("\n              ")}
            </NatureOfControls>
          </PSCNotification>
        </PSC>`;
      })
      .join("");
    pscsXml = `
      <PSCs>${rows}
      </PSCs>`;
  }

  const subscribersXml = input.subscribers
    .map(
      (s) => `
      <Subscribers>
        <Person>
          <Forename>${xmlEscape(s.forename)}</Forename>
          <Surname>${xmlEscape(s.surname)}</Surname>
        </Person>
        <Address>
${addressXml(s.address, "          ")}
        </Address>
        <Authentication>
          <MemorandumPersonalAuthentication>SUBSCRIBER_AGREES_NAME_USED_TO_AUTHENTICATE</MemorandumPersonalAuthentication>
        </Authentication>
        <Shares>
          <ShareClass>${xmlEscape(input.shareClass)}</ShareClass>
          <NumShares>${s.shares}</NumShares>
          <AmountPaidDuePerShare>${paid}</AmountPaidDuePerShare>
          <AmountUnpaidPerShare>${unpaid}</AmountUnpaidPerShare>
          <ShareCurrency>${input.shareCurrency}</ShareCurrency>
          <ShareValue>${nominal}</ShareValue>
        </Shares>
        <MemorandumStatement>Each subscriber to this memorandum of association wishes to form a company under the Companies Act 2006 and agrees to become a member of the company and to take at least one share.</MemorandumStatement>
      </Subscribers>`,
    )
    .join("");

  const sicXml = input.sicCodes
    .map((c) => `        <SICCode>${xmlEscape(c)}</SICCode>`)
    .join("\n");

  const agentPremise = process.env.COMPANIES_HOUSE_AGENT_PREMISE?.trim() || "1";
  const agentStreet =
    process.env.COMPANIES_HOUSE_AGENT_STREET?.trim() || "Software Filing";
  const agentTown =
    process.env.COMPANIES_HOUSE_AGENT_TOWN?.trim() || "London";
  const agentPostcode =
    process.env.COMPANIES_HOUSE_AGENT_POSTCODE?.trim() || "EC1A 1BB";
  const agentCorporate =
    process.env.COMPANIES_HOUSE_AGENT_NAME?.trim() ||
    "HYDRA CONSULTANCY SERVICES LTD";

  return {
    submissionNumber,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompanyIncorporation</Class>
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
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyName>${xmlEscape(input.companyName.toUpperCase())}</CompanyName>
        <PackageReference>${xmlEscape(packageRef)}</PackageReference>
        <FormIdentifier>CompanyIncorporation</FormIdentifier>
        <SubmissionNumber>${xmlEscape(submissionNumber)}</SubmissionNumber>
      </FormHeader>
      <DateSigned>${today}</DateSigned>
      <Form>
        <CompanyIncorporation xmlns="http://xmlgw.companieshouse.gov.uk" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/CompanyIncorporation-v3-8.xsd">
          <CompanyType>BYSHR</CompanyType>
          <CountryOfIncorporation>${xmlEscape(input.countryOfIncorporation)}</CountryOfIncorporation>
          <RegisteredOfficeAddress>
${addressXml(input.registeredOffice, "            ")}
          </RegisteredOfficeAddress>
          <DataMemorandum>true</DataMemorandum>
          <Articles>BYSHRMODEL</Articles>${appointmentsXml}${pscsXml}
          <StatementOfCapital>
            <Capital>
              <TotalAmountUnpaid>${totalUnpaid}</TotalAmountUnpaid>
              <TotalNumberOfIssuedShares>${totalShares}</TotalNumberOfIssuedShares>
              <ShareCurrency>${input.shareCurrency}</ShareCurrency>
              <TotalAggregateNominalValue>${aggregateNominal}</TotalAggregateNominalValue>
              <Shares>
                <ShareClass>${xmlEscape(input.shareClass)}</ShareClass>
                <PrescribedParticulars>Voting rights</PrescribedParticulars>
                <NumShares>${totalShares}</NumShares>
                <AggregateNominalValue>${aggregateNominal}</AggregateNominalValue>
              </Shares>
            </Capital>
          </StatementOfCapital>${subscribersXml}
          <Authoriser>
            <Agent>
              <Corporate>
                <Forename>${xmlEscape(input.authoriserForename)}</Forename>
                <Surname>${xmlEscape(input.authoriserSurname)}</Surname>
                <CorporateName>${xmlEscape(agentCorporate)}</CorporateName>
              </Corporate>
              <Authentication>
                <AuthoriserPersonalAuthentication>AUTHORISER_AGREES_NAME_USED_TO_AUTHENTICATE</AuthoriserPersonalAuthentication>
              </Authentication>
              <Address>
                <Premise>${xmlEscape(agentPremise)}</Premise>
                <Street>${xmlEscape(agentStreet)}</Street>
                <PostTown>${xmlEscape(agentTown)}</PostTown>
                <Country>GBR</Country>
                <Postcode>${xmlEscape(agentPostcode)}</Postcode>
              </Address>
            </Agent>
          </Authoriser>
          <SameDay>${input.sameDay ? "true" : "false"}</SameDay>
          <SICCodes>
${sicXml}
          </SICCodes>
          <RegisteredEmailAddress>${xmlEscape(input.registeredEmail)}</RegisteredEmailAddress>
          <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
        </CompanyIncorporation>
      </Form>
    </FormSubmission>
  </Body>
</GovTalkMessage>`,
  };
}
