/**
 * P32-style employer liability summary from pay-run aggregates.
 * Desk-friendly HTML (not an official HMRC blank) — grabee can align later if needed.
 */

import { formatGBP } from "@/server/money/pence";

export type P32PeriodTotals = {
  periodLabel: string;
  payDate: string;
  taxPence: number;
  employeeNiPence: number;
  employerNiPence: number;
  studentLoanPence: number;
  postgraduateLoanPence: number;
  /** SMP recovered YTD etc. — optional until EPS recoverables live. */
  smpRecoveredPence?: number;
};

export type P32Summary = {
  employerName: string;
  payeRef: string;
  taxYear: string;
  periods: P32PeriodTotals[];
};

export function aggregateP32(summary: P32Summary): {
  taxPence: number;
  employeeNiPence: number;
  employerNiPence: number;
  studentLoanPence: number;
  postgraduateLoanPence: number;
  duePence: number;
} {
  const taxPence = summary.periods.reduce((s, p) => s + p.taxPence, 0);
  const employeeNiPence = summary.periods.reduce((s, p) => s + p.employeeNiPence, 0);
  const employerNiPence = summary.periods.reduce((s, p) => s + p.employerNiPence, 0);
  const studentLoanPence = summary.periods.reduce((s, p) => s + p.studentLoanPence, 0);
  const postgraduateLoanPence = summary.periods.reduce(
    (s, p) => s + p.postgraduateLoanPence,
    0,
  );
  const recovered = summary.periods.reduce(
    (s, p) => s + (p.smpRecoveredPence ?? 0),
    0,
  );
  const duePence =
    taxPence +
    employeeNiPence +
    employerNiPence +
    studentLoanPence +
    postgraduateLoanPence -
    recovered;
  return {
    taxPence,
    employeeNiPence,
    employerNiPence,
    studentLoanPence,
    postgraduateLoanPence,
    duePence,
  };
}

export function renderP32Html(summary: P32Summary): string {
  const tot = aggregateP32(summary);
  const rows = summary.periods
    .map(
      (p) => `<tr>
      <td>${escape(p.periodLabel)}</td>
      <td>${escape(p.payDate)}</td>
      <td class="num">${formatGBP(p.taxPence)}</td>
      <td class="num">${formatGBP(p.employeeNiPence)}</td>
      <td class="num">${formatGBP(p.employerNiPence)}</td>
      <td class="num">${formatGBP(p.studentLoanPence + p.postgraduateLoanPence)}</td>
    </tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Employer payment summary — ${escape(summary.employerName)}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;margin:2rem;}
    h1{font-size:1.4rem;margin:0 0 .25rem;}
    .meta{color:#444;margin-bottom:1.5rem;}
    table{width:100%;border-collapse:collapse;font-size:.95rem;}
    th,td{border-bottom:1px solid #ccc;padding:.4rem .3rem;text-align:left;}
    .num{
      text-align:right;
      font-family:Arial,Helvetica,sans-serif;
      font-variant-numeric:lining-nums tabular-nums;
    }
    tfoot td{font-weight:700;}
  </style>
</head>
<body>
  <h1>Amounts due to HMRC</h1>
  <p class="meta">${escape(summary.employerName)} · PAYE ${escape(summary.payeRef)} · ${escape(summary.taxYear)}</p>
  <table>
    <thead>
      <tr>
        <th>Period</th><th>Pay date</th><th class="num">PAYE tax</th>
        <th class="num">Employee NI</th><th class="num">Employer NI</th>
        <th class="num">Student / PGL</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total</td>
        <td class="num">${formatGBP(tot.taxPence)}</td>
        <td class="num">${formatGBP(tot.employeeNiPence)}</td>
        <td class="num">${formatGBP(tot.employerNiPence)}</td>
        <td class="num">${formatGBP(tot.studentLoanPence + tot.postgraduateLoanPence)}</td>
      </tr>
      <tr>
        <td colspan="5">Net due</td>
        <td class="num">${formatGBP(tot.duePence)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
