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
    return payPeriodForCalendarMonth(y, m + 1);
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

/** Calendar month 1–12 → period 1st–last day, payday = last day (monthly salary). */
export function payPeriodForCalendarMonth(
  year: number,
  month1to12: number,
): { payDate: string; periodStart: string; periodEnd: string } {
  const start = new Date(year, month1to12 - 1, 1);
  const last = new Date(year, month1to12, 0);
  return {
    periodStart: isoDate(start),
    periodEnd: isoDate(last),
    payDate: isoDate(last),
  };
}

/** Last N calendar months including current (newest first) for run-payroll pickers. */
export function recentPayrollMonths(
  count = 12,
  from = new Date(),
): Array<{
  key: string;
  label: string;
  year: number;
  month: number;
  period: ReturnType<typeof payPeriodForCalendarMonth>;
}> {
  const out: Array<{
    key: string;
    label: string;
    year: number;
    month: number;
    period: ReturnType<typeof payPeriodForCalendarMonth>;
  }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const period = payPeriodForCalendarMonth(year, month);
    const label = d.toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
    });
    out.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      label,
      year,
      month,
      period,
    });
  }
  return out;
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
  /** When true, block FPS — product does not emit Directors NIC figures. */
  hasDirectorEmployees?: boolean;
  /** When true, block FPS — student loan YTD/period fields not in FPS builder. */
  hasStudentLoanEmployees?: boolean;
  employees: Array<{
    id: string;
    payrollId: string;
    nino: string;
    gender?: "M" | "F" | null;
    forename?: string;
    surname?: string;
    jobTitle?: string | null;
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
  // Directors use annual-method NIC (AN) when flagged / job title matches.
  // Student loans + PGL are calculated in the PAYE engine and emitted on FPS.
  void opts.hasDirectorEmployees;
  void opts.hasStudentLoanEmployees;
  for (const e of paid) {
    const who = [e.forename, e.surname].filter(Boolean).join(" ") || e.payrollId;
    if (!e.nino?.replace(/\s/g, "").trim()) {
      checks.push({
        level: "error",
        code: "nino",
        message: `NINO is required for HMRC FPS — enter it for ${who} before submitting.`,
      });
    }
    if (!e.forename?.trim() || !e.surname?.trim()) {
      checks.push({
        level: "error",
        code: "name",
        message: `Forename and surname are required for HMRC FPS — complete the name for ${e.payrollId}.`,
      });
    }
    if (e.gender !== "M" && e.gender !== "F") {
      checks.push({
        level: "error",
        code: "gender",
        message: `Gender (M/F) is required for HMRC FPS — set it for ${who} before submitting.`,
      });
    }
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
    employerNiPence: 0,
    studentLoanPence: 0,
    postgraduateLoanPence: 0,
    smpPence: 0,
    sppPence: 0,
    sapPence: 0,
    shppPence: 0,
    spbpPence: 0,
    sncpPence: 0,
  };
  for (const run of runs) {
    const status = String(run.status ?? "");
    if (!["accepted", "submitted", "queued"].includes(status)) continue;
    if (!run.payDate || taxYearFromDate(String(run.payDate)) !== taxYear) continue;
    const lines = Array.isArray(run.lines) ? (run.lines as PayLine[]) : [];
    const line = lines.find((l) => l.employeeId === employeeId);
    if (!line) continue;
    // Reversed payslips drop out of YTD until an amended FPS is filed.
    if ((line as PayLine & { reversed?: boolean }).reversed) continue;
    acc.grossPence += line.grossPence;
    acc.taxablePence =
      (acc.taxablePence ?? 0) + (line.taxablePence ?? line.grossPence);
    acc.taxPence += line.taxPence;
    acc.employeeNiPence += line.employeeNiPence;
    acc.employerNiPence = (acc.employerNiPence ?? 0) + (line.employerNiPence ?? 0);
    acc.studentLoanPence =
      (acc.studentLoanPence ?? 0) + (line.studentLoanPence ?? 0);
    acc.postgraduateLoanPence =
      (acc.postgraduateLoanPence ?? 0) + (line.postgraduateLoanPence ?? 0);
    acc.smpPence = (acc.smpPence ?? 0) + (line.smpPence ?? 0);
    acc.sppPence = (acc.sppPence ?? 0) + (line.sppPence ?? 0);
    acc.sapPence = (acc.sapPence ?? 0) + (line.sapPence ?? 0);
    acc.shppPence = (acc.shppPence ?? 0) + (line.shppPence ?? 0);
    acc.spbpPence = (acc.spbpPence ?? 0) + (line.spbpPence ?? 0);
    acc.sncpPence = (acc.sncpPence ?? 0) + (line.sncpPence ?? 0);
  }
  return acc;
}

/** Previous-employer figures from a P45 for the current tax year. */
export type BroughtForwardYtd = {
  taxYear: string;
  taxablePence: number;
  taxPence: number;
  employeeNiPence: number;
};

/**
 * Combine P45 brought-forward totals with YTD earned under this employer.
 * HMRC expects FPS year-to-date to include previous employment in the same tax year.
 */
export function mergeYtdWithBroughtForward(
  broughtForward: BroughtForwardYtd | null | undefined,
  fromRuns: YtdTotals,
  taxYear: string,
): YtdTotals {
  const bf =
    broughtForward && broughtForward.taxYear === taxYear ? broughtForward : null;
  const runTaxable = fromRuns.taxablePence ?? fromRuns.grossPence;
  return {
    grossPence: (bf?.taxablePence ?? 0) + fromRuns.grossPence,
    taxablePence: (bf?.taxablePence ?? 0) + runTaxable,
    taxPence: (bf?.taxPence ?? 0) + fromRuns.taxPence,
    employeeNiPence: (bf?.employeeNiPence ?? 0) + fromRuns.employeeNiPence,
    employerNiPence: fromRuns.employerNiPence ?? 0,
    studentLoanPence: fromRuns.studentLoanPence ?? 0,
    postgraduateLoanPence: fromRuns.postgraduateLoanPence ?? 0,
    smpPence: fromRuns.smpPence ?? 0,
    sppPence: fromRuns.sppPence ?? 0,
    sapPence: fromRuns.sapPence ?? 0,
    shppPence: fromRuns.shppPence ?? 0,
    spbpPence: fromRuns.spbpPence ?? 0,
    sncpPence: fromRuns.sncpPence ?? 0,
  };
}

/** UK tax month 1–12 from a pay date (6 Apr = month 1). */
export function ukTaxMonthNumber(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m > 4 || (m === 4 && day >= 6)) return m - 3;
  return m + 9;
}

/** e.g. 2025-2026 from an ISO date. */
export function taxYearLongLabel(iso: string): string {
  const short = taxYearFromDate(iso);
  const [a, b] = short.split("-");
  if (!a || !b) return short;
  const start = Number(a) > 50 ? 1900 + Number(a) : 2000 + Number(a);
  const end = Number(b) > 50 ? 1900 + Number(b) : 2000 + Number(b);
  return `${start}-${end}`;
}

function amt(pence: number) {
  return ((pence || 0) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ukDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function renderPayslipHtml(opts: {
  employerName: string;
  payeRef: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: string;
  line: PayLine;
  /** Payslip theme id from payroll settings. */
  template?: string;
}) {
  const line = opts.line;
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const theme = opts.template ?? "hydra_a";
  const taxPeriod = ukTaxMonthNumber(opts.payDate);
  const hoursNum =
    line.hoursPerWeekHundredths > 0
      ? line.hoursPerWeekHundredths / 100
      : 0;
  const hours = hoursNum > 0 ? hoursNum.toFixed(2) : "";
  const basic = line.ordinaryPence || line.grossPence;
  const rateFromLine = Number(
    (line as { hourlyRatePence?: number }).hourlyRatePence ?? 0,
  );
  const ratePence =
    rateFromLine > 0
      ? rateFromLine
      : hoursNum > 0
        ? Math.round(basic / hoursNum)
        : 0;
  const rate = ratePence > 0 ? amt(ratePence) : "";
  const paymentRows: string[] = [];
  paymentRows.push(
    `<tr><td>Basic Pay</td><td class="num">${hours || ""}</td><td class="num">${rate}</td><td class="num">${amt(basic)}</td></tr>`,
  );
  if ((line.overtimePence ?? 0) > 0) {
    paymentRows.push(
      `<tr><td>Overtime</td><td class="num">—</td><td class="num">—</td><td class="num">${amt(line.overtimePence)}</td></tr>`,
    );
  }
  if ((line.holidayPence ?? 0) > 0) {
    paymentRows.push(
      `<tr><td>Holiday Pay</td><td class="num">—</td><td class="num">—</td><td class="num">${amt(line.holidayPence)}</td></tr>`,
    );
  }
  if ((line.sspPence ?? 0) > 0) {
    paymentRows.push(
      `<tr><td>SSP</td><td class="num">—</td><td class="num">—</td><td class="num">${amt(line.sspPence)}</td></tr>`,
    );
  }
  if ((line.smpPence ?? 0) > 0) {
    paymentRows.push(
      `<tr><td>SMP</td><td class="num">—</td><td class="num">—</td><td class="num">${amt(line.smpPence)}</td></tr>`,
    );
  }
  const pensionEe = line.pensionEmployeePence ?? 0;
  const pensionEr = line.pensionEmployerPence ?? 0;
  const deductionRows: string[] = [
    `<tr><td>PAYE Tax</td><td class="num">${amt(line.taxPence)}</td></tr>`,
    `<tr><td>National Insurance</td><td class="num">${amt(line.employeeNiPence)}</td></tr>`,
  ];
  if ((line.studentLoanPence ?? 0) > 0) {
    deductionRows.push(
      `<tr><td>Student loan</td><td class="num">${amt(line.studentLoanPence)}</td></tr>`,
    );
  }
  if ((line.postgraduateLoanPence ?? 0) > 0) {
    deductionRows.push(
      `<tr><td>Postgraduate loan</td><td class="num">${amt(line.postgraduateLoanPence)}</td></tr>`,
    );
  }
  if (pensionEe > 0) {
    deductionRows.push(
      `<tr><td>Pension</td><td class="num">${amt(pensionEe)}</td></tr>`,
    );
  }
  const address = (line.address || "")
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("<br/>");
  const notes = (line.notes ?? [])
    .map((n) => `<p class="note">${escapeHtml(n)}</p>`)
    .join("");

  const displayName = `${escapeHtml(line.forename)} ${escapeHtml(line.surname)}`;
  const taxBasis = opts.frequency === "W1" ? "W1" : "M1";

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Payslip — ${displayName}</title>
  <style>
    :root {
      --ink:#111827;
      --muted:#4b5563;
      --line:#9ca3af;
      --band:#2F5496;
      --soft:#E9F0F8;
    }
    * { box-sizing: border-box; }
    /* A4 portrait proportions matching Sofex sample (~69% content height) */
    @page { size: A4; margin: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); margin: 0; padding: 86px 40px 40px; font-size: 11px; background: #fff; min-height: 297mm; box-sizing: border-box; }
    .sheet { max-width: 515px; margin: 0 auto; width: 100%; }
    .addr { margin-bottom: 14px; line-height: 1.4; font-size: 12px; }
    .id-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
    .id-table th { background: var(--band); color: #fff; text-align: left; padding: 7px 8px; font-size: 10px; font-weight: 700; border: 1px solid var(--band); }
    .id-table td { padding: 7px 8px; border: 1px solid #7390b0; font-size: 11px; background: #fff; }
    .split { display: grid; grid-template-columns: 1.38fr 1fr; gap: 0; border: 1px solid #7390b0; }
    .split > div { min-height: 200px; }
    .split table { width: 100%; border-collapse: collapse; }
    .split th { background: var(--band); color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 700; }
    .split th.num, .split td.num, .sum td.num, .net .val, .er-box .val {
      text-align: right;
      font-variant-numeric: lining-nums tabular-nums;
    }
    .split td { padding: 6px 8px; background: var(--soft); border-bottom: none; vertical-align: top; }
    .split .pay { border-right: 1px solid #7390b0; }
    .split .pay th:nth-child(2), .split .pay td:nth-child(2) { width: 56px; }
    .split .pay th:nth-child(3), .split .pay td:nth-child(3) { width: 56px; }
    .split .pay th:nth-child(4), .split .pay td:nth-child(4) { width: 72px; }
    .sums { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .sum { border: 1px solid #7390b0; }
    .sum h3 { margin: 0; padding: 6px 8px; background: var(--band); color: #fff; font-size: 11px; font-weight: 700; }
    .sum table { width: 100%; border-collapse: collapse; }
    .sum td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; background: #fff; }
    .sum tr:last-child td { border-bottom: none; }
    .meta { border: 1px solid #7390b0; margin-top: 12px; padding: 10px 12px; background: #fff; min-height: 44px; }
    .meta .co { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
    .meta .line { color: var(--ink); font-size: 11px; line-height: 1.4; }
    .foot { display: flex; justify-content: space-between; align-items: stretch; gap: 12px; margin-top: 14px; }
    .er-box { border: 1px solid #7390b0; padding: 10px 12px; min-width: 175px; background: #fff; }
    .er-box .lab { font-size: 11px; }
    .er-box .val { display: inline; font-size: 13px; font-weight: 700; margin-left: 6px; }
    .net { background: var(--soft); border: 1px solid #7390b0; padding: 10px 16px; min-width: 230px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .net .lab { color: var(--band); font-size: 16px; font-weight: 700; }
    .net .val { color: var(--ink); font-size: 16px; font-weight: 700; }
    .actions { display: none; }
    .note { color: var(--muted); margin-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body data-template="${escapeHtml(theme)}">
  <div class="actions"><button type="button" onclick="window.print()">Print / save PDF</button></div>
  <div class="sheet">
    <div class="addr">
      ${address || "—"}
    </div>
    <table class="id-table">
      <thead>
        <tr>
          <th>Employee No</th>
          <th>Employee Name</th>
          <th>Process Date</th>
          <th>National Insurance Number</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(line.payrollId || "")}</td>
          <td>${displayName}</td>
          <td>${ukDate(opts.payDate)}</td>
          <td>${escapeHtml(line.nino)}</td>
        </tr>
      </tbody>
    </table>
    <div class="split">
      <div class="pay">
        <table>
          <thead><tr><th>Payments</th><th class="num">Units</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>${paymentRows.join("")}</tbody>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
          <tbody>${deductionRows.join("")}</tbody>
        </table>
      </div>
    </div>
    <div class="sums">
      <div class="sum">
        <h3>This Period</h3>
        <table>
          <tr><td>Total Gross Pay</td><td class="num">${amt(line.grossPence)}</td></tr>
          <tr><td>Gross for Tax</td><td class="num">${amt(line.taxablePence ?? line.grossPence)}</td></tr>
          <tr><td>Gross for NI</td><td class="num">${amt(line.grossPence)}</td></tr>
          <tr><td>Taxable Benefits</td><td class="num">${amt(0)}</td></tr>
          <tr><td>NI ER</td><td class="num">${amt(line.employerNiPence)}</td></tr>
        </table>
      </div>
      <div class="sum">
        <h3>Year to Date</h3>
        <table>
          <tr><td>Total Gross Pay TD</td><td class="num">${amt(line.ytdGrossPence)}</td></tr>
          <tr><td>Gross for Tax TD</td><td class="num">${amt(line.ytdTaxablePence ?? line.ytdGrossPence)}</td></tr>
          <tr><td>Tax Paid TD</td><td class="num">${amt(line.ytdTaxPence)}</td></tr>
          <tr><td>Gross for NI TD</td><td class="num">${amt(line.ytdGrossPence)}</td></tr>
          <tr><td>National Insurance TD</td><td class="num">${amt(line.ytdEmployeeNiPence)}</td></tr>
        </table>
      </div>
    </div>
    <div class="meta">
      <div class="co">${escapeHtml(opts.employerName)}</div>
      <div class="line">Tax Code: ${escapeHtml(line.taxCode)} ${taxBasis} &nbsp; Tax Period: ${taxPeriod} &nbsp; Frequency: ${freq} &nbsp; Payment Method: BACS &nbsp; PAYE Reference: ${escapeHtml(opts.payeRef)}</div>
    </div>
    <div class="foot">
      <div class="er-box">
        <span class="lab">Employer Pension:</span><span class="val">${amt(pensionEr)}</span>
      </div>
      <div class="net">
        <span class="lab">Net Pay</span>
        <span class="val">${amt(line.netPence)}</span>
      </div>
    </div>
    ${notes}
  </div>
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
  const freq = opts.frequency === "W1" ? "Weekly" : "Monthly";
  const taxYear = taxYearLongLabel(opts.payDate);
  const monthNo = ukTaxMonthNumber(opts.payDate);
  const males = opts.lines.filter((l) => l.gender === "M").length;
  const females = opts.lines.filter((l) => l.gender === "F").length;
  const unknown = opts.lines.length - males - females;
  const totals = opts.lines.reduce(
    (acc, l) => ({
      gross: acc.gross + l.grossPence,
      tax: acc.tax + l.taxPence,
      ni: acc.ni + l.employeeNiPence,
      erNi: acc.erNi + l.employerNiPence,
      eePen: acc.eePen + (l.pensionEmployeePence ?? 0),
      erPen: acc.erPen + (l.pensionEmployerPence ?? 0),
      ssp: acc.ssp + (l.sspPence ?? 0),
      parental:
        acc.parental +
        (l.smpPence ?? 0) +
        (l.sppPence ?? 0) +
        (l.sapPence ?? 0) +
        (l.shppPence ?? 0) +
        (l.spbpPence ?? 0) +
        (l.sncpPence ?? 0),
      dedns: acc.dedns + (l.pensionEmployeePence ?? 0),
      net: acc.net + l.netPence,
    }),
    {
      gross: 0,
      tax: 0,
      ni: 0,
      erNi: 0,
      eePen: 0,
      erPen: 0,
      ssp: 0,
      parental: 0,
      dedns: 0,
      net: 0,
    },
  );
  const rows = opts.lines
    .map((l) => {
      const parental =
        (l.smpPence ?? 0) +
        (l.sppPence ?? 0) +
        (l.sapPence ?? 0) +
        (l.shppPence ?? 0) +
        (l.spbpPence ?? 0) +
        (l.sncpPence ?? 0);
      return `<tr>
      <td>${escapeHtml(l.surname)}, ${escapeHtml(l.forename)}</td>
      <td class="num">${amt(l.netPence)}</td>
      <td class="num">${amt(l.grossPence)}</td>
      <td class="num">${amt(0)}</td>
      <td class="num">${amt(l.sspPence ?? 0)}</td>
      <td class="num">${amt(parental)}</td>
      <td class="num">${amt(l.taxPence)}</td>
      <td class="num">${amt(l.pensionEmployeePence ?? 0)}</td>
      <td class="num">${amt(0)}</td>
      <td class="num">${amt(l.employeeNiPence)}</td>
      <td class="num">${amt(l.employerNiPence)}</td>
      <td class="num">${ukDate(opts.payDate)}</td>
    </tr>`;
    })
    .join("");
  const printed = new Date().toLocaleString("en-GB");

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Payroll Summary for Tax — ${escapeHtml(opts.employerName)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 10px; }
    .sheet { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .sub { color: #444; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 4px 5px; }
    th { background: #f3f4f6; font-size: 9px; text-align: center; vertical-align: bottom; }
    td.num, th.num {
      text-align: right;
      font-family: Arial, Helvetica, sans-serif;
      font-variant-numeric: lining-nums tabular-nums;
      white-space: nowrap;
    }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .stats { margin-top: 10px; }
    .foot { margin-top: 14px; color: #555; display: flex; justify-content: space-between; }
    .actions { margin-bottom: 10px; }
    .actions button { font: inherit; padding: 8px 14px; cursor: pointer; }
    @media print { .actions { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Print / save PDF</button></div>
  <div class="sheet">
    <h1>Payroll Summary for Tax</h1>
    <p class="sub">
      <strong>${escapeHtml(opts.employerName)}</strong>
      &nbsp;|&nbsp; Tax year ${escapeHtml(taxYear)}
      &nbsp;|&nbsp; ${freq === "Weekly" ? "Week" : "Month"} ${monthNo}
      &nbsp;|&nbsp; PAYE ${escapeHtml(opts.payeRef)}
      &nbsp;|&nbsp; Period ${ukDate(opts.periodStart)} – ${ukDate(opts.periodEnd)}
    </p>
    <table>
      <thead>
        <tr>
          <th>Employee Name</th>
          <th class="num">Net Pay</th>
          <th class="num">Gross Pay</th>
          <th class="num">BF Round</th>
          <th class="num">SSP</th>
          <th class="num">Statutory Parental Leave</th>
          <th class="num">Tax Paid</th>
          <th class="num">Dedns</th>
          <th class="num">CF Round</th>
          <th class="num">Net Ee NI</th>
          <th class="num">Net Er NI</th>
          <th class="num">Payslip Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>TOTALS</td>
          <td class="num">${amt(totals.net)}</td>
          <td class="num">${amt(totals.gross)}</td>
          <td class="num">${amt(0)}</td>
          <td class="num">${amt(totals.ssp)}</td>
          <td class="num">${amt(totals.parental)}</td>
          <td class="num">${amt(totals.tax)}</td>
          <td class="num">${amt(totals.dedns)}</td>
          <td class="num">${amt(0)}</td>
          <td class="num">${amt(totals.ni)}</td>
          <td class="num">${amt(totals.erNi)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    <p class="stats">
      Male: ${males} &nbsp; Female: ${females}${unknown ? ` &nbsp; Unspecified: ${unknown}` : ""} &nbsp; Total: ${opts.lines.length}
      &nbsp;·&nbsp; Employer pension this period ${amt(totals.erPen)}
    </p>
    <div class="foot">
      <span>Printed on: ${escapeHtml(printed)}</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
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
