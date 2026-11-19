import type { YtdTotals } from "@/server/hmrc/payroll";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ukDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function moneyParts(pence: number) {
  const n = Math.max(0, Math.round(pence || 0));
  const pounds = Math.floor(n / 100).toLocaleString("en-GB");
  const p = String(n % 100).padStart(2, "0");
  return { pounds, p };
}

function taxYearEndYear(taxYear: string): string {
  // "25-26" | "2025-26" | "2025-2026"
  const parts = taxYear.split(/[-–]/);
  const end = parts[parts.length - 1] || "";
  if (end.length === 2) {
    const n = Number(end);
    return String(n > 50 ? 1900 + n : 2000 + n);
  }
  return end || new Date().getFullYear().toString();
}

function printShell(title: string, body: string, extraCss = "") {
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .actions { max-width: 210mm; margin: 0 auto 10px; }
    .actions button { font: inherit; padding: 8px 14px; cursor: pointer; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 10mm; }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      .sheet + .sheet { page-break-before: always; }
    }
    ${extraCss}
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Print / save PDF</button></div>
  ${body}
</body>
</html>`;
}

export type StatutoryEmployee = {
  forename: string;
  surname: string;
  nino: string;
  taxCode: string;
  payrollId: string;
  startDate: string;
  leaveDate?: string | null;
  niCategory?: string;
  gender?: "M" | "F" | null;
  dateOfBirth?: string | null;
  address?: string | null;
};

export type StatutoryEmployer = {
  name: string;
  payeRef: string;
  accountsOfficeRef?: string | null;
  address?: string | null;
};

/**
 * HTML preview for P45(Continuous). Issued documents use the filled PDF
 * (`renderP45Pdf` on `P45_Continuous_Clean.pdf`) — cream HMRC stationery,
 * no "FOR INFORMATION ONLY" watermark.
 */
export function renderP45Html(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  leaveDate: string;
  totals: YtdTotals;
  issuedAt?: string;
}) {
  const issued = opts.issuedAt ?? new Date().toISOString().slice(0, 10);
  const pay = moneyParts(opts.totals.taxablePence ?? opts.totals.grossPence);
  const tax = moneyParts(opts.totals.taxPence);
  const [leaveY, leaveM, leaveD] = opts.leaveDate.split("-");
  const paye = (opts.employer.payeRef || "").split("/");
  const office = paye[0] || "";
  const ref = paye.slice(1).join("/") || opts.employer.payeRef || "";
  const gender = opts.employee.gender;
  const addr = (opts.employee.address || "").trim();
  const postcodeMatch = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const postcode = postcodeMatch?.[1]?.toUpperCase() || "";
  const addressLines = addr
    ? addr.replace(postcode, "").replace(/,\s*$/, "").trim()
    : "";

  const part = (code: string, audience: string) => `
  <div class="sheet page p45">
    <header class="p45-head">
      <div class="hmrc">HM Revenue<br/>&amp; Customs</div>
      <div class="titles">
        <h1>P45 Part ${esc(code)}</h1>
        <p class="sub">Details of employee leaving work</p>
        <p class="copy">${esc(audience)}</p>
      </div>
    </header>
    <div class="panel">
      <div class="grid">
        <div class="box"><span class="n">1</span><label>Employer PAYE reference</label>
          <div class="row"><span class="mini">Office</span><b>${esc(office)}</b>
          <span class="mini">Reference</span><b>${esc(ref)}</b></div>
        </div>
        <div class="box"><span class="n">2</span><label>National Insurance number</label>
          <div class="ni">${esc(opts.employee.nino)}</div>
        </div>
        <div class="box wide"><span class="n">3</span><label>Name</label>
          <div class="row"><span class="mini">Surname</span><b>${esc(opts.employee.surname.toUpperCase())}</b></div>
          <div class="row"><span class="mini">First name(s)</span><b>${esc(opts.employee.forename.toUpperCase())}</b></div>
        </div>
        <div class="box"><span class="n">4</span><label>Leaving date</label>
          <div class="datecells"><i>${esc(leaveD || "")}</i><i>${esc(leaveM || "")}</i><i>${esc(leaveY || "")}</i></div>
        </div>
        <div class="box"><span class="n">6</span><label>Tax code at leaving date</label>
          <div class="taxcode">${esc(opts.employee.taxCode)}</div>
        </div>
        <div class="box wide"><span class="n">7</span><label>Last entries on Payroll</label>
          <div class="row money">
            <span>Total pay to date</span>
            <b>£ ${esc(pay.pounds)}.${esc(pay.p)}</b>
            <span>Total tax to date</span>
            <b>£ ${esc(tax.pounds)}.${esc(tax.p)}</b>
          </div>
        </div>
        <div class="box"><span class="n">9</span><label>Works / payroll number</label>
          <b>${esc(opts.employee.payrollId)}</b>
        </div>
        <div class="box"><span class="n">10</span><label>Gender</label>
          <div class="checks">
            <span class="${gender === "M" ? "on" : ""}">Male</span>
            <span class="${gender === "F" ? "on" : ""}">Female</span>
          </div>
        </div>
        <div class="box"><span class="n">11</span><label>Date of birth</label>
          <b>${esc(opts.employee.dateOfBirth ? ukDate(opts.employee.dateOfBirth) : "—")}</b>
        </div>
        <div class="box wide"><span class="n">12</span><label>Employee’s private address</label>
          <div class="addr">${esc(addressLines || "—")}</div>
          <div class="row"><span class="mini">Postcode</span><b>${esc(postcode || "—")}</b></div>
        </div>
        <div class="box wide"><span class="n">13</span><label>Employer name and address</label>
          <div class="addr">${esc(opts.employer.name)}${opts.employer.address ? `<br/>${esc(opts.employer.address)}` : ""}</div>
          <div class="row"><span class="mini">Date</span><b>${esc(ukDate(issued))}</b></div>
        </div>
      </div>
    </div>
    <footer><span>P45(Continuous) Part ${esc(code)}</span><span>HMRC 08/26</span></footer>
  </div>`;

  const css = `
    .p45 { background:#f7f8fa; }
    .p45-head { display:flex; justify-content:space-between; gap:16px; margin-bottom:12px; }
    .hmrc { font-size:11px; font-weight:700; color:#0b6b63; line-height:1.2; }
    .titles h1 { margin:0; font-size:20px; color:#0b6b63; }
    .titles .sub { margin:2px 0; font-size:13px; font-weight:700; color:#0b6b63; }
    .titles .copy { margin:0; font-size:11px; color:#0b6b63; }
    .panel { background:#fef8df; border:1px solid #9cc9c0; border-radius:8px; padding:10px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .box { position:relative; padding:8px 8px 8px 28px; min-height:48px; }
    .box.wide { grid-column:1 / -1; }
    .box .n { position:absolute; left:6px; top:6px; font-weight:700; color:#0b6b63; }
    .box label { display:block; font-size:10px; color:#334155; margin-bottom:4px; }
    .box b { font-size:13px; }
    .ni { font-size:16px; font-weight:700; letter-spacing:.06em; background:#fff; border:1px solid #94a3b8; padding:4px 8px; }
    .taxcode { font-size:15px; font-weight:700; background:#fff; border:1px solid #94a3b8; padding:4px 8px; display:inline-block; min-width:8rem; }
    .row { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:baseline; margin-top:4px; }
    .mini { font-size:10px; color:#64748b; }
    .money span { min-width:9rem; font-size:11px; }
    .datecells { display:flex; gap:6px; }
    .datecells i { font-style:normal; border:1px solid #94a3b8; background:#fff; padding:4px 8px; min-width:2.2rem; text-align:center; font-weight:700; }
    .checks { display:flex; gap:16px; margin-top:4px; }
    .checks span { font-size:12px; }
    .checks .on::before { content:"X "; font-weight:700; }
    .addr { min-height:2.4rem; font-size:12px; line-height:1.35; background:#fff; border:1px solid #94a3b8; padding:6px; }
    footer { display:flex; justify-content:space-between; margin-top:10px; font-size:10px; color:#0b6b63; font-weight:700; }
  `;

  const body = [
    part("1", "Instructions for the employer"),
    part("1A", "Copy for employee"),
    part("2", "Copy for new employer"),
    part("3", "For completion by new employer"),
  ].join("");

  return printShell(
    `P45 — ${opts.employee.forename} ${opts.employee.surname}`,
    body,
    css,
  );
}

/**
 * Official-style P60 single-sheet End of Year Certificate (substitute for print).
 */
export function renderP60Html(opts: {
  employer: StatutoryEmployer;
  employee: StatutoryEmployee;
  taxYear: string;
  totals: YtdTotals;
  previousEmployment?: YtdTotals | null;
  issuedAt?: string;
}) {
  const endYear = taxYearEndYear(opts.taxYear);
  const prev = opts.previousEmployment;
  const prevPay = moneyParts(prev?.taxablePence ?? prev?.grossPence ?? 0);
  const prevTax = moneyParts(prev?.taxPence ?? 0);
  const thisPay = moneyParts(opts.totals.taxablePence ?? opts.totals.grossPence);
  const thisTax = moneyParts(opts.totals.taxPence);
  const totalPay = moneyParts(
    (prev?.taxablePence ?? prev?.grossPence ?? 0) +
      (opts.totals.taxablePence ?? opts.totals.grossPence),
  );
  const totalTax = moneyParts((prev?.taxPence ?? 0) + opts.totals.taxPence);
  const eeNi = moneyParts(opts.totals.employeeNiPence);
  const smp = moneyParts(opts.totals.smpPence ?? 0);
  const spp = moneyParts(opts.totals.sppPence ?? 0);
  const sap = moneyParts(opts.totals.sapPence ?? 0);
  const shpp = moneyParts(opts.totals.shppPence ?? 0);
  const spbp = moneyParts(opts.totals.spbpPence ?? 0);
  const sncp = moneyParts(opts.totals.sncpPence ?? 0);

  const css = `
    .p60 { background:#f7ebe0; border:1px solid #c4a484; padding:8mm; }
    .p60-top { display:grid; grid-template-columns:1.15fr .95fr; gap:10px; }
    .brand { color:#1d4f91; }
    .brand h1 { margin:0; font-family:Georgia,serif; font-size:22px; }
    .yearbox { display:inline-block; margin-top:6px; background:#fff; border:1px solid #1d4f91; padding:4px 10px; font-weight:700; }
    .employee-note { font-size:10px; line-height:1.35; color:#333; margin-top:8px; max-width:28rem; }
    .star-note { margin-top:8px; background:#1d4f91; color:#fff; font-size:11px; font-weight:700; padding:8px 10px; }
    .sec { background:#fff; border:1px solid #d7b89a; }
    .sec h2 { margin:0; background:#e8a05a; color:#1a1a1a; font-size:12px; padding:5px 8px; }
    .sec .body { padding:8px; }
    .field { margin-bottom:6px; }
    .field label { display:block; font-size:9px; color:#555; }
    .field .val { border:1px solid #cbd5e1; background:#fff; min-height:22px; padding:3px 6px; font-size:12px; font-weight:600; }
    .paytax { width:100%; border-collapse:collapse; font-size:11px; }
    .paytax th, .paytax td { border:1px solid #94a3b8; padding:5px; }
    .paytax th { background:#f8fafc; font-size:10px; }
    .paytax .star { outline:2px solid #1d4f91; }
    .money { text-align:right; font-variant-numeric:tabular-nums; }
    .ni-grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:4px; font-size:9px; }
    .ni-grid .cell { border:1px solid #94a3b8; min-height:48px; padding:4px; background:#fff; }
    .stat { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
    .stat .cell { border:1px solid #94a3b8; padding:4px; background:#fff; font-size:10px; }
    .bottom { display:grid; grid-template-columns:1fr 1.2fr; gap:10px; margin-top:10px; }
    .cert { font-size:10px; line-height:1.35; margin-top:8px; }
    .foot { display:flex; justify-content:space-between; margin-top:10px; font-size:10px; color:#1d4f91; font-weight:700; }
  `;

  const body = `
  <div class="page p60">
    <div class="p60-top">
      <div>
        <div class="brand">
          <h1>P60 End of Year Certificate</h1>
          <div>Tax year to 5 April <span class="yearbox">${esc(endYear)}</span></div>
        </div>
        <p class="employee-note">
          <strong>To the employee:</strong> Please keep this certificate in a safe place
          as you will need it if you have to fill in a tax return. You also need it to make
          a claim for tax credits and Universal Credit or to renew your claim.
          By law you are required to tell HM Revenue and Customs about any income that is
          not fully taxed, even if you are not sent a tax return.
        </p>
        <div class="star-note">The figures marked ★ should be used for your tax return, if you get one</div>
      </div>
      <div class="sec">
        <h2>Employee’s details</h2>
        <div class="body">
          <div class="field"><label>Surname</label><div class="val">${esc(opts.employee.surname)}</div></div>
          <div class="field"><label>Forenames or initials</label><div class="val">${esc(opts.employee.forename)}</div></div>
          <div class="field"><label>National Insurance number</label><div class="val">${esc(opts.employee.nino)}</div></div>
          <div class="field"><label>Works/payroll number</label><div class="val">${esc(opts.employee.payrollId)}</div></div>
        </div>
      </div>
    </div>

    <div class="sec" style="margin-top:10px">
      <h2>Pay and Income Tax details</h2>
      <div class="body">
        <table class="paytax">
          <thead>
            <tr><th></th><th>Pay £</th><th>p</th><th>Tax deducted £</th><th>p</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>In previous employments</td>
              <td class="money">${esc(prevPay.pounds)}</td><td class="money">${esc(prevPay.p)}</td>
              <td class="money">${esc(prevTax.pounds)}</td><td class="money">${esc(prevTax.p)}</td>
            </tr>
            <tr class="star">
              <td>In this employment ★</td>
              <td class="money">${esc(thisPay.pounds)}</td><td class="money">${esc(thisPay.p)}</td>
              <td class="money">${esc(thisTax.pounds)}</td><td class="money">${esc(thisTax.p)}</td>
            </tr>
            <tr>
              <td>Total for year</td>
              <td class="money">${esc(totalPay.pounds)}</td><td class="money">${esc(totalPay.p)}</td>
              <td class="money">${esc(totalTax.pounds)}</td><td class="money">${esc(totalTax.p)}</td>
            </tr>
          </tbody>
        </table>
        <div class="field" style="margin-top:8px;max-width:12rem">
          <label>Final tax code</label>
          <div class="val">${esc(opts.employee.taxCode)}</div>
        </div>
      </div>
    </div>

    <div class="sec" style="margin-top:10px">
      <h2>National Insurance contributions in this employment</h2>
      <div class="body">
        <div class="ni-grid">
          <div class="cell"><strong>NIC table letter</strong><div style="font-size:16px;margin-top:8px">${esc(opts.employee.niCategory || "A")}</div></div>
          <div class="cell"><strong>Earnings at the LEL</strong><div class="money" style="margin-top:8px">—</div></div>
          <div class="cell"><strong>Earnings above LEL to PT</strong><div class="money" style="margin-top:8px">—</div></div>
          <div class="cell"><strong>Earnings above PT to UEL</strong><div class="money" style="margin-top:8px">—</div></div>
          <div class="cell"><strong>Employee’s contributions due above PT</strong><div class="money" style="margin-top:8px">£ ${esc(eeNi.pounds)}.${esc(eeNi.p)}</div></div>
        </div>
      </div>
    </div>

    <div class="sec" style="margin-top:10px">
      <h2>Statutory payments included in the pay ‘In this employment’ figure above</h2>
      <div class="body">
        <div class="stat">
          <div class="cell">Statutory Maternity Pay<br/><strong>£ ${esc(smp.pounds)}.${esc(smp.p)}</strong></div>
          <div class="cell">Statutory Paternity Pay<br/><strong>£ ${esc(spp.pounds)}.${esc(spp.p)}</strong></div>
          <div class="cell">Statutory Shared Parental Pay<br/><strong>£ ${esc(shpp.pounds)}.${esc(shpp.p)}</strong></div>
          <div class="cell">Statutory Adoption Pay<br/><strong>£ ${esc(sap.pounds)}.${esc(sap.p)}</strong></div>
          <div class="cell">Statutory Parental Bereavement Pay<br/><strong>£ ${esc(spbp.pounds)}.${esc(spbp.p)}</strong></div>
          <div class="cell">Statutory Neonatal Care Pay<br/><strong>£ ${esc(sncp.pounds)}.${esc(sncp.p)}</strong></div>
        </div>
      </div>
    </div>

    <div class="bottom">
      <div class="sec">
        <h2>Other details</h2>
        <div class="body">
          <div class="field"><label>Student Loan deductions in this employment (whole £s only)</label><div class="val">£ 0</div></div>
          <div class="field"><label>Postgraduate Loan deductions in this employment (whole £s only)</label><div class="val">£ 0</div></div>
          <div class="field"><label>To employee</label><div class="val" style="min-height:48px"></div></div>
        </div>
      </div>
      <div class="sec">
        <h2>Certificate by Employer / Paying Office</h2>
        <div class="body">
          <div class="field"><label>Your employer’s full name and address (including postcode)</label>
            <div class="val" style="min-height:64px">${esc(opts.employer.name)}${opts.employer.address ? `<br/>${esc(opts.employer.address)}` : ""}</div>
          </div>
          <div class="field"><label>Employer PAYE reference</label><div class="val">${esc(opts.employer.payeRef || "—")}</div></div>
          <p class="cert">
            I certify that details in the “In this employment” section above show the total
            amount paid to you by me in the year ending 5 April ${esc(endYear)}, for Income Tax purposes,
            and the Income Tax and National Insurance contributions deducted.
          </p>
        </div>
      </div>
    </div>

    <div class="foot">
      <span>P60(Single sheet)(2025 to 2026)</span>
      <span>Do not destroy</span>
      <span>HMRC 12/24</span>
    </div>
  </div>`;

  return printShell(
    `P60 — ${opts.employee.forename} ${opts.employee.surname} (${opts.taxYear})`,
    body,
    css,
  );
}
