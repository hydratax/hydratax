import type { PayFrequency, PayLine, YtdTotals } from "@/server/hmrc/payroll";

export function generatePayrollId(existing: string[]): string {
  const used = new Set(existing.map((id) => id.toUpperCase()));
  for (let i = 0; i < 40; i++) {
    const candidate = `HY${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!used.has(candidate)) return candidate;
  }
  return `HY${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

export function taxYearFromDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (month < 4 || (month === 4 && day < 6)) {
    const start = year - 1;
    return `${String(start).slice(2)}-${String(year).slice(2)}`;
  }
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

export function taxYearStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const startYear = month < 4 || (month === 4 && day < 6) ? year - 1 : year;
  return `${startYear}-04-06`;
}

export function defaultPayPeriod(
  frequency: PayFrequency,
  from = new Date(),
): { payDate: string; periodStart: string; periodEnd: string } {
  const y = from.getFullYear();
  const m = from.getMonth();
  if (frequency === "M1") {
    const last = new Date(y, m + 1, 0);
    const start = new Date(y, m, 1);
    return {
      periodStart: isoDate(start),
      periodEnd: isoDate(last),
      payDate: isoDate(last),
    };
  }
  const day = from.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(from);
  start.setDate(from.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    periodStart: isoDate(start),
    periodEnd: isoDate(end),
    payDate: isoDate(end),
  };
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type PayrollCheck = {
  level: "error" | "warn" | "ok";
  code: string;
  message: string;
};

export function preflightPayRun(opts: {
  payeRef?: string | null;
  accountsOfficeRef?: string | null;
  isEmployer?: boolean;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: PayFrequency;
  employees: Array<{
    id: string;
    payrollId: string;
    nino: string;
    startDate: string;
    leaveDate?: string | null;
    active: boolean;
    firstFpsSent?: boolean;
  }>;
}): PayrollCheck[] {
  const checks: PayrollCheck[] = [];
  if (!opts.isEmployer) {
    checks.push({
      level: "error",
      code: "not_employer",
      message: "Turn on employer status for this client before running payroll.",
    });
  }
  if (!opts.payeRef) {
    checks.push({
      level: "error",
      code: "paye_ref",
      message: "PAYE reference is missing — HMRC cannot match the FPS.",
    });
  }
  if (!opts.accountsOfficeRef) {
    checks.push({
      level: "error",
      code: "ao_ref",
      message: "Accounts Office reference is missing.",
    });
  }
  const paid = opts.employees.filter((e) => e.active && !leftBeforePeriod(e, opts.periodStart));
  if (paid.length === 0) {
    checks.push({
      level: "error",
      code: "no_staff",
      message: "No active employees in this period. Send an EPS (no payment) instead of an FPS.",
    });
  }
  const ids = paid.map((e) => e.payrollId.toUpperCase());
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) {
    checks.push({
      level: "error",
      code: "dup_pid",
      message: `Payroll ID ${dup} is used more than once. Reusing IDs creates split RTI records at HMRC.`,
    });
  }
  if (opts.payDate > opts.periodEnd) {
    checks.push({
      level: "warn",
      code: "pay_after_period",
      message: "Pay date is after the period end — check this is intentional.",
    });
  }
  const today = isoDate(new Date());
  if (opts.payDate < today) {
    checks.push({
      level: "warn",
      code: "late_rti",
      message:
        "RTI must be sent on or before payday. This pay date is in the past — HMRC may treat the FPS as late.",
    });
  }
  for (const e of paid) {
    if (e.startDate > opts.payDate && !e.firstFpsSent) {
      checks.push({
        level: "warn",
        code: "start_after_pay",
        message: `A starter’s start date is after payday — confirm they should be on this run.`,
      });
      break;
    }
  }
  if (checks.every((c) => c.level !== "error")) {
    checks.unshift({
      level: "ok",
      code: "ready",
      message: `Ready to preview ${paid.length} employee${paid.length === 1 ? "" : "s"} for a ${opts.frequency === "W1" ? "weekly" : "monthly"} FPS.`,
    });
  }
  return checks;
}

function leftBeforePeriod(
  e: { leaveDate?: string | null },
  periodStart: string,
) {
  return Boolean(e.leaveDate && e.leaveDate < periodStart);
}

export function ytdFromRuns(
  employeeId: string,
  taxYear: string,
  runs: Array<{
    payDate?: string;
    status?: string;
    lines?: PayLine[] | unknown;
  }>,
): YtdTotals {
  const acc: YtdTotals = {
    grossPence: 0,
    taxablePence: 0,
    taxPence: 0,
    employeeNiPence: 0,
  };
  for (const run of runs) {
    const status = String(run.status ?? "");
    if (!["accepted", "submitted", "queued"].includes(status)) continue;
    if (!run.payDate || taxYearFromDate(String(run.payDate)) !== taxYear) continue;
    const lines = Array.isArray(run.lines) ? (run.lines as PayLine[]) : [];
    const line = lines.find((l) => l.employeeId === employeeId);
    if (!line) continue;
    acc.grossPence += line.grossPence;
    acc.taxablePence = (acc.taxablePence ?? 0) + (line.taxablePence ?? line.grossPence);
    acc.taxPence += line.taxPence;
    acc.employeeNiPence += line.employeeNiPence;
  }
  return acc;
}

export function renderPayslipHtml(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  line: PayLine;
}) {
  const gbp = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(n / 100);
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const extra: string[] = [];
  if ((opts.line.ordinaryPence ?? 0) > 0 && (opts.line.ordinaryPence ?? 0) !== opts.line.grossPence) {
    extra.push(
      `<tr><td>Ordinary pay</td><td class="num">${gbp(opts.line.ordinaryPence)}</td><td class="num">—</td></tr>`,
    );
  }
  if ((opts.line.overtimePence ?? 0) > 0) {
    extra.push(
      `<tr><td>Overtime</td><td class="num">${gbp(opts.line.overtimePence)}</td><td class="num">—</td></tr>`,
    );
  }
  if ((opts.line.holidayPence ?? 0) > 0) {
    extra.push(
      `<tr><td>Holiday pay</td><td class="num">${gbp(opts.line.holidayPence)}</td><td class="num">—</td></tr>`,
    );
  }
  if ((opts.line.sspPence ?? 0) > 0) {
    extra.push(
      `<tr><td>Statutory sick pay</td><td class="num">${gbp(opts.line.sspPence)}</td><td class="num">—</td></tr>`,
    );
  }
  if ((opts.line.smpPence ?? 0) > 0) {
    extra.push(
      `<tr><td>Statutory maternity pay</td><td class="num">${gbp(opts.line.smpPence)}</td><td class="num">—</td></tr>`,
    );
  }
  const pensionEe = opts.line.pensionEmployeePence ?? 0;
  const pensionEr = opts.line.pensionEmployerPence ?? 0;
  const notes = (opts.line.notes ?? [])
    .map((n) => `<p class="muted">${escapeHtml(n)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Payslip — ${escapeHtml(opts.line.forename)} ${escapeHtml(opts.line.surname)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; color: #0a0a0a; margin: 32px; }
    h1 { font-size: 22px; margin: 0; }
    .muted { color: #3a4248; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #d0d7dd; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .net { font-size: 20px; font-weight: 700; color: #0f766e; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <p class="muted">HydraTax payroll · ${freq} payslip</p>
  <h1>${escapeHtml(opts.employerName)}</h1>
  <p class="muted">PAYE ${escapeHtml(opts.payeRef)} · Pay date ${escapeHtml(opts.payDate)} · Period ${escapeHtml(opts.periodStart)} to ${escapeHtml(opts.periodEnd)}</p>
  <p><strong>${escapeHtml(opts.line.forename)} ${escapeHtml(opts.line.surname)}</strong><br/>
  Payroll ID ${escapeHtml(opts.line.payrollId)} · NI ${escapeHtml(opts.line.nino)} · Tax code ${escapeHtml(opts.line.taxCode)}</p>
  <table>
    <thead><tr><th>Item</th><th class="num">This period</th><th class="num">Year to date</th></tr></thead>
    <tbody>
      ${extra.join("\n")}
      <tr><td>Gross pay</td><td class="num">${gbp(opts.line.grossPence)}</td><td class="num">${gbp(opts.line.ytdGrossPence)}</td></tr>
      <tr><td>PAYE tax</td><td class="num">${gbp(opts.line.taxPence)}</td><td class="num">${gbp(opts.line.ytdTaxPence)}</td></tr>
      <tr><td>Employee NI</td><td class="num">${gbp(opts.line.employeeNiPence)}</td><td class="num">${gbp(opts.line.ytdEmployeeNiPence)}</td></tr>
      ${
        pensionEe
          ? `<tr><td>Workplace pension (employee 5%)</td><td class="num">${gbp(pensionEe)}</td><td class="num">—</td></tr>`
          : ""
      }
      <tr><td>Employer NI (not deducted)</td><td class="num">${gbp(opts.line.employerNiPence)}</td><td class="num">—</td></tr>
      ${
        pensionEr
          ? `<tr><td>Workplace pension (employer 3%, not deducted)</td><td class="num">${gbp(pensionEr)}</td><td class="num">—</td></tr>`
          : ""
      }
    </tbody>
  </table>
  <p class="net">Net pay ${gbp(opts.line.netPence)}</p>
  ${notes}
  <p class="muted">Figures use HydraTax’s integer-pence PAYE engine for 2026/27 HMRC rates (SSP from day 1, SMP, statutory holiday accrual, auto-enrolment qualifying earnings). Confirm unusual cases against HMRC calculators before paying.</p>
</body>
</html>`;
}

export function renderPayrollSummaryHtml(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  lines: PayLine[];
}) {
  const gbp = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(n / 100);
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const totals = opts.lines.reduce(
    (acc, l) => ({
      gross: acc.gross + l.grossPence,
      tax: acc.tax + l.taxPence,
      ni: acc.ni + l.employeeNiPence,
      erNi: acc.erNi + l.employerNiPence,
      eePen: acc.eePen + (l.pensionEmployeePence ?? 0),
      erPen: acc.erPen + (l.pensionEmployerPence ?? 0),
      ssp: acc.ssp + (l.sspPence ?? 0),
      smp: acc.smp + (l.smpPence ?? 0),
      hol: acc.hol + (l.holidayPence ?? 0),
      net: acc.net + l.netPence,
    }),
    { gross: 0, tax: 0, ni: 0, erNi: 0, eePen: 0, erPen: 0, ssp: 0, smp: 0, hol: 0, net: 0 },
  );
  const rows = opts.lines
    .map(
      (l) => `<tr>
      <td>${escapeHtml(l.forename)} ${escapeHtml(l.surname)}</td>
      <td>${escapeHtml(l.payrollId)}</td>
      <td class="num">${gbp(l.grossPence)}</td>
      <td class="num">${gbp(l.sspPence ?? 0)}</td>
      <td class="num">${gbp(l.smpPence ?? 0)}</td>
      <td class="num">${gbp(l.holidayPence ?? 0)}</td>
      <td class="num">${gbp(l.taxPence)}</td>
      <td class="num">${gbp(l.employeeNiPence)}</td>
      <td class="num">${gbp(l.pensionEmployeePence ?? 0)}</td>
      <td class="num">${gbp(l.netPence)}</td>
    </tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Payroll summary — ${escapeHtml(opts.employerName)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; color: #0a0a0a; margin: 32px; }
    h1 { font-size: 22px; margin: 0; }
    .muted { color: #3a4248; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #d0d7dd; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <p class="muted">HydraTax payroll · ${freq} summary</p>
  <h1>${escapeHtml(opts.employerName)}</h1>
  <p class="muted">PAYE ${escapeHtml(opts.payeRef)} · Pay date ${escapeHtml(opts.payDate)} · Period ${escapeHtml(opts.periodStart)} to ${escapeHtml(opts.periodEnd)}</p>
  <table>
    <thead>
      <tr>
        <th>Employee</th><th>Payroll ID</th>
        <th class="num">Gross</th><th class="num">SSP</th><th class="num">SMP</th>
        <th class="num">Holiday</th><th class="num">PAYE</th><th class="num">EE NI</th>
        <th class="num">EE pension</th><th class="num">Net</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2"><strong>Totals</strong></td>
        <td class="num"><strong>${gbp(totals.gross)}</strong></td>
        <td class="num">${gbp(totals.ssp)}</td>
        <td class="num">${gbp(totals.smp)}</td>
        <td class="num">${gbp(totals.hol)}</td>
        <td class="num">${gbp(totals.tax)}</td>
        <td class="num">${gbp(totals.ni)}</td>
        <td class="num">${gbp(totals.eePen)}</td>
        <td class="num"><strong>${gbp(totals.net)}</strong></td>
      </tr>
    </tfoot>
  </table>
  <p class="muted">Employer NI this period ${gbp(totals.erNi)}. Employer pension (3% of qualifying earnings) ${gbp(totals.erPen)}. This file is password-protected — share the password separately.</p>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
