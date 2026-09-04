import type { ParsedCsFilingInput } from "./personal-codes";
import { splitPersonName } from "./form-envelope";
import { xmlEscape } from "./gateway-auth";

export type CsStatementOfCapitalShare = {
  shareClass: string;
  prescribedParticulars: string;
  numShares: number;
  aggregateNominalValue: number;
};

export type CsStatementOfCapital = {
  shareCurrency: string;
  totalAmountUnpaid: number;
  totalNumberOfIssuedShares: number;
  totalAggregateNominalValue: number;
  shares: CsStatementOfCapitalShare[];
};

function pscFlagsXml() {
  return `<TradingOnMarket>false</TradingOnMarket>
          <DTR5Applies>false</DTR5Applies>
          <PSCExemptAsTradingOnRegulatedMarket>false</PSCExemptAsTradingOnRegulatedMarket>
          <PSCExemptAsSharesAdmittedOnMarket>false</PSCExemptAsSharesAdmittedOnMarket>
          <PSCExemptAsTradingOnUKRegulatedMarket>false</PSCExemptAsTradingOnUKRegulatedMarket>`;
}

function sicCodesXml(sicCodes: string[]) {
  const codes = sicCodes.map((c) => c.trim()).filter((c) => /^\d{5}$/.test(c));
  if (codes.length === 0) return "";
  const items = codes
    .map((code) => `        <SICCode>${xmlEscape(code)}</SICCode>`)
    .join("\n");
  return `<SICCodes>
${items}
      </SICCodes>`;
}

function statementOfCapitalXml(capital: CsStatementOfCapital) {
  const shareRows = capital.shares
    .map(
      (s) => `              <Shares>
                <ShareClass>${xmlEscape(s.shareClass)}</ShareClass>
                <PrescribedParticulars>${xmlEscape(s.prescribedParticulars)}</PrescribedParticulars>
                <NumShares>${s.numShares}</NumShares>
                <AggregateNominalValue>${s.aggregateNominalValue}</AggregateNominalValue>
              </Shares>`,
    )
    .join("\n");

  return `<StatementOfCapital>
            <Capital>
              <TotalAmountUnpaid>${capital.totalAmountUnpaid}</TotalAmountUnpaid>
              <TotalNumberOfIssuedShares>${capital.totalNumberOfIssuedShares}</TotalNumberOfIssuedShares>
              <ShareCurrency>${xmlEscape(capital.shareCurrency)}</ShareCurrency>
              <TotalAggregateNominalValue>${capital.totalAggregateNominalValue}</TotalAggregateNominalValue>
${shareRows}
            </Capital>
          </StatementOfCapital>`;
}

function ecctaFieldsXml(input: ParsedCsFilingInput) {
  return `<RegisteredEmailAddress>${xmlEscape(input.registeredEmail)}</RegisteredEmailAddress>
          <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
          <StateConfirmation>true</StateConfirmation>`;
}

function directorsVerificationXml(input: ParsedCsFilingInput) {
  return input.directors
    .map((d) => {
      const names = splitPersonName(d.fullName);
      const forename = d.forename || names.forename;
      const surname = d.surname || names.surname;
      const title = d.title ? `<Title>${xmlEscape(d.title)}</Title>` : "";
      const mismatch = d.nameMismatchReason
        ? `<NameMismatchReason>${xmlEscape(d.nameMismatchReason)}</NameMismatchReason>`
        : "";
      const code = d.personalCode?.trim();
      if (!code) return "";
      return `
                <Director>
                  <Person>
                    ${title}
                    <Forename>${xmlEscape(forename)}</Forename>
                    <Surname>${xmlEscape(surname)}</Surname>
                    <DOB>${xmlEscape(d.dateOfBirth)}</DOB>
                    <VerificationDetails>
                      <CompaniesHousePersonalCode>${xmlEscape(code)}</CompaniesHousePersonalCode>
                      <VerificationStatements>
                        <VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>
                      </VerificationStatements>
                      ${mismatch}
                    </VerificationDetails>
                  </Person>
                </Director>`;
    })
    .join("");
}

/** Builds the inner CS01 form document (ConfirmationAndVerificationStatement or ConfirmationStatement). */
export function cs01NeedsVerification(input: ParsedCsFilingInput) {
  return input.directors.some((d) => d.personalCode?.trim());
}

/** GovTalk Class / FormIdentifier must match the root form element name. */
export function resolveCs01MessageClass(input: ParsedCsFilingInput) {
  return cs01NeedsVerification(input)
    ? "ConfirmationAndVerificationStatement"
    : "ConfirmationStatement";
}

export function buildCs01FormBody(input: ParsedCsFilingInput) {
  const sicXml = sicCodesXml(input.sicCodes ?? []);
  const capitalXml = input.statementOfCapital
    ? statementOfCapitalXml(input.statementOfCapital)
    : "";

  if (cs01NeedsVerification(input)) {
    return `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationAndVerificationStatement-v1-0.xsd">
          ${pscFlagsXml()}
          <ReviewDate>${xmlEscape(input.confirmationDate)}</ReviewDate>
          ${sicXml}
          ${capitalXml}
          ${ecctaFieldsXml(input)}
          <VerificationStatement>${directorsVerificationXml(input)}
          </VerificationStatement>
        </ConfirmationAndVerificationStatement>`;
  }

  return `<ConfirmationStatement xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationStatement-v1-3.xsd">
          ${pscFlagsXml()}
          <ReviewDate>${xmlEscape(input.confirmationDate)}</ReviewDate>
          ${sicXml}
          ${capitalXml}
          ${ecctaFieldsXml(input)}
        </ConfirmationStatement>`;
}
