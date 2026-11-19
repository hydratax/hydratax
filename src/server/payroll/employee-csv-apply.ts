/**
 * Session-free employee CSV apply for desk import + bulk job worker.
 * Match key: NI number. Money columns are £ strings → integer pence.
 * Prefers service-role Supabase writes so cron/workers can run without a user session.
 */

import { generatePayrollId, taxYearFromDate } from "@/lib/payroll";
import { poundsToPence } from "@/server/money/pence";
import {
  deskInsertEmployee,
  deskListEmployees,
  deskUpdateEmployee,
  isDeskStoreConfigured,
} from "@/server/db/desk-store";
import {
  parseEmployeeCsv,
  type ParsedEmployeeCsvRow,
} from "@/server/payroll/employee-csv";

export type EmployeeCsvApplyResult = {
  created: number;
  updated: number;
  skipped: number;
  ok: boolean;
  errors: { rowNumber: number; message: string }[];
};

function hoursToHundredths(s: string | undefined): number {
  if (!s?.trim()) return 3750;
  const n = Number(String(s).trim());
  if (!Number.isFinite(n) || n <= 0) return 3750;
  return Math.round(n * 100);
}

function mapExisting(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    id: String(r.id),
    nino: String(r.nino || "")
      .replace(/\s+/g, "")
      .toUpperCase(),
    payrollId: String(r.payroll_id || r.payrollId || ""),
    active: r.active !== false && r.active !== 0,
  }));
}

function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function listExisting(clientId: string) {
  if (hasServiceRole()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .select("id, nino, payroll_id, active")
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
    return mapExisting((data ?? []) as Record<string, unknown>[]);
  }
  if (isDeskStoreConfigured()) {
    const rows = await deskListEmployees(clientId);
    if (rows) return mapExisting(rows as Record<string, unknown>[]);
  }
  return [];
}

async function insertEmployee(row: Record<string, unknown>) {
  if (hasServiceRole()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin().from("employees").insert(row);
    if (error) throw new Error(error.message);
    return;
  }
  await deskInsertEmployee(row);
}

async function updateEmployee(
  employeeId: string,
  clientId: string,
  patch: Record<string, unknown>,
) {
  if (hasServiceRole()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin()
      .from("employees")
      .update(patch)
      .eq("id", employeeId)
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
    return;
  }
  await deskUpdateEmployee(employeeId, clientId, patch);
}

function moneyPence(pounds: string | undefined): number {
  if (!pounds?.trim()) return 0;
  return Number(poundsToPence(pounds));
}

function buildRowFields(row: ParsedEmployeeCsvRow) {
  const hoursPerWeek = hoursToHundredths(row.hoursPerWeek);
  const hourlyRatePence = moneyPence(row.hourlyRatePounds);
  let annualSalaryPence = moneyPence(row.annualSalaryPounds);
  if (annualSalaryPence <= 0 && hourlyRatePence > 0) {
    annualSalaryPence = Math.round((hourlyRatePence * hoursPerWeek * 52) / 100);
  }
  const bfTaxablePence = moneyPence(row.bfTaxablePounds);
  const bfTaxPence = moneyPence(row.bfTaxPounds);
  const bfEmployeeNiPence = moneyPence(row.bfEmployeeNiPounds);
  const bfTaxYear =
    bfTaxablePence > 0 || bfTaxPence > 0 || bfEmployeeNiPence > 0
      ? row.bfTaxYear?.trim() || taxYearFromDate(row.startDate)
      : null;

  return {
    forename: row.forename,
    surname: row.surname,
    nino: row.nino,
    gender: row.gender,
    date_of_birth: row.dateOfBirth ?? null,
    address: row.address ?? null,
    tax_code: row.taxCode,
    annual_salary_pence: annualSalaryPence,
    start_date: row.startDate,
    pay_frequency: row.payFrequency,
    ni_category: row.niCategory,
    job_title: row.jobTitle ?? null,
    starter_declaration: row.starterDeclaration,
    hours_per_week: hoursPerWeek,
    hourly_rate_pence: hourlyRatePence,
    pay_basis: row.payBasis,
    pension_opt_out: row.pensionOptOut,
    ssp_qualifying_days: row.sspQualifyingDays ?? 5,
    tax_basis: row.taxBasis,
    student_loan_plan: row.studentLoanPlan ?? null,
    postgraduate_loan: row.postgraduateLoan,
    is_director: row.isDirector,
    directors_nic_method: row.directorsNicMethod,
    bank_sort_code: row.bankSortCode ?? null,
    bank_account_number: row.bankAccountNumber ?? null,
    bank_account_name: row.bankAccountName ?? null,
    bf_tax_year: bfTaxYear,
    bf_taxable_pence: bfTaxablePence,
    bf_tax_pence: bfTaxPence,
    bf_employee_ni_pence: bfEmployeeNiPence,
  };
}

/**
 * Apply HydraTax canonical employee CSV to one client.
 * Does not enforce session — caller must authorise practice scope.
 */
export async function applyEmployeeCsvToClient(opts: {
  clientId: string;
  csvText: string;
}): Promise<EmployeeCsvApplyResult> {
  const parsed = parseEmployeeCsv(opts.csvText);
  if (parsed.rows.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: parsed.errors.length,
      ok: false,
      errors: parsed.errors,
    };
  }

  const existing = await listExisting(opts.clientId);
  const byNino = new Map(existing.map((e) => [e.nino, e]));
  const usedPayrollIds = existing.map((e) => e.payrollId);

  let created = 0;
  let updated = 0;
  let skipped = parsed.errors.length;

  for (const row of parsed.rows) {
    try {
      const fields = buildRowFields(row);
      if (fields.annual_salary_pence <= 0 && fields.hourly_rate_pence <= 0) {
        skipped += 1;
        continue;
      }
      const match = byNino.get(row.nino);
      if (match) {
        await updateEmployee(match.id, opts.clientId, fields);
        updated += 1;
      } else {
        const payrollId =
          row.payrollId?.trim() || generatePayrollId(usedPayrollIds);
        usedPayrollIds.push(payrollId);
        const id = crypto.randomUUID();
        await insertEmployee({
          id,
          client_id: opts.clientId,
          ...fields,
          payroll_id: payrollId,
          leave_date: null,
          first_fps_sent: false,
          previous_payroll_id: null,
          active: true,
        });
        byNino.set(row.nino, {
          id,
          nino: row.nino,
          payrollId,
          active: true,
        });
        created += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return {
    created,
    updated,
    skipped,
    ok: created + updated > 0,
    errors: parsed.errors,
  };
}
