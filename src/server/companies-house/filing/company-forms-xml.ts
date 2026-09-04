import {
  buildFormSubmissionEnvelope,
  parseFreeformAddress,
  splitPersonName,
  structuredAddressBlock,
  parseStructuredAddressJson,
  type StructuredAddressInput,
} from "./form-envelope";
import { xmlEscape } from "./gateway-auth";

const CH_NS = "http://xmlgw.companieshouse.gov.uk";

function addressBlock(
  addr: ReturnType<typeof parseFreeformAddress>,
  indent = "              ",
) {
  return `${indent}<Premise>${xmlEscape(addr.premise)}</Premise>
${indent}<Street>${xmlEscape(addr.street)}</Street>
${indent}<PostTown>${xmlEscape(addr.postTown)}</PostTown>
${indent}<Country>${xmlEscape(addr.country)}</Country>
${indent}<Postcode>${xmlEscape(addr.postcode)}</Postcode>`;
}

function addressFromStructured(addr: StructuredAddressInput, indent: string) {
  return structuredAddressBlock(addr, indent);
}

function verificationBlock(personalCode: string, indent = "            ") {
  return `${indent}<VerificationDetails>
${indent}  <CompaniesHousePersonalCode>${xmlEscape(personalCode.toUpperCase())}</CompaniesHousePersonalCode>
${indent}  <VerificationStatements>
${indent}    <VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>
${indent}  </VerificationStatements>
${indent}</VerificationDetails>`;
}

function naturesBlock(natures: string[], indent = "            ") {
  if (!natures.length) return "";
  return `${indent}<NatureOfControls>
${natures.map((n) => `${indent}  <NatureOfControl>${xmlEscape(n)}</NatureOfControl>`).join("\n")}
${indent}</NatureOfControls>`;
}

export function buildChangeOfNameXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  newName: string;
}) {
  const formBody = `<ChangeOfName xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/ChangeOfName-v1-1.xsd">
          <CompanyName>${xmlEscape(input.newName.trim())}</CompanyName>
        </ChangeOfName>`;

  return buildFormSubmissionEnvelope({
    messageClass: "ChangeOfName",
    formIdentifier: "ChangeOfName",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildOfficerAppointmentXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  directorName: string;
  forename?: string;
  surname?: string;
  dateOfBirth: string;
  appointedOn: string;
  personalCode: string;
  serviceAddress: string;
  residentialAddress?: string;
  serviceSameAsRegistered?: boolean;
  nationality?: string;
  countryOfResidence?: string;
}) {
  const names = input.forename && input.surname
    ? { forename: input.forename, surname: input.surname }
    : splitPersonName(input.directorName);
  const svcAddr = parseFreeformAddress(input.serviceAddress);
  const resAddr = input.residentialAddress
    ? parseFreeformAddress(input.residentialAddress)
    : svcAddr;

  const serviceAddressXml = input.serviceSameAsRegistered
    ? `              <ServiceAddress>
                <SameAsRegisteredOffice>true</SameAsRegisteredOffice>
              </ServiceAddress>`
    : `              <ServiceAddress>
                <Address>
${addressBlock(svcAddr, "                  ")}
                </Address>
              </ServiceAddress>`;

  const formBody = `<OfficerAppointment xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/OfficerAppointment-v2-9.xsd">
          <AppointmentDate>${xmlEscape(input.appointedOn)}</AppointmentDate>
          <ConsentToAct>true</ConsentToAct>
          <Director>
            <Person>
              <Forename>${xmlEscape(names.forename)}</Forename>
              <Surname>${xmlEscape(names.surname)}</Surname>
${serviceAddressXml}
              <DOB>${xmlEscape(input.dateOfBirth)}</DOB>
              <Nationality>${xmlEscape(input.nationality?.trim() || "British")}</Nationality>
              <CountryOfResidence>${xmlEscape(input.countryOfResidence?.trim() || "United Kingdom")}</CountryOfResidence>
              <ResidentialAddress>
                <Address>
${addressBlock(resAddr, "                  ")}
                </Address>
              </ResidentialAddress>
${verificationBlock(input.personalCode, "              ")}
            </Person>
          </Director>
        </OfficerAppointment>`;

  return buildFormSubmissionEnvelope({
    messageClass: "OfficerAppointment",
    formIdentifier: "OfficerAppointment",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildOfficerTerminationXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  directorName: string;
  resignedOn: string;
}) {
  const names = splitPersonName(input.directorName);

  const formBody = `<OfficerTermination xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/OfficerTermination-v2-3.xsd">
          <TerminationDate>${xmlEscape(input.resignedOn)}</TerminationDate>
          <Director>
            <Person>
              <Forename>${xmlEscape(names.forename)}</Forename>
              <Surname>${xmlEscape(names.surname)}</Surname>
            </Person>
          </Director>
        </OfficerTermination>`;

  return buildFormSubmissionEnvelope({
    messageClass: "OfficerTermination",
    formIdentifier: "OfficerTermination",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildStrikeOffApplicationXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
}) {
  const formBody = `<StrikeOffApplication xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/StrikeOffApplication-v1-2.xsd">
          <ApplicationDate>${new Date().toISOString().slice(0, 10)}</ApplicationDate>
          <DeclarationSigned>true</DeclarationSigned>
        </StrikeOffApplication>`;

  return buildFormSubmissionEnvelope({
    messageClass: "StrikeOffApplication",
    formIdentifier: "StrikeOffApplication",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildPscNotificationXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  forename: string;
  surname: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  personalCode: string;
  notificationDate: string;
  residentialAddress: string;
  naturesOfControl: string[];
}) {
  const resAddr = parseStructuredAddressJson(input.residentialAddress);
  const resBlock = resAddr
    ? addressFromStructured(resAddr, "                  ")
    : addressBlock(parseFreeformAddress(input.residentialAddress), "                  ");

  const formBody = `<PSCNotification xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/PSCNotification-v1-2.xsd">
          <NotificationDate>${xmlEscape(input.notificationDate)}</NotificationDate>
          <Individual>
            <Forename>${xmlEscape(input.forename)}</Forename>
            <Surname>${xmlEscape(input.surname)}</Surname>
            <ServiceAddress>
              <SameAsRegisteredOffice>true</SameAsRegisteredOffice>
            </ServiceAddress>
            <DOB>${xmlEscape(input.dateOfBirth)}</DOB>
            <Nationality>${xmlEscape(input.nationality)}</Nationality>
            <CountryOfResidence>${xmlEscape(input.countryOfResidence)}</CountryOfResidence>
            <ResidentialAddress>
              <Address>
${resBlock}
              </Address>
            </ResidentialAddress>
${verificationBlock(input.personalCode, "            ")}
            <ConsentStatement>true</ConsentStatement>
          </Individual>
${naturesBlock(input.naturesOfControl, "          ")}
        </PSCNotification>`;

  return buildFormSubmissionEnvelope({
    messageClass: "PSCNotification",
    formIdentifier: "PSCNotification",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildPscChangeXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  forename: string;
  surname: string;
  changeDate: string;
  naturesOfControl: string[];
}) {
  const formBody = `<PSCChangeDetails xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/PSCChangeDetails-v1-2.xsd">
          <ChangeDate>${xmlEscape(input.changeDate)}</ChangeDate>
          <Individual>
            <Forename>${xmlEscape(input.forename)}</Forename>
            <Surname>${xmlEscape(input.surname)}</Surname>
          </Individual>
${naturesBlock(input.naturesOfControl, "          ")}
        </PSCChangeDetails>`;

  return buildFormSubmissionEnvelope({
    messageClass: "PSCChangeDetails",
    formIdentifier: "PSCChangeDetails",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildPscCessationXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  forename: string;
  surname: string;
  cessationDate: string;
}) {
  const formBody = `<PSCCessation xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/PSCCessation-v1-2.xsd">
          <CessationDate>${xmlEscape(input.cessationDate)}</CessationDate>
          <Individual>
            <Forename>${xmlEscape(input.forename)}</Forename>
            <Surname>${xmlEscape(input.surname)}</Surname>
          </Individual>
        </PSCCessation>`;

  return buildFormSubmissionEnvelope({
    messageClass: "PSCCessation",
    formIdentifier: "PSCCessation",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildReturnOfAllotmentXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  allotmentDate: string;
  shareClass: string;
  numShares: number;
  nominalValue: string;
  amountPaid: string;
  amountUnpaid: string;
  allotteeForename: string;
  allotteeSurname: string;
  allotteeAddress: string;
}) {
  const addr = parseStructuredAddressJson(input.allotteeAddress);
  const addrBlock = addr
    ? addressFromStructured(addr, "              ")
    : addressBlock(parseFreeformAddress(input.allotteeAddress), "              ");

  const formBody = `<ReturnOfAllotmentShares xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/ReturnOfAllotmentShares-v1-1.xsd">
          <AllotmentDate>${xmlEscape(input.allotmentDate)}</AllotmentDate>
          <Shares>
            <ShareClass>${xmlEscape(input.shareClass)}</ShareClass>
            <NumShares>${input.numShares}</NumShares>
            <AmountPaidDuePerShare>${xmlEscape(input.amountPaid)}</AmountPaidDuePerShare>
            <AmountUnpaidPerShare>${xmlEscape(input.amountUnpaid)}</AmountUnpaidPerShare>
            <ShareCurrency>GBP</ShareCurrency>
            <ShareValue>${xmlEscape(input.nominalValue)}</ShareValue>
          </Shares>
          <Allottee>
            <Person>
              <Forename>${xmlEscape(input.allotteeForename)}</Forename>
              <Surname>${xmlEscape(input.allotteeSurname)}</Surname>
            </Person>
            <Address>
${addrBlock}
            </Address>
          </Allottee>
        </ReturnOfAllotmentShares>`;

  return buildFormSubmissionEnvelope({
    messageClass: "ReturnOfAllotmentShares",
    formIdentifier: "ReturnOfAllotmentShares",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export function buildAccountsSubmissionXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  periodStart: string;
  periodEnd: string;
  ixbrlHtml: string;
}) {
  const formBody = `<Accounts xmlns="${CH_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${CH_NS} ${CH_NS}/v1-0/schema/forms/Accounts-v1-0.xsd">
          <PeriodStart>${xmlEscape(input.periodStart)}</PeriodStart>
          <PeriodEnd>${xmlEscape(input.periodEnd)}</PeriodEnd>
        </Accounts>`;

  return buildFormSubmissionEnvelope({
    messageClass: "Accounts",
    formIdentifier: "Accounts",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
    documents: [
      {
        filename: "accounts.xhtml",
        dataBase64: Buffer.from(input.ixbrlHtml, "utf8").toString("base64"),
        category: "ACCOUNTS",
      },
    ],
  });
}

import { postXmlToGateway } from "./xml-gateway";

export async function submitChFormXml(xml: string) {
  return postXmlToGateway(xml);
}
