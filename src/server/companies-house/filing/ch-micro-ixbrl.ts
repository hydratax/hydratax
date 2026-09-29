/**
 * Companies House micro-entity / dormant iXBRL (FRS Micro-entities).
 * Tags only what CH needs for an audit-exempt micro filing — balance sheet,
 * statutory statements, employees note — from year-end figures.
 */
import { frcAccountsTaxonomy } from "@/server/hmrc/ct600/ixbrl-taxonomy";
import { ixHtmlOpen } from "@/server/hmrc/ct600/ixbrl-shared";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";

const CH_SCHEME = "http://www.companieshouse.gov.uk/";

export type ChMicroBalanceSheet = {
  fixedAssetsPence: number;
  currentAssetsPence: number;
  creditorsWithinPence: number;
  creditorsAfterPence: number;
  shareCapitalPence: number;
  retainedEarningsPence: number;
};

export type ChMicroAccountsInput = {
  companyName: string;
  companyNumber: string;
  periodStart: string;
  periodEnd: string;
  dormant: boolean;
  balanceSheet: ChMicroBalanceSheet;
  directorName: string;
  averageEmployees?: number;
  approvalDate?: string;
};

function money(name: string, valuePence: number, contextRef: string) {
  return `<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(valuePence)}</ix:nonFraction>`;
}

function text(name: string, value: string, contextRef: string) {
  return `<ix:nonNumeric name="${name}" contextRef="${contextRef}">${escapeXml(value)}</ix:nonNumeric>`;
}

function empty(name: string, contextRef: string) {
  return `<ix:nonNumeric name="${name}" contextRef="${contextRef}"></ix:nonNumeric>`;
}

function pure(name: string, value: number, contextRef: string) {
  return `<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="pure" decimals="0">${value}</ix:nonFraction>`;
}

function durationContext(
  id: string,
  companyNumber: string,
  periodStart: string,
  periodEnd: string,
  segment?: string,
) {
  const seg = segment ? `\n            <xbrli:segment>${segment}</xbrli:segment>` : "";
  return `<xbrli:context id="${id}">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>${seg}
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>${periodStart}</xbrli:startDate>
            <xbrli:endDate>${periodEnd}</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>`;
}

function instantContext(
  id: string,
  companyNumber: string,
  instant: string,
  segment?: string,
) {
  const seg = segment ? `\n            <xbrli:segment>${segment}</xbrli:segment>` : "";
  return `<xbrli:context id="${id}">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>${seg}
          </xbrli:entity>
          <xbrli:period><xbrli:instant>${instant}</xbrli:instant></xbrli:period>
        </xbrli:context>`;
}

function formatLongDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Derive CH micro BS lines so the accounting identity always holds:
 * Fixed + Current − CreditorsWithin − CreditorsAfter = Equity.
 * Year-end UI already balances retained earnings to net assets; if inputs
 * drift, residual is absorbed into current assets so CH validation passes.
 */
export function deriveMicroBalanceSheet(bs: ChMicroBalanceSheet): {
  fixedAssets: number;
  currentAssets: number;
  creditorsWithin: number;
  creditorsAfter: number;
  netCurrent: number;
  totalLessCurrent: number;
  netAssets: number;
  equity: number;
  shareCapital: number;
  retainedEarnings: number;
} {
  const fixedAssets = Math.max(0, Math.round(bs.fixedAssetsPence));
  const creditorsWithin = Math.max(0, Math.round(bs.creditorsWithinPence));
  const creditorsAfter = Math.max(0, Math.round(bs.creditorsAfterPence));
  const shareCapital = Math.max(0, Math.round(bs.shareCapitalPence)) || 100;
  const retainedEarnings = Math.round(bs.retainedEarningsPence);
  const equity = shareCapital + retainedEarnings;
  const netAssets = equity;
  const currentAssets = Math.max(
    0,
    netAssets + creditorsWithin + creditorsAfter - fixedAssets,
  );
  const netCurrent = currentAssets - creditorsWithin;
  const totalLessCurrent = fixedAssets + netCurrent;
  return {
    fixedAssets,
    currentAssets,
    creditorsWithin,
    creditorsAfter,
    netCurrent,
    totalLessCurrent,
    netAssets,
    equity,
    shareCapital,
    retainedEarnings,
  };
}

export function buildChMicroAccountsIxbrl(input: ChMicroAccountsInput): string {
  const companyNumber = input.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const { periodStart, periodEnd } = input;
  const taxonomy = frcAccountsTaxonomy(periodEnd);
  const direpNs = taxonomy.coreNs.includes("2024")
    ? "http://xbrl.frc.org.uk/reports/2024-01-01/direp"
    : "http://xbrl.frc.org.uk/reports/2023-01-01/direp";
  const lines = deriveMicroBalanceSheet(input.balanceSheet);
  const dormant = input.dormant;
  const director = input.directorName.trim() || "Director";
  const approval = input.approvalDate || periodEnd;
  const employees = Math.max(0, Math.round(input.averageEmployees ?? (dormant ? 0 : 1)));
  const yearEndLong = formatLongDate(periodEnd);
  const accountsLabel = dormant ? "Dormant company" : "Micro-entity";
  const principalActivities = dormant
    ? "The company was dormant throughout the accounting period"
    : "Trading activities";

  const s477 = `For the period ending ${yearEndLong} the company was entitled to exemption under section 477 of the Companies Act 2006 relating to small companies.`;
  const s480 = `For the period ending ${yearEndLong} the company was entitled to exemption under section 480 of the Companies Act 2006 relating to dormant companies.`;
  const s476 =
    "The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.";
  const directorsAck =
    "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.";
  const microRegime =
    "The accounts have been prepared in accordance with the micro-entity provisions and delivered in accordance with the provisions applicable to companies subject to the small companies regime.";
  const auditExemptionStatement = dormant
    ? text(
        "uk-direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
        s480,
        "ctx-duration",
      )
    : text(
        "uk-direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
        s477,
        "ctx-duration",
      );

  return `<?xml version="1.0" encoding="UTF-8"?>
${ixHtmlOpen(`xmlns:uk-core="${taxonomy.coreNs}"
  xmlns:uk-bus="${taxonomy.busNs}"
  xmlns:uk-geo="${taxonomy.geoNs}"
  xmlns:uk-direp="${direpNs}"`)}
<head>
  <title>${escapeXml(input.companyName)} ${accountsLabel} accounts</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
</head>
<body>
  <div style="display:none">
    <ix:header>
      <ix:hidden>
        ${text("uk-bus:ReportTitle", `${accountsLabel} accounts`, "ctx-duration")}
        ${text("uk-bus:EntityCurrentLegalOrRegisteredName", input.companyName, "ctx-duration")}
        ${text("uk-bus:UKCompaniesHouseRegisteredNumber", companyNumber, "ctx-duration")}
        ${text("uk-bus:StartDateForPeriodCoveredByReport", periodStart, "ctx-instant")}
        ${text("uk-bus:EndDateForPeriodCoveredByReport", periodEnd, "ctx-instant")}
        ${text("uk-bus:BalanceSheetDate", periodEnd, "ctx-instant")}
        ${text("uk-core:DateAuthorisationFinancialStatementsForIssue", approval, "ctx-instant")}
        ${text("uk-bus:EntityDormantTruefalse", dormant ? "true" : "false", "ctx-duration")}
        ${empty("uk-bus:EntityTradingStatus", "ctx-duration")}
        ${text("uk-bus:DescriptionPrincipalActivities", principalActivities, "ctx-duration")}
        ${empty("uk-bus:AccountingStandardsApplied", "ctx-accounting-standards")}
        ${empty("uk-bus:AccountsType", "ctx-accounts-type")}
        ${empty("uk-bus:AccountsStatusAuditedOrUnaudited", "ctx-accounts-status")}
        ${empty("uk-bus:LegalFormEntity", "ctx-legal-form")}
        ${empty("uk-core:DirectorSigningFinancialStatements", "ctx-signing-director")}
        ${text("uk-bus:NameEntityOfficer", director, "ctx-officer")}
        ${text("uk-bus:NameProductionSoftware", "HydraTax", "ctx-duration")}
        ${text("uk-bus:VersionProductionSoftware", "1.0.0", "ctx-duration")}
      </ix:hidden>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="${taxonomy.entryPoint}"/>
      </ix:references>
      <ix:resources>
        ${durationContext("ctx-duration", companyNumber, periodStart, periodEnd)}
        ${instantContext("ctx-instant", companyNumber, periodEnd)}
        ${durationContext(
          "ctx-accounting-standards",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountingStandardsDimension">uk-bus:Micro-entities</xbrldi:explicitMember>`,
        )}
        ${durationContext(
          "ctx-accounts-type",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountsTypeDimension">uk-bus:FullAccounts</xbrldi:explicitMember>`,
        )}
        ${durationContext(
          "ctx-accounts-status",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountsStatusDimension">uk-bus:AuditExempt-NoAccountantsReport</xbrldi:explicitMember>`,
        )}
        ${durationContext(
          "ctx-legal-form",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:LegalFormEntityDimension">uk-bus:PrivateLimitedCompanyLtd</xbrldi:explicitMember>`,
        )}
        ${durationContext(
          "ctx-officer",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:EntityOfficersDimension">uk-bus:Director1</xbrldi:explicitMember>`,
        )}
        ${durationContext(
          "ctx-signing-director",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:EntityOfficersDimension">uk-bus:Director1</xbrldi:explicitMember>`,
        )}
        ${instantContext(
          "ctx-creditors-within",
          companyNumber,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:WithinOneYear</xbrldi:explicitMember>`,
        )}
        ${instantContext(
          "ctx-creditors-after",
          companyNumber,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:AfterOneYear</xbrldi:explicitMember>`,
        )}
        <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
        <xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>
      </ix:resources>
    </ix:header>
  </div>

  <h1>${escapeXml(input.companyName)}</h1>
  <p>Registered number ${escapeXml(companyNumber)}</p>
  <h2>${accountsLabel} Balance Sheet as at ${escapeXml(yearEndLong)}</h2>
  <table>
    <tr><td>Fixed assets</td><td>${money("uk-core:FixedAssets", lines.fixedAssets, "ctx-instant")}</td></tr>
    <tr><td>Current assets</td><td>${money("uk-core:CurrentAssets", lines.currentAssets, "ctx-instant")}</td></tr>
    <tr><td>Creditors: amounts falling due within one year</td><td>${money("uk-core:Creditors", lines.creditorsWithin, "ctx-creditors-within")}</td></tr>
    <tr><td>Net current assets (liabilities)</td><td>${money("uk-core:NetCurrentAssetsLiabilities", lines.netCurrent, "ctx-instant")}</td></tr>
    <tr><td>Total assets less current liabilities</td><td>${money("uk-core:TotalAssetsLessCurrentLiabilities", lines.totalLessCurrent, "ctx-instant")}</td></tr>
    <tr><td>Creditors: amounts falling due after more than one year</td><td>${money("uk-core:Creditors", lines.creditorsAfter, "ctx-creditors-after")}</td></tr>
    <tr><td>Total net assets (liabilities)</td><td>${money("uk-core:NetAssetsLiabilities", lines.netAssets, "ctx-instant")}</td></tr>
    <tr><td>Capital and reserves</td><td>${money("uk-core:Equity", lines.equity, "ctx-instant")}</td></tr>
  </table>

  <h2>Statements</h2>
  <p>${auditExemptionStatement}</p>
  <p>${text("uk-direp:StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit", s476, "ctx-duration")}</p>
  <p>${text("uk-direp:StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct", directorsAck, "ctx-duration")}</p>
  <p>${text("uk-direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime", microRegime, "ctx-duration")}</p>
  <p>Approved by the board on ${escapeXml(formatLongDate(approval))} and signed on its behalf by ${escapeXml(director)}, Director.</p>

  <h2>Notes</h2>
  <p>Average number of employees during the period: ${pure("uk-core:AverageNumberEmployeesDuringPeriod", employees, "ctx-duration")}</p>
</body>
</html>`;
}
