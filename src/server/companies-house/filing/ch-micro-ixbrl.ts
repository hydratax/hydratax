/**
 * Companies House micro-entity / dormant iXBRL.
 * Layout matches the Companies House WebFiling micro-entity PDF
 * (cover → comparative balance sheet → statements → employees note).
 */
import { frcAccountsTaxonomy } from "@/server/hmrc/ct600/ixbrl-taxonomy";
import { ixHtmlOpen } from "@/server/hmrc/ct600/ixbrl-shared";
import { escapeXml } from "@/server/hmrc/ct600/xml-utils";

const CH_SCHEME = "http://www.companieshouse.gov.uk/";

export type ChMicroBalanceSheet = {
  fixedAssetsPence: number;
  currentAssetsPence: number;
  creditorsWithinPence: number;
  creditorsAfterPence: number;
  shareCapitalPence: number;
  retainedEarningsPence: number;
  /** Asset line on CH micro BS; defaults to share capital when unpaid. */
  calledUpShareCapitalNotPaidPence?: number | null;
};

export type ChMicroAccountsInput = {
  companyName: string;
  companyNumber: string;
  periodStart: string;
  periodEnd: string;
  dormant: boolean;
  balanceSheet: ChMicroBalanceSheet;
  /** Prior-year comparative BS (last filed / brought forward). */
  priorBalanceSheet?: ChMicroBalanceSheet | null;
  priorPeriodEnd?: string | null;
  priorPeriodStart?: string | null;
  priorAverageEmployees?: number | null;
  directorName: string;
  averageEmployees?: number;
  approvalDate?: string;
};

type DerivedLines = {
  notPaid: number;
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
};

/** Companies House micro accounts are filed in whole pounds only. */
function roundToPoundPence(pence: number): number {
  return Math.round(Math.round(pence) / 100) * 100;
}

function poundsDisplay(pence: number): string {
  const pounds = Math.round(roundToPoundPence(pence) / 100);
  return pounds.toLocaleString("en-GB");
}

function money(
  name: string,
  valuePence: number,
  contextRef: string,
  opts?: { negate?: boolean },
) {
  const abs = Math.abs(Math.round(valuePence));
  const body = `<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="GBP" decimals="0" format="ixt2:numdotdecimal">${poundsDisplay(abs)}</ix:nonFraction>`;
  if (opts?.negate) {
    return `(${body}<span class="endnegmark">)</span>`;
  }
  return body;
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

function yearLabel(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return iso.slice(0, 4);
}

function shiftYearIso(iso: string, years: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * CH micro identity (whole pounds):
 * NotPaid + Fixed + Current − CreditorsWithin − CreditorsAfter = Equity.
 * All lines are rounded to the nearest pound before the identity is applied
 * so filed/preview accounts never show pence.
 */
export function deriveMicroBalanceSheet(bs: ChMicroBalanceSheet): DerivedLines {
  const shareCapital =
    Math.max(0, roundToPoundPence(bs.shareCapitalPence)) || 100;
  const retainedEarnings = roundToPoundPence(bs.retainedEarningsPence);
  const equity = shareCapital + retainedEarnings;
  const notPaid = Math.max(
    0,
    roundToPoundPence(
      bs.calledUpShareCapitalNotPaidPence == null
        ? shareCapital
        : bs.calledUpShareCapitalNotPaidPence,
    ),
  );
  const fixedAssets = Math.max(0, roundToPoundPence(bs.fixedAssetsPence));
  const creditorsWithin = Math.max(
    0,
    roundToPoundPence(bs.creditorsWithinPence),
  );
  const creditorsAfter = Math.max(0, roundToPoundPence(bs.creditorsAfterPence));
  const netAssets = equity;
  const currentAssets = Math.max(
    0,
    netAssets + creditorsWithin + creditorsAfter - fixedAssets - notPaid,
  );
  const netCurrent = currentAssets - creditorsWithin;
  const totalLessCurrent = notPaid + fixedAssets + netCurrent;
  return {
    notPaid,
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

function figureCell(
  name: string,
  valuePence: number,
  contextRef: string,
  opts?: { negate?: boolean; className?: string },
) {
  const cls = opts?.className ? ` ${opts.className}` : "";
  return `<td class="number${cls}"><div>${money(name, valuePence, contextRef, { negate: opts?.negate })}</div></td>`;
}

function blankFigureCell() {
  return `<td class="number"><div></div></td>`;
}

export function buildChMicroAccountsIxbrl(input: ChMicroAccountsInput): string {
  const companyNumber = input.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const companyName = input.companyName.trim();
  const { periodStart, periodEnd } = input;
  const taxonomy = frcAccountsTaxonomy(periodEnd);
  const direpNs = taxonomy.coreNs.includes("2024")
    ? "http://xbrl.frc.org.uk/reports/2024-01-01/direp"
    : "http://xbrl.frc.org.uk/reports/2023-01-01/direp";
  const cur = deriveMicroBalanceSheet(input.balanceSheet);
  const hasPrior = Boolean(input.priorBalanceSheet);
  const prior = hasPrior
    ? deriveMicroBalanceSheet(input.priorBalanceSheet!)
    : null;
  const priorEnd = input.priorPeriodEnd || shiftYearIso(periodEnd, -1);
  const priorStart = input.priorPeriodStart || shiftYearIso(periodStart, -1);
  const dormant = input.dormant;
  const director = input.directorName.trim() || "Director";
  const approval = input.approvalDate || periodEnd;
  const employees = Math.max(
    0,
    Math.round(input.averageEmployees ?? (dormant ? 0 : 1)),
  );
  const priorEmployees = Math.max(
    0,
    Math.round(input.priorAverageEmployees ?? employees),
  );
  const yearEndLong = formatLongDate(periodEnd);
  const curYear = yearLabel(periodEnd);
  const prevYear = yearLabel(priorEnd);
  const accountsLabel = dormant ? "Dormant company" : "Micro-entity";

  const s477 = `For the year ending ${yearEndLong} the company was entitled to exemption under section 477 of the Companies Act 2006 relating to small companies.`;
  const s480 = `For the year ending ${yearEndLong} the company was entitled to exemption under section 480 of the Companies Act 2006 relating to dormant companies.`;
  const s476 =
    "The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.";
  const directorsAck =
    "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.";
  const microRegime =
    "The accounts have been prepared in accordance with the micro-entity provisions and delivered in accordance with the provisions applicable to companies subject to the small companies regime.";

  const auditLi = dormant
    ? `<li>${text(
        "uk-direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
        s480,
        "CY",
      )}</li>`
    : `<li>${text(
        "uk-direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
        s477,
        "CY",
      )}</li>`;

  const bsRow = (
    label: string,
    name: string,
    curPence: number,
    priorPence: number | null,
    curCtx: string,
    priorCtx: string,
    opts?: { negate?: boolean; rowClass?: string; cellClass?: string },
  ) => {
    const rowClass = opts?.rowClass ? ` class="${opts.rowClass}"` : "";
    const priorCell =
      prior != null && priorPence != null
        ? figureCell(name, priorPence, priorCtx, {
            negate: opts?.negate,
            className: opts?.cellClass,
          })
        : hasPrior
          ? blankFigureCell()
          : "";
    return `<tr${rowClass}>
        <td class="row-label">${escapeXml(label)}</td>
        <td class="row-notes"/>
        ${figureCell(name, curPence, curCtx, {
          negate: opts?.negate,
          className: opts?.cellClass,
        })}
        ${priorCell}
      </tr>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
${ixHtmlOpen(`xmlns:uk-core="${taxonomy.coreNs}"
  xmlns:uk-bus="${taxonomy.busNs}"
  xmlns:uk-geo="${taxonomy.geoNs}"
  xmlns:uk-direp="${direpNs}"`)}
<head>
  <meta name="generator" content="HydraTax Micro-entity Accounts"/>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
  <title>Micro-entity Accounts - ${escapeXml(companyName)}</title>
  <style type="text/css">
    body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; }
    tr, td, th, tbody { padding: 0; margin: 0; }
    .hidden { display: none; }
    div.pagebreak { page-break-after: always; }
    div.accountspage { width: 100%; }
    div.titlepage { font-weight: bold; margin-top: 1em; text-align: center; }
    div.titlepage p { margin: 0.35em 0; font-size: 1rem; }
    div.accountsheader { font-weight: bold; width: 100%; display: block; }
    span.left { float: left; width: 65%; }
    span.right { float: right; width: 35%; text-align: right; }
    .clear { clear: both; }
    #balancesheet { width: 100%; display: block; }
    #balancesheet table {
      width: 80%; border-collapse: separate; margin-left: 10%;
      border-spacing: 7px; margin-top: -14px; padding-top: 0;
    }
    #balancesheet th, .accountspage th { text-align: left; }
    #balancesheet .figure, .accountspage .figure, td.number {
      text-align: right; padding: 0 5px 0 0; white-space: nowrap;
    }
    .accountspage table td.figure span.endnegmark,
    td.number span.endnegmark { margin-right: -4px; }
    td.row-label { font-weight: bold; }
    .accountspage .total, #balancesheet .total {
      border-bottom: 3px double #000; border-top: 1px solid #000;
    }
    .accountspage .subtotal, #balancesheet .subtotal {
      border-bottom: 1px solid #000; border-top: 1px solid #000;
    }
    .accountspage table th.columnHeading {
      font-style: italic; font-weight: normal; text-align: right;
    }
    .accountspage table { width: 94%; }
    #balancesheet table .notefigure { text-align: center; }
    h1, h2 { font-size: 100%; font-weight: bold; color: black; }
    h2 { margin: 0.2em 0 0.5em 0; background: none; }
    h2.middle { text-align: center; }
    span.officername { font-weight: bold; }
    .keepTogether { page-break-inside: avoid; }
    #statements ul { list-style-type: lower-alpha; }
    #notes .note { margin-left: 1cm; margin-bottom: 20px; }
    #notes .note span.note-number {
      margin-left: -1cm; width: 1cm; display: inline-block;
    }
    @media screen, projection, tv {
      body { margin: 2% 4%; background-color: gray; }
      div.accountspage {
        background-color: white; padding: 2em;
        min-height: 29.7cm; height: auto !important; height: 29.7cm;
        width: 21cm; margin: 2em 0;
      }
      div.titlepage { padding: 5em 2em 2em 2em; }
    }
  </style>
</head>
<body>
  <div class="hidden">
    <ix:header>
      <ix:hidden>
        ${text("uk-bus:ReportTitle", `${accountsLabel} Accounts`, "CY")}
        ${text("uk-bus:EntityCurrentLegalOrRegisteredName", companyName, "CY")}
        ${text("uk-bus:UKCompaniesHouseRegisteredNumber", companyNumber, "CY")}
        ${text("uk-bus:StartDateForPeriodCoveredByReport", periodStart, "icur1")}
        ${text("uk-bus:EndDateForPeriodCoveredByReport", periodEnd, "icur1")}
        ${text("uk-bus:BalanceSheetDate", periodEnd, "icur1")}
        ${text("uk-core:DateAuthorisationFinancialStatementsForIssue", approval, "icur1")}
        ${text("uk-bus:EntityDormantTruefalse", dormant ? "true" : "false", "CY")}
        ${empty("uk-bus:EntityTradingStatus", "CY")}
        ${empty("uk-bus:AccountingStandardsApplied", "ctx-accounting-standards")}
        ${empty("uk-bus:AccountsType", "ctx-accounts-type")}
        ${empty("uk-bus:AccountsStatusAuditedOrUnaudited", "ctx-accounts-status")}
        ${empty("uk-bus:LegalFormEntity", "ctx-legal-form")}
        ${empty("uk-core:DirectorSigningFinancialStatements", "ctx-signing-director")}
        ${text("uk-bus:NameEntityOfficer", director, "ctx-officer")}
        ${text("uk-bus:NameProductionSoftware", "HydraTax", "CY")}
        ${text("uk-bus:VersionProductionSoftware", "1.0.0", "CY")}
      </ix:hidden>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="${taxonomy.entryPoint}"/>
      </ix:references>
      <ix:resources>
        ${durationContext("CY", companyNumber, periodStart, periodEnd)}
        ${durationContext("PY", companyNumber, priorStart, priorEnd)}
        ${instantContext("icur1", companyNumber, periodEnd)}
        ${instantContext("iprev8", companyNumber, priorEnd)}
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
          "icur9",
          companyNumber,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:WithinOneYear</xbrldi:explicitMember>`,
        )}
        ${instantContext(
          "iprev10",
          companyNumber,
          priorEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:WithinOneYear</xbrldi:explicitMember>`,
        )}
        ${instantContext(
          "icur11",
          companyNumber,
          periodEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:AfterOneYear</xbrldi:explicitMember>`,
        )}
        ${instantContext(
          "iprev12",
          companyNumber,
          priorEnd,
          `<xbrldi:explicitMember dimension="uk-core:MaturitiesOrExpirationPeriodsDimension">uk-core:AfterOneYear</xbrldi:explicitMember>`,
        )}
        <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
        <xbrli:unit id="pure"><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unit>
      </ix:resources>
    </ix:header>
  </div>

  <div class="titlepage accountspage pagebreak title">
    <p>Registered Number ${text("uk-bus:UKCompaniesHouseRegisteredNumber", companyNumber, "CY")}</p>
    <p>${text("uk-bus:EntityCurrentLegalOrRegisteredName", companyName, "CY")}</p>
    <p>Micro-entity Accounts</p>
    <p>${escapeXml(yearEndLong)}</p>
  </div>

  <div class="accountspage pagebreak">
    <div class="accountsheader">
      <h2 class="print">${escapeXml(companyName)}<span class="right">Registered Number ${escapeXml(companyNumber)}</span></h2>
    </div>
    <div id="balancesheet">
      <h2 class="middle">Micro-entity Balance Sheet as at ${escapeXml(yearEndLong)}</h2>
      <table>
        <tr>
          <th/>
          <th class="notefigure columnHeading">Notes</th>
          <th class="figure columnHeading">${escapeXml(curYear)}</th>
          ${hasPrior ? `<th class="figure columnHeading">${escapeXml(prevYear)}</th>` : ""}
        </tr>
        <tr>
          <th/>
          <th/>
          <th class="figure columnHeading">£</th>
          ${hasPrior ? `<th class="figure columnHeading">£</th>` : ""}
        </tr>
        ${bsRow(
          "Called up share capital not paid",
          "uk-core:CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset",
          cur.notPaid,
          prior?.notPaid ?? null,
          "icur1",
          "iprev8",
        )}
        ${bsRow(
          "Fixed Assets",
          "uk-core:FixedAssets",
          cur.fixedAssets,
          prior?.fixedAssets ?? null,
          "icur1",
          "iprev8",
        )}
        ${bsRow(
          "Current Assets",
          "uk-core:CurrentAssets",
          cur.currentAssets,
          prior?.currentAssets ?? null,
          "icur1",
          "iprev8",
        )}
        ${bsRow(
          "Creditors: amounts falling due within one year",
          "uk-core:Creditors",
          cur.creditorsWithin,
          prior?.creditorsWithin ?? null,
          "icur9",
          "iprev10",
          { negate: true },
        )}
        ${bsRow(
          "Net current assets (liabilities)",
          "uk-core:NetCurrentAssetsLiabilities",
          cur.netCurrent,
          prior?.netCurrent ?? null,
          "icur1",
          "iprev8",
          { rowClass: "subtotal", cellClass: "subtotal" },
        )}
        ${bsRow(
          "Total assets less current liabilities",
          "uk-core:TotalAssetsLessCurrentLiabilities",
          cur.totalLessCurrent,
          prior?.totalLessCurrent ?? null,
          "icur1",
          "iprev8",
          { rowClass: "subtotal", cellClass: "subtotal" },
        )}
        ${
          cur.creditorsAfter > 0 || (prior?.creditorsAfter ?? 0) > 0
            ? bsRow(
                "Creditors: amounts falling due after more than one year",
                "uk-core:Creditors",
                cur.creditorsAfter,
                prior?.creditorsAfter ?? null,
                "icur11",
                "iprev12",
                { negate: true },
              )
            : ""
        }
        ${bsRow(
          "Total net assets (liabilities)",
          "uk-core:NetAssetsLiabilities",
          cur.netAssets,
          prior?.netAssets ?? null,
          "icur1",
          "iprev8",
          { rowClass: "total", cellClass: "total" },
        )}
        ${bsRow(
          "Capital and reserves",
          "uk-core:Equity",
          cur.equity,
          prior?.equity ?? null,
          "icur1",
          "iprev8",
          { rowClass: "total", cellClass: "total" },
        )}
      </table>
    </div>

    <div class="keepTogether">
      <div id="statements">
        <ul>
          ${auditLi}
          <li>${text(
            "uk-direp:StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit",
            s476,
            "CY",
          )}</li>
          <li>${text(
            "uk-direp:StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct",
            directorsAck,
            "CY",
          )}</li>
          <li>${text(
            "uk-direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
            microRegime,
            "CY",
          )}</li>
        </ul>
      </div>
      <div id="approval">
        <p>Approved by the Board on ${escapeXml(formatLongDate(approval))}</p>
        <p>And signed on their behalf by:<br/>
          <span class="officername">${escapeXml(director)}, Director</span>
        </p>
      </div>
    </div>
  </div>

  <div class="accountspage" id="notes">
    <div class="accountsheader">
      <h2 class="print">${escapeXml(companyName)}<span class="right">Registered Number ${escapeXml(companyNumber)}</span></h2>
      <p class="clear"/>
    </div>
    <h2>Notes to the Micro-entity Accounts for the period ended ${escapeXml(yearEndLong)}</h2>
    <div class="note">
      <span class="note-number">1</span><strong>Employees</strong><br/>
      <table>
        <thead>
          <tr>
            <th/>
            <th class="figure columnHeading" style="width:72px;">${escapeXml(curYear)}</th>
            ${hasPrior ? `<th class="figure columnHeading" style="width:72px;">${escapeXml(prevYear)}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Average number of employees during the period</td>
            <td class="figure">${pure("uk-core:AverageNumberEmployeesDuringPeriod", employees, "CY")}</td>
            ${
              hasPrior
                ? `<td class="figure">${pure("uk-core:AverageNumberEmployeesDuringPeriod", priorEmployees, "PY")}</td>`
                : ""
            }
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}
