import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";
import { NOTE8_KEYS } from "@/lib/bank-categories";

export type AccountsPackCompany = {
  name: string;
  companyNumber: string;
  registeredOffice: string[];
  directors: string[];
  principalActivity: string;
  accountantsName?: string;
  accountantsAddress?: string[];
  bankers?: string;
  approvalDate?: string; // ISO
};

function gbp(pence: number, blankZero = false): string {
  if (blankZero && pence === 0) return "-";
  const neg = pence < 0;
  const abs = Math.abs(pence) / 100;
  const formatted = abs.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return neg ? `(${formatted})` : formatted;
}

function yearLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function yearShort(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return iso.slice(0, 4);
}

/**
 * Digitus-style financial statements HTML (print → PDF).
 * Template reference: docs/templates/year-end-accounts-template.pdf
 */
export function renderYearEndAccountsHtml(
  company: AccountsPackCompany,
  draft: YearEndAccountsDraft,
  prior?: Partial<YearEndAccountsDraft> | null,
): string {
  const endLabel = yearLabel(draft.periodEnd);
  const y = yearShort(draft.periodEnd);
  const py = prior?.periodEnd ? yearShort(prior.periodEnd) : String(Number(y) - 1);
  const director = company.directors[0] ?? "Director";
  const approval =
    company.approvalDate && /^\d{4}-\d{2}-\d{2}$/.test(company.approvalDate)
      ? company.approvalDate.split("-").reverse().join("/")
      : new Date().toLocaleDateString("en-GB");
  const accountants = company.accountantsName ?? "HydraTax";
  const office = company.registeredOffice.filter(Boolean);
  const note8 = draft.note8;
  const priorNote8 = prior?.note8;

  const plRow = (label: string, cur: number, prev?: number, note?: string) => `
    <tr>
      <td>${label}</td>
      <td class="note">${note ?? ""}</td>
      <td class="num">${gbp(cur)}</td>
      <td class="num">${prev === undefined ? "-" : gbp(prev)}</td>
    </tr>`;

  const note8Rows = NOTE8_KEYS.map((k) => {
    const cur = note8[k] ?? 0;
    const prev = priorNote8?.[k];
    if (cur === 0 && (!prev || prev === 0)) return "";
    return `<tr>
      <td>${draft.note8Labels[k]}</td>
      <td class="num">${gbp(cur)}</td>
      <td class="num">${prev === undefined ? "-" : gbp(prev)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(company.name)} — Financial Statements ${endLabel}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #111;
    font-size: 11pt;
    line-height: 1.35;
    margin: 0;
  }
  h1, h2, h3 { font-weight: 700; letter-spacing: 0.02em; }
  .cover, .page { page-break-after: always; padding: 8mm 4mm; min-height: 240mm; }
  .page:last-child { page-break-after: auto; }
  .center { text-align: center; }
  .muted { color: #444; }
  .cover h1 { font-size: 16pt; margin-top: 40mm; }
  .cover .meta { margin-top: 28mm; font-size: 12pt; }
  table.fin { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.fin td, table.fin th { padding: 3px 6px; vertical-align: top; }
  table.fin th { text-align: right; font-weight: 600; border-bottom: 1px solid #222; }
  table.fin td.num, table.fin th.num { text-align: right; font-variant-numeric: tabular-nums; width: 18%; }
  table.fin td.note { width: 10%; text-align: center; color: #444; }
  .section-title { text-align: center; margin: 10mm 0 6mm; font-size: 13pt; text-transform: uppercase; }
  .company { text-align: center; font-weight: 700; text-transform: uppercase; margin-bottom: 2mm; }
  .sig { margin-top: 16mm; }
  .small { font-size: 9.5pt; }
  ul.plain { list-style: none; padding: 0; }
  .toolbar {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 8px; align-items: center; justify-content: flex-end;
    padding: 10px 14px; background: #0b3d4a; color: #fff;
    font-family: system-ui, sans-serif; font-size: 13px;
  }
  .toolbar button, .toolbar a {
    background: #f4efe6; color: #0b3d4a; border: 0; border-radius: 8px;
    padding: 8px 12px; font-weight: 600; cursor: pointer; text-decoration: none;
  }
  @media print { .toolbar { display: none; } .cover, .page { padding: 0; } }
</style>
</head>
<body>
  <div class="toolbar">
    <span style="margin-right:auto;opacity:.85">Year-end accounts pack</span>
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <section class="cover center">
    <p class="muted">COMPANY NUMBER: ${escapeHtml(company.companyNumber || "—")}</p>
    <h1>${escapeHtml(company.name.toUpperCase())}</h1>
    <p class="meta"><strong>FINANCIAL STATEMENTS</strong><br/>FOR THE PERIOD ENDED<br/>${escapeHtml(endLabel.toUpperCase())}</p>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Index to the Financial Statements</h2>
    <p class="center muted">FOR THE PERIOD ENDED ${escapeHtml(endLabel.toUpperCase())}</p>
    <table class="fin" style="margin-top:16mm">
      <tr><td>CONTENTS</td><td class="num">PAGE</td></tr>
      <tr><td>Company Information</td><td class="num">1</td></tr>
      <tr><td>Director’s Report</td><td class="num">2</td></tr>
      <tr><td>Statement of Director’s Responsibilities</td><td class="num">3</td></tr>
      <tr><td>Accountant's Report</td><td class="num">4</td></tr>
      <tr><td>Balance Sheet</td><td class="num">5</td></tr>
      <tr><td>Profit and Loss Account</td><td class="num">6</td></tr>
      <tr><td>Notes to the Accounts</td><td class="num">7-9</td></tr>
    </table>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Company Information</h2>
    <p class="center muted">FOR THE PERIOD ENDED ${escapeHtml(endLabel.toUpperCase())}</p>
    <p><strong>Director:</strong> ${escapeHtml(director)}</p>
    <p><strong>Company Number:</strong> ${escapeHtml(company.companyNumber || "—")}</p>
    <p><strong>Registered Office:</strong><br/>${office.map(escapeHtml).join("<br/>") || "—"}</p>
    <p><strong>Accountants:</strong><br/>${escapeHtml(accountants)}
      ${(company.accountantsAddress ?? []).map(escapeHtml).join("<br/>")}
    </p>
    <p><strong>Bankers:</strong> ${escapeHtml(company.bankers ?? "—")}</p>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Report of the Director</h2>
    <p>The director is pleased to submit the annual report and the accounts of the company for the period ended ${escapeHtml(endLabel)}.</p>
    <p><strong>1. Principal Activity</strong><br/>The principal activity of the company was to provide ${escapeHtml(company.principalActivity)}.</p>
    <p><strong>2. Results</strong><br/>The results for the year are as disclosed in the attached accounts. No dividends were paid for the year.</p>
    <p><strong>3. Fixed Assets</strong><br/>Movements in fixed assets are set out in note 1.</p>
    <p><strong>4. Events since the end of the year</strong><br/>There have been no events since the balance sheet date which in the opinion of the director needs to be drawn to the shareholders attention.</p>
    <p><strong>5. Directors and Shareholders</strong><br/>The director throughout the year and their interest in the share capital of the company was as follows:</p>
    <p>Directors: ${escapeHtml(company.directors.join(", ") || director)}</p>
    <div class="sig">
      <p>By order of the board</p>
      <p>.....................................................</p>
      <p>${escapeHtml(approval)} &nbsp;&nbsp; ${escapeHtml(director)}</p>
    </div>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Statement of Director’s Responsibilities</h2>
    <p>Company law requires the Directors to prepare financial statements for each financial year which give a true and fair view of the state of affairs of the Company and of the Company for that period.</p>
    <p>In preparing those financial statements, the Directors are required to:-</p>
    <ul>
      <li>Select suitable accounting policies and then apply them consistently,</li>
      <li>Make judgements and estimates that are reasonable and prudent,</li>
      <li>State whether applicable accounting standards have been followed, subject to any material departures disclosed and explained in the financial statements: and</li>
      <li>Prepare the financial statements on the going concern basis unless it is inappropriate to presume that the company will continue in business.</li>
    </ul>
    <p>The Directors are responsible for keeping proper accounting records which disclose with reasonable accuracy at any time the financial position of the Company and to enable them to ensure that the financial statements comply with the Companies Act 2006. They are also responsible for safeguarding the assets of the Company and hence for taking reasonable steps for the prevention and detection of fraud and other irregularities.</p>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Accountants' Report to the Directors</h2>
    <p class="center muted">FOR THE PERIOD ENDED ${escapeHtml(endLabel.toUpperCase())}</p>
    <p>You consider that the company is exempt from an audit for the period ended ${escapeHtml(endLabel)}.</p>
    <p>You have acknowledged, on the balance sheet, your responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts. These responsibilities include preparing accounts that give a true and fair view of the state of affairs of the company at the end of the financial period and of its profit or loss for the financial period.</p>
    <p>In accordance with your instructions, we have prepared the accounts which comprise the Profit and Loss Account, the Balance Sheet and the related notes from accounting records of the company and on the basis of information and explanations you have given to us.</p>
    <p>We have not carried out an audit or any other review, and consequently we do not express any opinion on these accounts.</p>
    <div class="sig">
      <p>For and on behalf of ${escapeHtml(accountants)}</p>
      <p>Date: ${escapeHtml(approval)}</p>
    </div>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Balance Sheet as at ${escapeHtml(endLabel)}</h2>
    <table class="fin">
      <thead>
        <tr><th></th><th class="note">Notes</th><th class="num">${escapeHtml(y)}</th><th class="num">${escapeHtml(py)}</th></tr>
      </thead>
      <tbody>
        ${plRow("FIXED ASSETS", draft.balanceSheet.fixedAssetsPence, prior?.balanceSheet?.fixedAssetsPence, "1")}
        <tr><td colspan="4"><em>CURRENT ASSETS</em></td></tr>
        ${plRow("Other debtors", draft.balanceSheet.otherDebtorsPence, prior?.balanceSheet?.otherDebtorsPence, "2")}
        ${plRow("Cash at bank", draft.balanceSheet.cashAtBankPence, prior?.balanceSheet?.cashAtBankPence)}
        ${plRow("CREDITORS - Amounts due within 1 year", -draft.balanceSheet.creditorsWithinOneYearPence, prior?.balanceSheet ? -prior.balanceSheet.creditorsWithinOneYearPence : undefined, "3")}
        ${plRow("NET CURRENT ASSETS/(LIABILITIES)", draft.balanceSheet.netCurrentAssetsPence, prior?.balanceSheet?.netCurrentAssetsPence)}
        ${plRow("TOTAL ASSETS LESS CURRENT LIABILITIES", draft.balanceSheet.fixedAssetsPence + draft.balanceSheet.netCurrentAssetsPence, prior?.balanceSheet ? prior.balanceSheet.fixedAssetsPence + prior.balanceSheet.netCurrentAssetsPence : undefined)}
        ${plRow("CREDITORS - Due after 1 year", -draft.balanceSheet.creditorsAfterOneYearPence, prior?.balanceSheet ? -prior.balanceSheet.creditorsAfterOneYearPence : undefined, "4")}
        ${plRow("Total net assets", draft.balanceSheet.totalNetAssetsPence, prior?.balanceSheet?.totalNetAssetsPence)}
        <tr><td colspan="4"><em>Represented by</em></td></tr>
        ${plRow("Share capital", draft.balanceSheet.shareCapitalPence, prior?.balanceSheet?.shareCapitalPence, "5")}
        ${plRow("Profit and loss reserve", draft.balanceSheet.profitAndLossReservePence, prior?.balanceSheet?.profitAndLossReservePence, "6")}
      </tbody>
    </table>
    <p class="small" style="margin-top:10mm">The director states that:</p>
    <p class="small">a.) For the period ended ${escapeHtml(endLabel)} the company was entitled to exemption from Audit under section 477 of the Companies Act 2006.</p>
    <p class="small">b.) The members have not required the company to obtain an audit in accordance with section 476 of the Companies Act 2006.</p>
    <p class="small">c.) The director acknowledges their responsibility for complying with the requirements of the Act with respect to accounting records and for the preparation of the accounts.</p>
    <p class="small">d.) These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.</p>
    <div class="sig">
      <p>The accounts were approved by the director on ${escapeHtml(approval)}.</p>
      <p>--------------------------------------------- &nbsp; Director</p>
      <p>${escapeHtml(director)}</p>
    </div>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Profit and Loss Account</h2>
    <p class="center muted">FOR THE PERIOD ENDED ${escapeHtml(endLabel.toUpperCase())}</p>
    <table class="fin">
      <thead>
        <tr><th></th><th class="note">Notes</th><th class="num">${escapeHtml(y)}</th><th class="num">${escapeHtml(py)}</th></tr>
      </thead>
      <tbody>
        ${plRow("Turnover", draft.turnoverPence, prior?.turnoverPence, "7")}
        ${plRow("Cost of sales", -draft.costOfSalesPence, prior ? -(prior.costOfSalesPence ?? 0) : undefined)}
        ${plRow("GROSS PROFIT", draft.grossProfitPence, prior?.grossProfitPence)}
        ${plRow("Administrative Expenses", -draft.adminExpensesPence, prior ? -(prior.adminExpensesPence ?? 0) : undefined, "8")}
        ${plRow("Net profit/(Loss) before taxation", draft.profitBeforeTaxPence, prior?.profitBeforeTaxPence)}
        ${plRow("Taxation", -draft.taxationPence, prior ? -(prior.taxationPence ?? 0) : undefined, "9")}
        ${plRow("Profit / (loss) after Taxation", draft.profitAfterTaxPence, prior?.profitAfterTaxPence)}
        ${plRow("Dividends", -draft.dividendsPence, prior ? -(prior.dividendsPence ?? 0) : undefined, "10")}
        ${plRow("Profit/(loss) bfwd", draft.retainedBroughtForwardPence, prior?.retainedBroughtForwardPence)}
        ${plRow("Retained profit / (loss) carried fwd", draft.retainedCarriedForwardPence, prior?.retainedCarriedForwardPence)}
      </tbody>
    </table>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Notes to the Accounts</h2>
    <p class="center muted">FOR THE PERIOD ENDED ${escapeHtml(endLabel.toUpperCase())}</p>
    <h3>ACCOUNTING POLICIES</h3>
    <p>The following accounting policies have been used consistently in dealing with items which are considered material in relation to the company’s accounts.</p>
    <p><strong>a) Basis of Accounting</strong><br/>Accounts are prepared on the historical cost basis of accounting.</p>
    <p><strong>b) Depreciation</strong><br/>Depreciation is calculated so as to write off the full cost of tangible fixed assets at the following annual rate: Fixtures, Fittings and Equipment 20% on a reducing balance basis.</p>
    <p><strong>d) Turnover</strong><br/>Turnover represents the takings as ${escapeHtml(company.principalActivity)} and is stated exclusive of value added tax.</p>
    <p><strong>e) Cash Flow Statement</strong><br/>The company has taken advantage of the exemption in Financial Reporting Standard No 1 from producing a cash flow statement on the grounds that it is a small company.</p>
  </section>

  <section class="page">
    <div class="company">${escapeHtml(company.name)}</div>
    <h2 class="section-title">Notes to the Accounts (continued)</h2>
    <h3>8.) ADMINISTRATIVE EXPENSES</h3>
    <table class="fin">
      <thead>
        <tr><th></th><th class="num">${escapeHtml(y)} £</th><th class="num">${escapeHtml(py)} £</th></tr>
      </thead>
      <tbody>
        ${note8Rows || `<tr><td colspan="3" class="muted">No administrative expenses in period.</td></tr>`}
        <tr>
          <td><strong>TOTAL EXPENDITURE</strong></td>
          <td class="num"><strong>${gbp(draft.adminExpensesPence)}</strong></td>
          <td class="num"><strong>${prior ? gbp(prior.adminExpensesPence ?? 0) : "-"}</strong></td>
        </tr>
      </tbody>
    </table>
    <h3 style="margin-top:12mm">7.) TURNOVER</h3>
    <p>Turnover represents takings as ${escapeHtml(company.principalActivity)} and is exclusive of VAT.</p>
    <h3>9.) TAXATION</h3>
    <p>The Corporation Tax Liability for the Year is ${gbp(draft.taxationPence)}.</p>
    <h3>10.) DIVIDENDS</h3>
    <p>Dividends Paid for the Year: ${gbp(draft.dividendsPence)}.</p>
  </section>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
