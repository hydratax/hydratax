import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";
import { IXBRL_HTML_NAMESPACES, ixHtmlOpen } from "@/server/hmrc/ct600/ixbrl-shared";
import { frcAccountsTaxonomy } from "@/server/hmrc/ct600/ixbrl-taxonomy";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";

const CH_SCHEME = "http://www.companieshouse.gov.uk/";

function ixNonFraction(name: string, valuePence: number, contextRef: string) {
  return `<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(valuePence)}</ix:nonFraction>`;
}

function ixNonNumeric(name: string, value: string, contextRef: string) {
  return `<ix:nonNumeric name="${name}" contextRef="${contextRef}">${escapeXml(value)}</ix:nonNumeric>`;
}

function ixNonNumericEmpty(name: string, contextRef: string) {
  return `<ix:nonNumeric name="${name}" contextRef="${contextRef}"></ix:nonNumeric>`;
}

function isDormant(figures: Ct600Figures): boolean {
  return (
    Number(figures.turnoverPence) === 0 &&
    Number(figures.otherIncomePence) === 0 &&
    Number(figures.costOfSalesPence) === 0 &&
    Number(figures.administrativeExpensesPence) === 0
  );
}

function dimContext(
  id: string,
  companyNumber: string,
  periodStart: string,
  periodEnd: string,
  segment: string,
) {
  return `<xbrli:context id="${id}">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>
            <xbrli:segment>${segment}</xbrli:segment>
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>${periodStart}</xbrli:startDate>
            <xbrli:endDate>${periodEnd}</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>`;
}

/** FRS-102 micro-entity iXBRL accounts for CT Online attachment. */
export function buildAccountsIxbrl(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  draft?: YearEndAccountsDraft | null;
  declarantName?: string | null;
  declarantStatus?: string | null;
}): string {
  const { companyName, companyNumber, figures, draft } = opts;
  const { periodStart, periodEnd } = figures;
  const taxonomy = frcAccountsTaxonomy(periodEnd);
  const dormant = isDormant(figures);
  const director = opts.declarantName?.trim() || "Director";
  const principalActivities = dormant
    ? "The company was dormant throughout the accounting period"
    : "Trading activities";
  const shareCapital =
    draft?.balanceSheet.shareCapitalPence ??
    Number(figures.calledUpShareCapitalPence);
  const netAssets =
    shareCapital +
    (draft?.balanceSheet.profitAndLossReservePence ??
      Number(figures.profitAndLossAccountPence));

  return `<?xml version="1.0" encoding="UTF-8"?>
${ixHtmlOpen(`xmlns:uk-core="${taxonomy.coreNs}"\n  xmlns:uk-bus="${taxonomy.busNs}"\n  xmlns:uk-geo="${taxonomy.geoNs}"`)}
<head>
  <title>${escapeXml(companyName)} statutory accounts</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
</head>
<body>
  <div style="display:none">
    <ix:header>
      <ix:hidden>
        ${ixNonNumeric("uk-bus:ReportTitle", dormant ? "Dormant company accounts" : "Micro-entity accounts", "ctx-duration")}
        ${ixNonNumeric("uk-bus:EntityCurrentLegalOrRegisteredName", companyName, "ctx-duration")}
        ${ixNonNumeric("uk-bus:UKCompaniesHouseRegisteredNumber", companyNumber, "ctx-duration")}
        ${ixNonNumeric("uk-bus:StartDateForPeriodCoveredByReport", periodStart, "ctx-instant")}
        ${ixNonNumeric("uk-bus:EndDateForPeriodCoveredByReport", periodEnd, "ctx-instant")}
        ${ixNonNumeric("uk-bus:BalanceSheetDate", periodEnd, "ctx-instant")}
        ${ixNonNumeric("uk-core:DateAuthorisationFinancialStatementsForIssue", periodEnd, "ctx-instant")}
        ${ixNonNumeric("uk-bus:EntityDormantTruefalse", dormant ? "true" : "false", "ctx-duration")}
        ${ixNonNumericEmpty("uk-bus:EntityTradingStatus", "ctx-duration")}
        ${ixNonNumeric("uk-bus:DescriptionPrincipalActivities", principalActivities, "ctx-duration")}
        ${ixNonNumericEmpty("uk-bus:AccountingStandardsApplied", "ctx-accounting-standards")}
        ${ixNonNumericEmpty("uk-bus:AccountsType", "ctx-accounts-type")}
        ${ixNonNumericEmpty("uk-bus:AccountsStatusAuditedOrUnaudited", "ctx-accounts-status")}
        ${ixNonNumericEmpty("uk-bus:LegalFormEntity", "ctx-legal-form")}
        ${ixNonNumericEmpty("uk-core:DirectorSigningFinancialStatements", "ctx-signing-director")}
        ${ixNonNumeric("uk-bus:NameEntityOfficer", director, "ctx-officer")}
        ${ixNonNumeric("uk-bus:NameProductionSoftware", "HydraTax", "ctx-duration")}
        ${ixNonNumeric("uk-bus:VersionProductionSoftware", "0.1.0", "ctx-duration")}
      </ix:hidden>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="${taxonomy.entryPoint}"/>
      </ix:references>
      <ix:resources>
        <xbrli:context id="ctx-duration">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>${periodStart}</xbrli:startDate>
            <xbrli:endDate>${periodEnd}</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:context id="ctx-instant">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>
          </xbrli:entity>
          <xbrli:period><xbrli:instant>${periodEnd}</xbrli:instant></xbrli:period>
        </xbrli:context>
        ${dimContext(
          "ctx-accounting-standards",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountingStandardsDimension">uk-bus:Micro-entities</xbrldi:explicitMember>`,
        )}
        ${dimContext(
          "ctx-accounts-type",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountsTypeDimension">uk-bus:FullAccounts</xbrldi:explicitMember>`,
        )}
        ${dimContext(
          "ctx-accounts-status",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:AccountsStatusDimension">uk-bus:AuditExempt-NoAccountantsReport</xbrldi:explicitMember>`,
        )}
        ${dimContext(
          "ctx-legal-form",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:LegalFormEntityDimension">uk-bus:PrivateLimitedCompanyLtd</xbrldi:explicitMember>`,
        )}
        ${dimContext(
          "ctx-officer",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:EntityOfficersDimension">uk-bus:Director1</xbrldi:explicitMember>`,
        )}
        ${dimContext(
          "ctx-signing-director",
          companyNumber,
          periodStart,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-bus:EntityOfficersDimension">uk-bus:Director1</xbrldi:explicitMember>`,
        )}
        <xbrli:unit id="GBP">
          <xbrli:measure>iso4217:GBP</xbrli:measure>
        </xbrli:unit>
      </ix:resources>
    </ix:header>
  </div>
  <h1>${escapeXml(companyName)}</h1>
  <p>Period ${escapeXml(periodStart)} to ${escapeXml(periodEnd)} · ${dormant ? "Dormant" : "Trading"}</p>
  <h2>Balance sheet at ${escapeXml(periodEnd)}</h2>
  <p>Net assets: ${ixNonFraction("uk-core:NetAssetsLiabilities", netAssets, "ctx-instant")}</p>
  <p>Total equity: ${ixNonFraction("uk-core:Equity", netAssets, "ctx-instant")}</p>
</body>
</html>`;
}
