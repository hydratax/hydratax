/**
 * Exit / leaving-HydraTax payroll CSV export (backend only — no desk UI).
 * Employees CSV mirrors the import template headers so round-trip remapping
 * into Sage / Xero / QB / QTAC is straightforward.
 */

import { penceToPounds } from "@/server/money/pence";
import {
  EMPLOYEE_CSV_HEADERS,
  type EmployeeCsvHeader,
} from "@/server/payroll/employee-csv";
import {
  deskListEmployees,
  deskListPayRuns,
  isDeskStoreConfigured,
} from "@/server/db/desk-store";

export type MigrationExportFile = {
  filename: string;
  csv: string;
  contentType: "text/csv; charset=utf-8";
};

export type ClientPayrollMigrationExport = {
  clientId: string;
  files: MigrationExportFile[];
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function poundsFromPence(pence: unknown): string {
  const n = Number(pence ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  return penceToPounds(n);
}

function hoursFromHundredths(h: unknown): string {
  const n = Number(h ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n / 100);
}

function parseAddress(raw: unknown): {
  street: string;
  city: string;
  postcode: string;
} {
  if (!raw) return { street: "", city: "", postcode: "" };
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as Record<string, string>;
      return {
        street: j.street || "",
        city: j.city || "",
        postcode: j.postcode || "",
      };
    } catch {
      return { street: raw, city: "", postcode: "" };
    }
  }
  if (typeof raw === "object" && raw) {
    const j = raw as Record<string, string>;
    return {
      street: j.street || "",
      city: j.city || "",
      postcode: j.postcode || "",
    };
  }
  return { street: "", city: "", postcode: "" };
}

function boolStr(v: unknown): string {
  return v === true || v === 1 || v === "true" ? "true" : "false";
}

/** Extra columns beyond the import template (safe for destination systems to ignore). */
export const EMPLOYEE_EXPORT_EXTRA_HEADERS = [
  "leave_date",
  "active",
  "first_fps_sent",
  "employee_id",
] as const;

export const EMPLOYEE_EXPORT_HEADERS = [
  ...EMPLOYEE_CSV_HEADERS,
  ...EMPLOYEE_EXPORT_EXTRA_HEADERS,
] as const;

function employeeRowCells(row: Record<string, unknown>): string[] {
  const addr = parseAddress(row.address);
  const cells: Record<EmployeeCsvHeader | (typeof EMPLOYEE_EXPORT_EXTRA_HEADERS)[number], string> = {
    forename: String(row.forename ?? ""),
    surname: String(row.surname ?? ""),
    nino: String(row.nino ?? "").replace(/\s+/g, "").toUpperCase(),
    gender: String(row.gender ?? "M").toUpperCase().startsWith("F") ? "F" : "M",
    date_of_birth: String(row.date_of_birth ?? row.dateOfBirth ?? ""),
    address_street: addr.street,
    address_city: addr.city,
    address_postcode: addr.postcode,
    tax_code: String(row.tax_code ?? row.taxCode ?? ""),
    tax_basis: String(row.tax_basis ?? row.taxBasis ?? "cumulative"),
    ni_category: String(row.ni_category ?? row.niCategory ?? "A"),
    annual_salary: poundsFromPence(row.annual_salary_pence ?? row.annualSalaryPence),
    hourly_rate: poundsFromPence(row.hourly_rate_pence ?? row.hourlyRatePence),
    hours_per_week: hoursFromHundredths(row.hours_per_week ?? row.hoursPerWeek),
    pay_basis: String(row.pay_basis ?? row.payBasis ?? "salary"),
    pay_frequency: String(row.pay_frequency ?? row.payFrequency ?? "M1"),
    start_date: String(row.start_date ?? row.startDate ?? ""),
    job_title: String(row.job_title ?? row.jobTitle ?? ""),
    payroll_id: String(row.payroll_id ?? row.payrollId ?? ""),
    starter_declaration: String(row.starter_declaration ?? row.starterDeclaration ?? "A"),
    is_director: boolStr(row.is_director ?? row.isDirector),
    directors_nic_method: String(row.directors_nic_method ?? row.directorsNicMethod ?? "AN"),
    student_loan_plan: String(row.student_loan_plan ?? row.studentLoanPlan ?? ""),
    postgraduate_loan: boolStr(row.postgraduate_loan ?? row.postgraduateLoan),
    pension_opt_out: boolStr(row.pension_opt_out ?? row.pensionOptOut),
    ssp_qualifying_days: String(row.ssp_qualifying_days ?? row.sspQualifyingDays ?? ""),
    bank_sort_code: String(row.bank_sort_code ?? row.bankSortCode ?? ""),
    bank_account_number: String(row.bank_account_number ?? row.bankAccountNumber ?? ""),
    bank_account_name: String(row.bank_account_name ?? row.bankAccountName ?? ""),
    bf_tax_year: String(row.bf_tax_year ?? row.bfTaxYear ?? ""),
    bf_taxable: poundsFromPence(row.bf_taxable_pence ?? row.bfTaxablePence),
    bf_tax: poundsFromPence(row.bf_tax_pence ?? row.bfTaxPence),
    bf_employee_ni: poundsFromPence(row.bf_employee_ni_pence ?? row.bfEmployeeNiPence),
    leave_date: String(row.leave_date ?? row.leaveDate ?? ""),
    active: boolStr(row.active !== false && row.active !== 0),
    first_fps_sent: boolStr(row.first_fps_sent ?? row.firstFpsSent),
    employee_id: String(row.id ?? ""),
  };
  return EMPLOYEE_EXPORT_HEADERS.map((h) => csvEscape(cells[h] ?? ""));
}

/** Build employees.csv text (import headers + extras). */
export function buildEmployeesMigrationCsv(
  employees: Record<string, unknown>[],
): string {
  const lines = [EMPLOYEE_EXPORT_HEADERS.join(",")];
  for (const row of employees) {
    lines.push(employeeRowCells(row).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function buildPayRunsSummaryCsv(
  payRuns: Record<string, unknown>[],
): string {
  const header = [
    "pay_run_id",
    "pay_date",
    "period_start",
    "period_end",
    "pay_frequency",
    "kind",
    "status",
    "hmrc_correlation_id",
    "submitted_at",
  ];
  const lines = [header.join(",")];
  for (const r of payRuns) {
    lines.push(
      [
        csvEscape(String(r.id ?? "")),
        csvEscape(String(r.pay_date ?? r.payDate ?? "")),
        csvEscape(String(r.period_start ?? r.periodStart ?? "")),
        csvEscape(String(r.period_end ?? r.periodEnd ?? "")),
        csvEscape(String(r.pay_frequency ?? r.payFrequency ?? "")),
        csvEscape(String(r.kind ?? "")),
        csvEscape(String(r.status ?? "")),
        csvEscape(String(r.hmrc_correlation_id ?? r.hmrcCorrelationId ?? "")),
        csvEscape(String(r.submitted_at ?? r.submittedAt ?? "")),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function loadEmployees(clientId: string): Promise<Record<string, unknown>[]> {
  if (isDeskStoreConfigured()) {
    const rows = await deskListEmployees(clientId);
    if (rows) return rows as Record<string, unknown>[];
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }
  return [];
}

async function loadPayRuns(clientId: string): Promise<Record<string, unknown>[]> {
  if (isDeskStoreConfigured()) {
    const rows = await deskListPayRuns(clientId);
    if (rows) return rows as Record<string, unknown>[];
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("pay_runs")
      .select(
        "id, pay_date, period_start, period_end, pay_frequency, kind, status, hmrc_correlation_id, submitted_at",
      )
      .eq("client_id", clientId)
      .order("pay_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }
  return [];
}

/**
 * Export one client's payroll-relevant CSVs.
 * Callable from code/tests/internal routes — not wired to desk UI.
 */
export async function exportClientPayrollMigrationCsv(
  clientId: string,
): Promise<ClientPayrollMigrationExport> {
  const id = String(clientId || "").trim();
  if (!id) throw new Error("clientId required");

  const [employees, payRuns] = await Promise.all([
    loadEmployees(id),
    loadPayRuns(id),
  ]);

  const files: MigrationExportFile[] = [
    {
      filename: "employees.csv",
      csv: buildEmployeesMigrationCsv(employees),
      contentType: "text/csv; charset=utf-8",
    },
    {
      filename: "pay-runs-summary.csv",
      csv: buildPayRunsSummaryCsv(payRuns),
      contentType: "text/csv; charset=utf-8",
    },
  ];

  return { clientId: id, files };
}

/**
 * Build a simple ZIP (store method only) of migration CSVs — no compression
 * dependency. Suitable for internal download later.
 */
export function buildMigrationZipStoreOnly(
  files: MigrationExportFile[],
): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.filename, "utf8");
    const data = Buffer.from(file.csv, "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc skipped (0) — OK for internal tooling
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const cen = Buffer.alloc(46 + name.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    name.copy(cen, 46);

    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralBuf, end]);
}

/** Convenience: employees + pay-run summary as one zip buffer. */
export async function exportClientPayrollMigrationZip(
  clientId: string,
): Promise<{ clientId: string; filename: string; zip: Buffer }> {
  const exported = await exportClientPayrollMigrationCsv(clientId);
  return {
    clientId: exported.clientId,
    filename: `hydratax-payroll-export-${exported.clientId}.zip`,
    zip: buildMigrationZipStoreOnly(exported.files),
  };
}
