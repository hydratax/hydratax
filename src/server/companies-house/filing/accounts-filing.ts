/**
 * Companies House statutory accounts (non-fee-bearing).
 *
 * CH does NOT charge a filing fee for year-end accounts. Hydra's checkout fee
 * is a service charge only. Live submit needs presenter ID + auth + company
 * authentication code — not a credit account.
 *
 * Payload shape (XML Gateway FormSubmission + iXBRL Document):
 * - Class / FormIdentifier: Accounts
 * - Empty <Form/> (structured Accounts XML unused when attaching iXBRL)
 * - Document Category=ACCOUNTS, ContentType=application/xml, .html filename
 * - Presenter authentication (clear) + company authentication code
 */
import { getChFilingEnv, isChXmlGatewayConfigured } from "./config";
import {
  buildAccountsPresenterAuthenticationXml,
  CH_ACCOUNTS_PACKAGE_REFERENCE,
  sixCharSubmissionNumber,
  validatePresenterCredentials,
  xmlEscape,
} from "./gateway-auth";
import {
  getHydraPresenterConfig,
  resolveChCompanyType,
} from "./presenter";
import {
  buildChMicroAccountsIxbrl,
  type ChMicroBalanceSheet,
} from "./ch-micro-ixbrl";
import { postXmlToGateway } from "./xml-gateway";

export type AccountsSubmitResult = {
  ok: boolean;
  submissionNumber?: string | null;
  error?: string;
  mode?: "xml_gateway" | "dry_run";
};

function poundsToPence(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw * 100);
  }
  if (typeof raw === "string") {
    const n = Number.parseFloat(
      raw.replace(/,/g, "").replace(/[()]/g, "").trim(),
    );
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return 0;
}

function normaliseCompanyNumber(raw: string) {
  const cleaned = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (/^\d+$/.test(cleaned)) return cleaned.padStart(8, "0");
  return cleaned;
}

type YearEndPayload = {
  pl?: Record<string, string>;
  bs?: Record<string, string>;
  periodStart?: string;
  periodEnd?: string;
  companyType?: string;
  directorName?: string;
};

function parseYearEndFiguresField(raw: unknown): YearEndPayload | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as YearEndPayload;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as YearEndPayload;
  } catch {
    return null;
  }
}

/** Map year-end wizard BS fields into micro-entity pence lines. */
export function balanceSheetFromYearEndPayload(
  raw: unknown,
  accountsType: string,
): ChMicroBalanceSheet {
  const data = parseYearEndFiguresField(raw);
  const bs = data?.bs ?? {};
  const dormant = accountsType === "dormant";
  if (!data?.bs && dormant) {
    return {
      fixedAssetsPence: 0,
      currentAssetsPence: 100,
      creditorsWithinPence: 0,
      creditorsAfterPence: 0,
      shareCapitalPence: 100,
      retainedEarningsPence: 0,
    };
  }
  return {
    fixedAssetsPence: poundsToPence(bs.fixedAssets),
    currentAssetsPence: poundsToPence(bs.totalCurrentAssets),
    creditorsWithinPence:
      poundsToPence(bs.creditorsWithinOneYear) +
      poundsToPence(bs.corporationTaxPayable),
    creditorsAfterPence: poundsToPence(bs.creditorsAfterOneYear),
    shareCapitalPence: poundsToPence(bs.shareCapital) || 100,
    retainedEarningsPence: poundsToPence(bs.retainedEarnings),
  };
}

function isDormantFromPayload(raw: unknown, accountsType: string): boolean {
  if (accountsType === "dormant") return true;
  const data = parseYearEndFiguresField(raw);
  if (!data?.pl) return accountsType === "dormant";
  const pl = data.pl;
  const activity =
    poundsToPence(pl.turnover) +
    poundsToPence(pl.interestIncome) +
    poundsToPence(pl.costOfMaterials) +
    poundsToPence(pl.staffCosts) +
    poundsToPence(pl.depreciation) +
    poundsToPence(pl.otherCharges);
  return activity === 0;
}

/**
 * GovTalk envelope for non-fee Accounts + iXBRL attachment.
 * Matches the working CH XML Gateway Accounts pattern (empty Form + Document).
 */
export function buildAccountsGatewayXml(input: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  periodStart: string;
  periodEnd: string;
  ixbrlHtml: string;
}): string {
  const cfg = getChFilingEnv();
  const presenter = getHydraPresenterConfig();
  const submissionNumber = sixCharSubmissionNumber();
  const dateSigned = new Date().toISOString().slice(0, 10);
  const companyNumber = normaliseCompanyNumber(input.companyNumber);
  const companyType = resolveChCompanyType(companyNumber);
  const packageReference = xmlEscape(CH_ACCOUNTS_PACKAGE_REFERENCE);
  const email = presenter.presenterEmail
    ? `\n      <EmailAddress>${xmlEscape(presenter.presenterEmail)}</EmailAddress>`
    : "";
  const contactName = xmlEscape(
    (presenter.contactName || "HydraTax").slice(0, 50),
  );
  const contactNumber = presenter.contactNumber
    ? `\n        <ContactNumber>${xmlEscape(presenter.contactNumber.slice(0, 25))}</ContactNumber>`
    : `\n        <ContactNumber>00000000000</ContactNumber>`;
  const gatewayTestXml = cfg.gatewayTest
    ? `\n      <GatewayTest>1</GatewayTest>`
    : "";
  const ixbrlB64 = Buffer.from(input.ixbrlHtml, "utf8").toString("base64");

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.govtalk.gov.uk/CM/envelope http://xmlgw.companieshouse.gov.uk/v1-0/schema/Egov_ch-v2-0.xsd">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>Accounts</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>${gatewayTestXml}
    </MessageDetails>
    <SenderDetails>
      ${buildAccountsPresenterAuthenticationXml()}${email}
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="FormType">Accounts</Key>
    </Keys>
    <TargetDetails>
      <Organisation>Companies House</Organisation>
    </TargetDetails>
  </GovTalkDetails>
  <Body>
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyNumber>${xmlEscape(companyNumber)}</CompanyNumber>
        <CompanyType>${xmlEscape(companyType)}</CompanyType>
        <CompanyName>${xmlEscape(input.companyName.toUpperCase())}</CompanyName>
        <CompanyAuthenticationCode>${xmlEscape(input.companyAuthCode.toUpperCase())}</CompanyAuthenticationCode>
        <PackageReference>${packageReference}</PackageReference>
        <Language>EN</Language>
        <FormIdentifier>Accounts</FormIdentifier>
        <SubmissionNumber>${xmlEscape(submissionNumber)}</SubmissionNumber>
        <ContactName>${contactName}</ContactName>${contactNumber}
      </FormHeader>
      <DateSigned>${dateSigned}</DateSigned>
      <Form>
      </Form>
      <Document>
        <Data>${ixbrlB64}</Data>
        <Date>${dateSigned}</Date>
        <Filename>accounts.html</Filename>
        <ContentType>application/xml</ContentType>
        <Category>ACCOUNTS</Category>
      </Document>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

export async function submitAccountsFromPayload(opts: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  periodStart: string;
  periodEnd: string;
  accountsType: string;
  yearEndFigures?: unknown;
  declarantName?: string | null;
}): Promise<AccountsSubmitResult> {
  const presenterCheck = validatePresenterCredentials();
  if (!presenterCheck.ok) {
    return { ok: false, error: presenterCheck.error };
  }

  if (!isChXmlGatewayConfigured()) {
    return {
      ok: false,
      mode: "dry_run",
      error:
        "Companies House presenter credentials are not configured on this environment — live submit is disabled.",
    };
  }

  if (!opts.companyAuthCode.trim()) {
    return {
      ok: false,
      error:
        "Company authentication code missing — add it on the client record or at checkout.",
    };
  }

  const parsed = parseYearEndFiguresField(opts.yearEndFigures);
  const balanceSheet = balanceSheetFromYearEndPayload(
    opts.yearEndFigures,
    opts.accountsType,
  );
  const dormant = isDormantFromPayload(opts.yearEndFigures, opts.accountsType);
  const directorName =
    opts.declarantName?.trim() ||
    parsed?.directorName?.trim() ||
    "Director";

  const ixbrl = buildChMicroAccountsIxbrl({
    companyName: opts.companyName,
    companyNumber: normaliseCompanyNumber(opts.companyNumber),
    periodStart: parsed?.periodStart || opts.periodStart,
    periodEnd: parsed?.periodEnd || opts.periodEnd,
    dormant,
    balanceSheet,
    directorName,
    averageEmployees: dormant ? 0 : 1,
    approvalDate: new Date().toISOString().slice(0, 10),
  });

  const xml = buildAccountsGatewayXml({
    companyNumber: opts.companyNumber,
    companyName: opts.companyName,
    companyAuthCode: opts.companyAuthCode,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    ixbrlHtml: ixbrl,
  });

  // Accounts are non-fee-bearing — do not require a credit account.
  const result = await postXmlToGateway(xml, "Accounts", {
    feeBearing: false,
  });
  if (!result.ok) {
    return { ok: false, mode: "xml_gateway", error: result.error };
  }

  // Prefer CH echo; otherwise keep the SubmissionNumber we generated in the envelope.
  const sentMatch = xml.match(
    /<SubmissionNumber>([^<]+)<\/SubmissionNumber>/i,
  );
  return {
    ok: true,
    mode: "xml_gateway",
    submissionNumber: result.submissionNumber ?? sentMatch?.[1] ?? null,
  };
}
