"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore, type MemoryEmployee } from "@/server/demo/store";
import { employeeInputSchema } from "@/server/money/schemas";
import { poundsToPence } from "@/server/money/pence";
import {
  buildEpsXml,
  buildFpsXml,
  calculatePeriodPay,
  type PayFrequency,
  type PayLine,
} from "@/server/hmrc/payroll";
import { submitRtiXml } from "@/server/hmrc/payroll";
import { appendAuditEvent } from "@/server/audit/log";
import {
  generatePayrollId,
  preflightPayRun,
  taxYearFromDate,
  ytdFromRuns,
  mergeYtdWithBroughtForward,
  type BroughtForwardYtd,
} from "@/lib/payroll";
import { ensurePayrollSchema } from "@/server/db/ensure-payroll-schema";
import { addressIdentityComplete } from "@/lib/address-parts";
import {
  matchTimesheetRow,
  parseTimesheetBuffer,
  timesheetTemplateBuffer,
  type TimesheetRow,
} from "@/server/payroll/timesheet";
import {
  buildEmployeePayslipPackZip,
  buildPayrollPackZip,
} from "@/server/payroll/pack";
import { decryptSecret, encryptSecret } from "@/server/hmrc/crypto";
import type { TimesheetAdjustments } from "@/server/payroll/statutory";
import { hasDatabase, tryGetDb } from "@/server/db";
import {
  getSupabaseDataClient,
  mapSnakeCaseRow,
} from "@/server/db/supabase-data";
import {
  isDeskStoreConfigured,
  deskListEmployees,
  deskInsertEmployee,
  deskUpdateEmployee,
  deskMarkEmployeesFpsSent,
  deskListPayRuns,
  deskInsertPayRun,
  deskUpdatePayRun,
  deskListTimesheets,
  deskUpsertTimesheet,
} from "@/server/db/desk-store";
import {
  derivePayrollClientSummary,
  isPayrollRtiSubmitted,
  type PayrollClientSummary,
} from "@/lib/payroll-client-status";

const addEmployeeForm = z.object({
  clientId: z.string(),
  forename: z.string().min(1),
  surname: z.string().min(1),
  nino: z.string().min(1),
  gender: z.enum(["M", "F"]),
  dateOfBirth: z.string().optional(),
  address: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v?.trim() || addressIdentityComplete(v), {
      message: "Street address and postcode are required",
    }),
  taxCode: z.string().default("1257L"),
  annualSalaryPounds: z.string().optional(),
  startDate: z.string(),
  payrollId: z.string().optional(),
  payFrequency: z.enum(["M1", "W1"]).optional().default("M1"),
  niCategory: z.string().optional().default("A"),
  jobTitle: z.string().optional(),
  starterDeclaration: z.enum(["A", "B", "C"]).optional().default("A"),
  hoursPerWeek: z.string().optional(),
  hourlyRatePounds: z.string().optional(),
  payBasis: z.enum(["salary", "hourly"]).optional().default("salary"),
  pensionOptOut: z.boolean().optional(),
  taxBasis: z.enum(["cumulative", "week1Month1"]).optional().default("cumulative"),
  studentLoanPlan: z.string().optional(),
  postgraduateLoan: z.boolean().optional(),
  isDirector: z.boolean().optional(),
  directorsNicMethod: z.enum(["AN", "AL"]).optional(),
  bankSortCode: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  /** Pounds from previous employer this tax year (P45). */
  bfTaxablePounds: z.string().optional(),
  bfTaxPounds: z.string().optional(),
  bfEmployeeNiPounds: z.string().optional(),
  bfTaxYear: z.string().optional(),
});

function hoursToHundredths(s: string | undefined): number {
  if (!s?.trim()) return 3750;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 3750;
  return Math.round(n * 100);
}

export type PayrollEmployee = MemoryEmployee;

function asEmployee(row: Record<string, unknown> | MemoryEmployee): PayrollEmployee {
  const r = mapSnakeCaseRow(row as Record<string, unknown>);
  return {
    id: String(r.id),
    clientId: String(r.clientId),
    forename: String(r.forename),
    surname: String(r.surname),
    nino: String(r.nino),
    gender: r.gender === "M" || r.gender === "F" ? r.gender : null,
    dateOfBirth: r.dateOfBirth ? String(r.dateOfBirth) : null,
    address: r.address ? String(r.address) : null,
    taxCode: String(r.taxCode ?? "1257L"),
    annualSalaryPence: Number(r.annualSalaryPence ?? 0),
    startDate: String(r.startDate),
    payrollId: String(r.payrollId || String(r.id).slice(0, 8).toUpperCase()),
    payFrequency: r.payFrequency === "W1" ? "W1" : "M1",
    niCategory: String(r.niCategory || "A"),
    jobTitle: r.jobTitle ? String(r.jobTitle) : null,
    leaveDate: r.leaveDate ? String(r.leaveDate) : null,
    starterDeclaration:
      r.starterDeclaration === "B" || r.starterDeclaration === "C"
        ? r.starterDeclaration
        : r.starterDeclaration === "A"
          ? "A"
          : "A",
    firstFpsSent: Boolean(r.firstFpsSent),
    previousPayrollId: r.previousPayrollId ? String(r.previousPayrollId) : null,
    hoursPerWeek: Number(r.hoursPerWeek ?? 3750) || 3750,
    hourlyRatePence: Number(r.hourlyRatePence ?? 0),
    payBasis: r.payBasis === "hourly" ? "hourly" : "salary",
    pensionOptOut: Boolean(r.pensionOptOut),
    sspQualifyingDays: Number(r.sspQualifyingDays ?? 5) || 5,
    taxBasis: r.taxBasis === "week1Month1" ? "week1Month1" : "cumulative",
    studentLoanPlan: r.studentLoanPlan ? String(r.studentLoanPlan) : null,
    postgraduateLoan: Boolean(r.postgraduateLoan),
    isDirector: Boolean(r.isDirector),
    directorsNicMethod: r.directorsNicMethod === "AL" ? "AL" : "AN",
    bankSortCode: r.bankSortCode ? String(r.bankSortCode) : null,
    bankAccountNumber: r.bankAccountNumber
      ? String(r.bankAccountNumber)
      : null,
    bankAccountName: r.bankAccountName ? String(r.bankAccountName) : null,
    bfTaxYear: r.bfTaxYear ? String(r.bfTaxYear) : null,
    bfTaxablePence: Number(r.bfTaxablePence ?? 0) || 0,
    bfTaxPence: Number(r.bfTaxPence ?? 0) || 0,
    bfEmployeeNiPence: Number(r.bfEmployeeNiPence ?? 0) || 0,
    // D1 stores active as 0/1; treat only explicit falsey flags as left.
    active: !(
      r.active === false ||
      r.active === 0 ||
      r.active === "0"
    ),
  };
}

function filterEmployeeRows(
  rows: Array<Record<string, unknown>>,
  opts?: { includeLeavers?: boolean },
) {
  return rows
    .map((row) => asEmployee(row))
    .filter((e) => (opts?.includeLeavers ? true : e.active));
}

export async function listEmployees(clientId: string, opts?: { includeLeavers?: boolean }) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.employees
      .filter((e) => e.clientId === clientId)
      .filter((e) => (opts?.includeLeavers ? true : e.active))
      .map((e) => asEmployee(e));
  }
  const { ensureD1PayrollSchema } = await import(
    "@/server/db/ensure-d1-payroll-schema"
  );
  await ensureD1PayrollSchema().catch(() => undefined);

  // Prefer D1; if empty or down, fall back to Supabase (dual-written demo desks).
  const { isD1Configured } = await import("@/server/db/d1");
  if (isD1Configured()) {
    try {
      const deskRows = await deskListEmployees(clientId);
      if (deskRows && deskRows.length > 0) {
        return filterEmployeeRows(deskRows, opts);
      }
    } catch (err) {
      console.warn("[payroll] D1 listEmployees failed; trying Supabase", err);
    }
  } else {
    const deskRows = await deskListEmployees(clientId).catch(() => null);
    if (deskRows && deskRows.length > 0) {
      return filterEmployeeRows(deskRows, opts);
    }
  }

  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (!error && data?.length) {
        return filterEmployeeRows(data as Record<string, unknown>[], opts);
      }
    }
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = getSupabaseAdmin();
        const { data } = await admin
          .from("employees")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true });
        if (data?.length) {
          return filterEmployeeRows(data as Record<string, unknown>[], opts);
        }
      }
    } catch {
      /* admin fallback optional */
    }
  }

  const db = tryGetDb();
  if (!db) return [];
  if (!isSupabaseConfigured()) await ensurePayrollSchema();
  const { employees } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.clientId, clientId));
  return rows
    .map((r) => asEmployee(r as unknown as Record<string, unknown>))
    .filter((e) => (opts?.includeLeavers ? true : e.active));
}

export async function addEmployee(input: z.input<typeof addEmployeeForm>) {
  const session = await requireSession();
  const data = addEmployeeForm.parse(input);
  await getClient(data.clientId);
  await ensurePayrollSchema();
  const { ensureD1PayrollSchema } = await import(
    "@/server/db/ensure-d1-payroll-schema"
  );
  await ensureD1PayrollSchema().catch(() => undefined);

  const hoursPerWeek = hoursToHundredths(data.hoursPerWeek);
  const hourlyRatePence = data.hourlyRatePounds?.trim()
    ? Number(poundsToPence(data.hourlyRatePounds))
    : 0;
  let annualSalaryPence = data.annualSalaryPounds?.trim()
    ? Number(poundsToPence(data.annualSalaryPounds))
    : 0;
  if (annualSalaryPence <= 0 && hourlyRatePence > 0) {
    annualSalaryPence = Math.round((hourlyRatePence * hoursPerWeek * 52) / 100);
  }
  if (annualSalaryPence <= 0) {
    throw new Error("Enter an annual salary or an hourly rate.");
  }

  const parsed = employeeInputSchema.parse({
    clientId: data.clientId,
    forename: data.forename,
    surname: data.surname,
    nino: data.nino,
    gender: data.gender,
    taxCode: data.taxCode,
    annualSalaryPence,
    startDate: data.startDate,
    payrollId: data.payrollId,
    payFrequency: data.payFrequency,
    niCategory: data.niCategory,
    jobTitle: data.jobTitle,
    starterDeclaration: data.starterDeclaration,
    hoursPerWeek,
    hourlyRatePence,
    payBasis: data.payBasis,
    pensionOptOut: Boolean(data.pensionOptOut),
  });

  const taxBasis =
    data.taxBasis === "week1Month1" ? "week1Month1" : "cumulative";
  const studentLoanPlan = data.studentLoanPlan?.trim() || null;
  const postgraduateLoan = Boolean(data.postgraduateLoan);
  const isDirector = Boolean(data.isDirector);
  const directorsNicMethod =
    data.directorsNicMethod === "AL" ? "AL" : "AN";
  const bankSortCode = data.bankSortCode?.replace(/\D/g, "") || null;
  const bankAccountNumber = data.bankAccountNumber?.replace(/\D/g, "") || null;
  const bankAccountName = data.bankAccountName?.trim() || null;

  const existing = await listEmployees(data.clientId, { includeLeavers: true });
  const activeCount = existing.filter((e) => e.active).length;
  const { payeEmployeesPerEmployerCap } = await import("@/lib/pricing");
  const { getPracticeEntitlements } = await import("@/server/actions/account");
  const { planKeys } = await getPracticeEntitlements();
  const employeeCap = payeEmployeesPerEmployerCap(planKeys);
  if (employeeCap != null && activeCount >= employeeCap) {
    throw new Error(
      `Your plan allows up to ${employeeCap} employees per employer. Upgrade to Enterprise PAYE on Pricing for unlimited employees.`,
    );
  }
  const payrollId =
    parsed.payrollId?.trim() ||
    generatePayrollId(existing.map((e) => e.payrollId));
  if (
    existing.some((e) => e.payrollId.toUpperCase() === payrollId.toUpperCase())
  ) {
    throw new Error(
      "That payroll ID is already used. Never reuse an ID — it splits the HMRC employment record.",
    );
  }

  const bfTaxablePence = data.bfTaxablePounds?.trim()
    ? Number(poundsToPence(data.bfTaxablePounds))
    : 0;
  const bfTaxPence = data.bfTaxPounds?.trim()
    ? Number(poundsToPence(data.bfTaxPounds))
    : 0;
  const bfEmployeeNiPence = data.bfEmployeeNiPounds?.trim()
    ? Number(poundsToPence(data.bfEmployeeNiPounds))
    : 0;
  const bfTaxYear =
    bfTaxablePence > 0 || bfTaxPence > 0 || bfEmployeeNiPence > 0
      ? (data.bfTaxYear?.trim() || taxYearFromDate(data.startDate))
      : null;

  const dateOfBirth = data.dateOfBirth?.trim() || null;
  const address = data.address?.trim() || null;

  const emp: PayrollEmployee = {
    id: crypto.randomUUID(),
    clientId: parsed.clientId,
    forename: parsed.forename,
    surname: parsed.surname,
    nino: parsed.nino,
    gender: parsed.gender,
    dateOfBirth,
    address,
    taxCode: parsed.taxCode,
    annualSalaryPence: Number(parsed.annualSalaryPence),
    startDate: parsed.startDate,
    payrollId,
    payFrequency: parsed.payFrequency,
    niCategory: parsed.niCategory,
    jobTitle: parsed.jobTitle || null,
    leaveDate: null,
    starterDeclaration: parsed.starterDeclaration,
    firstFpsSent: false,
    previousPayrollId: null,
    hoursPerWeek,
    hourlyRatePence,
    payBasis: parsed.payBasis,
    pensionOptOut: parsed.pensionOptOut,
    sspQualifyingDays: parsed.sspQualifyingDays,
    taxBasis,
    studentLoanPlan,
    postgraduateLoan,
    isDirector,
    directorsNicMethod,
    bankSortCode,
    bankAccountNumber,
    bankAccountName,
    bfTaxYear,
    bfTaxablePence,
    bfTaxPence,
    bfEmployeeNiPence,
    active: true,
  };

  if (isDemoMode()) {
    demoStore.employees.push(emp);
  } else if (isDeskStoreConfigured()) {
    await deskInsertEmployee({
      id: emp.id,
      client_id: emp.clientId,
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
      gender: emp.gender,
      date_of_birth: emp.dateOfBirth,
      address: emp.address,
      tax_code: emp.taxCode,
      annual_salary_pence: emp.annualSalaryPence,
      start_date: emp.startDate,
      payroll_id: emp.payrollId,
      pay_frequency: emp.payFrequency,
      ni_category: emp.niCategory,
      job_title: emp.jobTitle,
      leave_date: emp.leaveDate,
      starter_declaration: emp.starterDeclaration,
      first_fps_sent: emp.firstFpsSent,
      previous_payroll_id: emp.previousPayrollId,
      hours_per_week: emp.hoursPerWeek,
      hourly_rate_pence: emp.hourlyRatePence,
      pay_basis: emp.payBasis,
      pension_opt_out: emp.pensionOptOut,
      ssp_qualifying_days: emp.sspQualifyingDays,
      tax_basis: emp.taxBasis,
      student_loan_plan: emp.studentLoanPlan,
      postgraduate_loan: emp.postgraduateLoan,
      is_director: emp.isDirector,
      directors_nic_method: emp.directorsNicMethod,
      bank_sort_code: emp.bankSortCode,
      bank_account_number: emp.bankAccountNumber,
      bank_account_name: emp.bankAccountName,
      bf_tax_year: emp.bfTaxYear,
      bf_taxable_pence: emp.bfTaxablePence,
      bf_tax_pence: emp.bfTaxPence,
      bf_employee_ni_pence: emp.bfEmployeeNiPence,
      active: true,
    });
  } else {
    const { getDb } = await import("@/server/db");
    const { employees } = await import("@/server/db/schema");
    await getDb().insert(employees).values({
      id: emp.id,
      clientId: emp.clientId,
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      address: emp.address,
      taxCode: emp.taxCode,
      annualSalaryPence: emp.annualSalaryPence,
      startDate: emp.startDate,
      payrollId: emp.payrollId,
      payFrequency: emp.payFrequency,
      niCategory: emp.niCategory,
      jobTitle: emp.jobTitle,
      leaveDate: emp.leaveDate,
      starterDeclaration: emp.starterDeclaration,
      firstFpsSent: emp.firstFpsSent,
      previousPayrollId: emp.previousPayrollId,
      hoursPerWeek: emp.hoursPerWeek,
      hourlyRatePence: emp.hourlyRatePence,
      payBasis: emp.payBasis,
      pensionOptOut: emp.pensionOptOut,
      sspQualifyingDays: emp.sspQualifyingDays,
      taxBasis: emp.taxBasis,
      studentLoanPlan: emp.studentLoanPlan,
      postgraduateLoan: emp.postgraduateLoan,
      isDirector: emp.isDirector,
      directorsNicMethod: emp.directorsNicMethod,
      bankSortCode: emp.bankSortCode,
      bankAccountNumber: emp.bankAccountNumber,
      bankAccountName: emp.bankAccountName,
      bfTaxYear: emp.bfTaxYear,
      bfTaxablePence: emp.bfTaxablePence,
      bfTaxPence: emp.bfTaxPence,
      bfEmployeeNiPence: emp.bfEmployeeNiPence,
      active: true,
    });
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "employee.create",
    entityType: "employee",
    entityId: emp.id,
    detail: { payrollId: emp.payrollId },
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return emp;
}

/** Canonical CSV template for per-company employee take-on. */
export async function downloadEmployeeCsvTemplate() {
  await requireSession();
  const { employeeCsvTemplateText } = await import(
    "@/server/payroll/employee-csv"
  );
  return {
    filename: "hydratax-employees-template.csv",
    csv: employeeCsvTemplateText(),
  };
}

/**
 * Import / update employees for one company from HydraTax CSV.
 * Match key: NI number. No background job — capped rows in the parser.
 * Returns quiet counts; row failures are skipped (desk-ui: no error banners).
 */
export async function importEmployeesCsv(input: {
  clientId: string;
  csvText: string;
}): Promise<{
  created: number;
  updated: number;
  skipped: number;
  ok: boolean;
}> {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { created: 0, updated: 0, skipped: 0, ok: false };
  }
  const clientId = String(input.clientId || "");
  const csvText = String(input.csvText || "");
  if (!clientId || !csvText.trim()) {
    return { created: 0, updated: 0, skipped: 0, ok: false };
  }
  await getClient(clientId);

  // Desk path keeps addEmployee/updateEmployee (plan caps + session audit).
  // Bureau bulk jobs use applyEmployeeCsvToClient via the DB worker instead.
  const { parseEmployeeCsv } = await import("@/server/payroll/employee-csv");
  const parsed = parseEmployeeCsv(csvText);
  if (parsed.rows.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: parsed.errors.length,
      ok: false,
    };
  }

  const existing = await listEmployees(clientId, { includeLeavers: true });
  const byNino = new Map(
    existing.map((e) => [e.nino.replace(/\s+/g, "").toUpperCase(), e]),
  );

  let created = 0;
  let updated = 0;
  let skipped = parsed.errors.length;

  for (const row of parsed.rows) {
    const match = byNino.get(row.nino);
    try {
      if (match) {
        await updateEmployee({
          clientId,
          employeeId: match.id,
          forename: row.forename,
          surname: row.surname,
          nino: row.nino,
          gender: row.gender,
          dateOfBirth: row.dateOfBirth,
          address: row.address,
          taxCode: row.taxCode,
          annualSalaryPounds: row.annualSalaryPounds,
          hourlyRatePounds: row.hourlyRatePounds,
          hoursPerWeek: row.hoursPerWeek,
          payBasis: row.payBasis,
          payFrequency: row.payFrequency,
          startDate: row.startDate,
          jobTitle: row.jobTitle,
          niCategory: row.niCategory,
          pensionOptOut: row.pensionOptOut,
          starterDeclaration: row.starterDeclaration,
          sspQualifyingDays: row.sspQualifyingDays,
          taxBasis: row.taxBasis,
          studentLoanPlan: row.studentLoanPlan ?? "",
          postgraduateLoan: row.postgraduateLoan,
          isDirector: row.isDirector,
          directorsNicMethod: row.directorsNicMethod,
          bankSortCode: row.bankSortCode,
          bankAccountNumber: row.bankAccountNumber,
          bankAccountName: row.bankAccountName,
          bfTaxYear: row.bfTaxYear,
          bfTaxablePounds: row.bfTaxablePounds,
          bfTaxPounds: row.bfTaxPounds,
          bfEmployeeNiPounds: row.bfEmployeeNiPounds,
        });
        updated += 1;
      } else {
        const emp = await addEmployee({
          clientId,
          forename: row.forename,
          surname: row.surname,
          nino: row.nino,
          gender: row.gender,
          dateOfBirth: row.dateOfBirth,
          address: row.address,
          taxCode: row.taxCode,
          annualSalaryPounds: row.annualSalaryPounds,
          hourlyRatePounds: row.hourlyRatePounds,
          hoursPerWeek: row.hoursPerWeek,
          payBasis: row.payBasis,
          payFrequency: row.payFrequency,
          startDate: row.startDate,
          payrollId: row.payrollId,
          jobTitle: row.jobTitle,
          niCategory: row.niCategory,
          pensionOptOut: row.pensionOptOut,
          starterDeclaration: row.starterDeclaration,
          taxBasis: row.taxBasis,
          studentLoanPlan: row.studentLoanPlan,
          postgraduateLoan: row.postgraduateLoan,
          isDirector: row.isDirector,
          directorsNicMethod: row.directorsNicMethod,
          bankSortCode: row.bankSortCode,
          bankAccountNumber: row.bankAccountNumber,
          bankAccountName: row.bankAccountName,
          bfTaxYear: row.bfTaxYear,
          bfTaxablePounds: row.bfTaxablePounds,
          bfTaxPounds: row.bfTaxPounds,
          bfEmployeeNiPounds: row.bfEmployeeNiPounds,
        });
        byNino.set(row.nino, emp);
        created += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "employee.csv_import",
    entityType: "client",
    entityId: clientId,
    detail: { created, updated, skipped },
  });
  revalidatePath(`/clients/${clientId}/payroll`);
  return {
    created,
    updated,
    skipped,
    ok: created + updated > 0,
  };
}

const updateEmployeeForm = z.object({
  clientId: z.string(),
  employeeId: z.string(),
  forename: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  nino: z.string().min(1).optional(),
  gender: z.enum(["M", "F"]).optional(),
  dateOfBirth: z.string().optional(),
  address: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => v === undefined || !v.trim() || addressIdentityComplete(v), {
      message: "Street address and postcode are required",
    }),
  taxCode: z.string().optional(),
  annualSalaryPounds: z.string().optional(),
  hoursPerWeek: z.string().optional(),
  hourlyRatePounds: z.string().optional(),
  payBasis: z.enum(["salary", "hourly"]).optional(),
  payFrequency: z.enum(["M1", "W1"]).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  jobTitle: z.string().optional(),
  niCategory: z.string().optional(),
  pensionOptOut: z.boolean().optional(),
  starterDeclaration: z.enum(["A", "B", "C"]).optional(),
  sspQualifyingDays: z.number().int().min(1).max(7).optional(),
  taxBasis: z.enum(["cumulative", "week1Month1"]).optional(),
  studentLoanPlan: z.string().optional(),
  postgraduateLoan: z.boolean().optional(),
  isDirector: z.boolean().optional(),
  directorsNicMethod: z.enum(["AN", "AL"]).optional(),
  bankSortCode: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  bfTaxYear: z.string().optional(),
  bfTaxablePounds: z.string().optional(),
  bfTaxPounds: z.string().optional(),
  bfEmployeeNiPounds: z.string().optional(),
});

/** Update standing employee details (salary, hours, rate, identity). */
export async function updateEmployee(input: z.input<typeof updateEmployeeForm>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = updateEmployeeForm.parse(input);
  await getClient(data.clientId);
  const existing = await getEmployeeOrThrow(data.clientId, data.employeeId);

  const hoursPerWeek = data.hoursPerWeek?.trim()
    ? hoursToHundredths(data.hoursPerWeek)
    : existing.hoursPerWeek;
  const hourlyRatePence = data.hourlyRatePounds?.trim()
    ? Number(poundsToPence(data.hourlyRatePounds))
    : existing.hourlyRatePence;
  let annualSalaryPence = data.annualSalaryPounds?.trim()
    ? Number(poundsToPence(data.annualSalaryPounds))
    : existing.annualSalaryPence;
  const payBasis = data.payBasis ?? existing.payBasis;
  if (
    data.annualSalaryPounds?.trim() === undefined &&
    payBasis === "hourly" &&
    hourlyRatePence > 0
  ) {
    annualSalaryPence = Math.round((hourlyRatePence * hoursPerWeek * 52) / 100);
  }
  if (annualSalaryPence <= 0 && hourlyRatePence <= 0) {
    throw new Error("Enter an annual salary or an hourly rate.");
  }

  const bfTaxablePence =
    data.bfTaxablePounds !== undefined
      ? data.bfTaxablePounds.trim()
        ? Number(poundsToPence(data.bfTaxablePounds))
        : 0
      : existing.bfTaxablePence;
  const bfTaxPence =
    data.bfTaxPounds !== undefined
      ? data.bfTaxPounds.trim()
        ? Number(poundsToPence(data.bfTaxPounds))
        : 0
      : existing.bfTaxPence;
  const bfEmployeeNiPence =
    data.bfEmployeeNiPounds !== undefined
      ? data.bfEmployeeNiPounds.trim()
        ? Number(poundsToPence(data.bfEmployeeNiPounds))
        : 0
      : existing.bfEmployeeNiPence;
  const startDate = data.startDate ?? existing.startDate;
  const bfTaxYear =
    data.bfTaxYear !== undefined
      ? data.bfTaxYear.trim() || null
      : bfTaxablePence > 0 || bfTaxPence > 0 || bfEmployeeNiPence > 0
        ? existing.bfTaxYear || taxYearFromDate(startDate)
        : existing.bfTaxYear;

  const patch = {
    forename: data.forename?.trim() || existing.forename,
    surname: data.surname?.trim() || existing.surname,
    nino: data.nino?.trim() || existing.nino,
    gender: data.gender ?? existing.gender,
    date_of_birth:
      data.dateOfBirth !== undefined
        ? data.dateOfBirth.trim() || null
        : existing.dateOfBirth,
    address:
      data.address !== undefined
        ? data.address.trim() || null
        : existing.address,
    tax_code: data.taxCode?.trim() || existing.taxCode,
    annual_salary_pence: annualSalaryPence,
    hours_per_week: hoursPerWeek,
    hourly_rate_pence: hourlyRatePence,
    pay_basis: payBasis,
    pay_frequency: data.payFrequency ?? existing.payFrequency,
    start_date: startDate,
    job_title:
      data.jobTitle !== undefined
        ? data.jobTitle.trim() || null
        : existing.jobTitle,
    ni_category: data.niCategory?.trim() || existing.niCategory,
    pension_opt_out:
      data.pensionOptOut !== undefined
        ? data.pensionOptOut
        : existing.pensionOptOut,
    starter_declaration:
      data.starterDeclaration === "A" ||
      data.starterDeclaration === "B" ||
      data.starterDeclaration === "C"
        ? data.starterDeclaration
        : existing.starterDeclaration,
    ssp_qualifying_days:
      data.sspQualifyingDays !== undefined
        ? data.sspQualifyingDays
        : existing.sspQualifyingDays,
    tax_basis:
      data.taxBasis === "week1Month1" || data.taxBasis === "cumulative"
        ? data.taxBasis
        : existing.taxBasis,
    student_loan_plan:
      data.studentLoanPlan !== undefined
        ? data.studentLoanPlan.trim() || null
        : existing.studentLoanPlan,
    postgraduate_loan:
      data.postgraduateLoan !== undefined
        ? data.postgraduateLoan
        : existing.postgraduateLoan,
    is_director:
      data.isDirector !== undefined ? data.isDirector : existing.isDirector,
    directors_nic_method:
      data.directorsNicMethod === "AL" || data.directorsNicMethod === "AN"
        ? data.directorsNicMethod
        : existing.directorsNicMethod,
    bank_sort_code:
      data.bankSortCode !== undefined
        ? data.bankSortCode.replace(/\D/g, "") || null
        : existing.bankSortCode,
    bank_account_number:
      data.bankAccountNumber !== undefined
        ? data.bankAccountNumber.replace(/\D/g, "") || null
        : existing.bankAccountNumber,
    bank_account_name:
      data.bankAccountName !== undefined
        ? data.bankAccountName.trim() || null
        : existing.bankAccountName,
    bf_tax_year: bfTaxYear,
    bf_taxable_pence: bfTaxablePence,
    bf_tax_pence: bfTaxPence,
    bf_employee_ni_pence: bfEmployeeNiPence,
  };

  if (isDemoMode()) {
    const emp = demoStore.employees.find(
      (e) => e.id === data.employeeId && e.clientId === data.clientId,
    );
    if (!emp) throw new Error("Employee not found");
    emp.forename = patch.forename;
    emp.surname = patch.surname;
    emp.nino = patch.nino;
    emp.gender = patch.gender;
    emp.dateOfBirth = patch.date_of_birth;
    emp.address = patch.address;
    emp.taxCode = patch.tax_code;
    emp.annualSalaryPence = patch.annual_salary_pence;
    emp.hoursPerWeek = patch.hours_per_week;
    emp.hourlyRatePence = patch.hourly_rate_pence;
    emp.payBasis = patch.pay_basis;
    emp.payFrequency = patch.pay_frequency;
    emp.startDate = patch.start_date;
    emp.jobTitle = patch.job_title;
    emp.niCategory = patch.ni_category;
    emp.pensionOptOut = patch.pension_opt_out;
    emp.starterDeclaration = patch.starter_declaration;
    emp.sspQualifyingDays = patch.ssp_qualifying_days;
    emp.taxBasis = patch.tax_basis;
    emp.studentLoanPlan = patch.student_loan_plan;
    emp.postgraduateLoan = patch.postgraduate_loan;
    emp.isDirector = patch.is_director;
    emp.directorsNicMethod = patch.directors_nic_method;
    emp.bankSortCode = patch.bank_sort_code;
    emp.bankAccountNumber = patch.bank_account_number;
    emp.bankAccountName = patch.bank_account_name;
    emp.bfTaxYear = patch.bf_tax_year;
    emp.bfTaxablePence = patch.bf_taxable_pence;
    emp.bfTaxPence = patch.bf_tax_pence;
    emp.bfEmployeeNiPence = patch.bf_employee_ni_pence;
  } else if (isDeskStoreConfigured()) {
    await deskUpdateEmployee(data.employeeId, data.clientId, patch);
  } else {
    const { getDb } = await import("@/server/db");
    const { employees } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await getDb()
      .update(employees)
      .set({
        forename: patch.forename,
        surname: patch.surname,
        nino: patch.nino,
        gender: patch.gender,
        dateOfBirth: patch.date_of_birth,
        address: patch.address,
        taxCode: patch.tax_code,
        annualSalaryPence: patch.annual_salary_pence,
        hoursPerWeek: patch.hours_per_week,
        hourlyRatePence: patch.hourly_rate_pence,
        payBasis: patch.pay_basis,
        payFrequency: patch.pay_frequency,
        startDate: patch.start_date,
        jobTitle: patch.job_title,
        niCategory: patch.ni_category,
        pensionOptOut: patch.pension_opt_out,
        starterDeclaration: patch.starter_declaration,
        sspQualifyingDays: patch.ssp_qualifying_days,
        taxBasis: patch.tax_basis,
        studentLoanPlan: patch.student_loan_plan,
        postgraduateLoan: patch.postgraduate_loan,
        isDirector: patch.is_director,
        directorsNicMethod: patch.directors_nic_method,
        bankSortCode: patch.bank_sort_code,
        bankAccountNumber: patch.bank_account_number,
        bankAccountName: patch.bank_account_name,
        bfTaxYear: patch.bf_tax_year,
        bfTaxablePence: patch.bf_taxable_pence,
        bfTaxPence: patch.bf_tax_pence,
        bfEmployeeNiPence: patch.bf_employee_ni_pence,
      })
      .where(
        and(
          eq(employees.id, data.employeeId),
          eq(employees.clientId, data.clientId),
        ),
      );
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "employee.update",
    entityType: "employee",
    entityId: data.employeeId,
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return { ok: true as const };
}

const leaveSchema = z.object({
  clientId: z.string(),
  employeeId: z.string(),
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function markEmployeeLeaver(input: z.infer<typeof leaveSchema>) {
  await requireSession();
  const data = leaveSchema.parse(input);
  await getClient(data.clientId);
  if (isDemoMode()) {
    const emp = demoStore.employees.find(
      (e) => e.id === data.employeeId && e.clientId === data.clientId,
    );
    if (!emp) throw new Error("Employee not found");
    emp.leaveDate = data.leaveDate;
    emp.active = false;
  } else if (isDeskStoreConfigured()) {
    await deskUpdateEmployee(data.employeeId, data.clientId, {
      leave_date: data.leaveDate,
      active: false,
    });
  } else {
    const { getDb } = await import("@/server/db");
    const { employees } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await getDb()
      .update(employees)
      .set({ leaveDate: data.leaveDate, active: false })
      .where(
        and(eq(employees.id, data.employeeId), eq(employees.clientId, data.clientId)),
      );
  }
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return { ok: true };
}

const employerSchema = z.object({
  clientId: z.string(),
  payeRef: z.string().min(3),
  accountsOfficeRef: z.string().min(3),
});

export async function enableEmployerPayroll(input: z.infer<typeof employerSchema>) {
  const session = await requireSession();
  const data = employerSchema.parse(input);
  const client = await getClient(data.clientId);
  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (!row) throw new Error("Client not found");
    row.isEmployer = true;
    row.payeRef = data.payeRef.trim();
    row.accountsOfficeRef = data.accountsOfficeRef.trim();
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase
      .from("clients")
      .update({
        is_employer: true,
        paye_ref: data.payeRef.trim(),
        accounts_office_ref: data.accountsOfficeRef.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(`Could not enable payroll: ${error.message}`);
  } else {
    const { getDb } = await import("@/server/db");
    const { clients } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(clients)
      .set({
        isEmployer: true,
        payeRef: data.payeRef.trim(),
        accountsOfficeRef: data.accountsOfficeRef.trim(),
      })
      .where(eq(clients.id, data.clientId));
  }
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "client.employer.enable",
    entityType: "client",
    entityId: client.id,
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  revalidatePath(`/clients/${data.clientId}`);
  return { ok: true };
}

async function loadTimesheetRows(
  clientId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TimesheetRow[]> {
  await ensurePayrollSchema();
  if (isDemoMode()) {
    const row = demoStore.payrollTimesheets.find(
      (t) =>
        t.clientId === clientId &&
        t.periodStart === periodStart &&
        t.periodEnd === periodEnd,
    );
    return Array.isArray(row?.rows) ? (row.rows as TimesheetRow[]) : [];
  }
  const deskSheets = await deskListTimesheets(clientId);
  if (deskSheets !== null) {
    const hit = deskSheets.find(
      (t) =>
        String(t.period_start) === periodStart &&
        String(t.period_end) === periodEnd,
    );
    return Array.isArray(hit?.rows) ? (hit.rows as TimesheetRow[]) : [];
  }
  const db = tryGetDb();
  if (!db) return [];
  const { payrollTimesheets } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(payrollTimesheets)
    .where(
      and(
        eq(payrollTimesheets.clientId, clientId),
        eq(payrollTimesheets.periodStart, periodStart),
        eq(payrollTimesheets.periodEnd, periodEnd),
      ),
    )
    .limit(1);
  const raw = rows[0]?.rows;
  return Array.isArray(raw) ? (raw as TimesheetRow[]) : [];
}

function adjustmentsForEmployee(
  emp: PayrollEmployee,
  sheet: TimesheetRow[],
): TimesheetAdjustments | null {
  const hit = sheet.find((r) => Boolean(matchTimesheetRow(r, [emp])));
  if (!hit) return null;
  return {
    ordinaryHours: hit.ordinaryHours,
    overtimeHours: hit.overtimeHours,
    sickDays: hit.sickDays,
    holidayHours: hit.holidayHours,
    irregularHours: hit.irregularHours,
    maternityWeeks: hit.maternityWeeks,
    maternityWeekFrom: hit.maternityWeekFrom,
    paternityWeeks: hit.paternityWeeks,
    adoptionWeeks: hit.adoptionWeeks,
    sharedParentalWeeks: hit.sharedParentalWeeks,
    parentalBereavementWeeks: hit.parentalBereavementWeeks,
    neonatalCareWeeks: hit.neonatalCareWeeks,
    unpaidAbsence: hit.unpaidAbsence,
    onStrike: hit.onStrike,
    hourlyRatePence: hit.hourlyRatePence,
  };
}

const payRunSchema = z.object({
  clientId: z.string(),
  payDate: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  frequency: z.enum(["M1", "W1"]).optional().default("M1"),
  submit: z.boolean().optional().default(false),
  senderId: z.string().optional(),
  senderPassword: z.string().optional(),
  useSavedPassword: z.boolean().optional(),
  rememberPassword: z.boolean().optional(),
});

const optionalPounds = z.string().optional();

const epsSchema = z.object({
  clientId: z.string(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** When true (default for legacy button), send NoPaymentForPeriod. */
  noPaymentForPeriod: z.boolean().optional().default(true),
  smpRecoveredPounds: optionalPounds,
  sppRecoveredPounds: optionalPounds,
  sapRecoveredPounds: optionalPounds,
  shppRecoveredPounds: optionalPounds,
  spbpRecoveredPounds: optionalPounds,
  sncpRecoveredPounds: optionalPounds,
  nicCompSmpPounds: optionalPounds,
  nicCompSppPounds: optionalPounds,
  /** Apprenticeship levy due YTD (net of allowance), whole pounds. */
  levyDueYtdPounds: optionalPounds,
  /** Scheme annual allowance allocation (default £15,000). */
  levyAnnualAllowancePounds: optionalPounds,
  senderId: z.string().optional(),
  senderPassword: z.string().optional(),
  useSavedPassword: z.boolean().optional(),
  rememberPassword: z.boolean().optional(),
});

function optionalPoundsToPence(raw: string | undefined): number {
  const s = raw?.trim();
  if (!s) return 0;
  try {
    return Number(poundsToPence(s));
  } catch {
    return 0;
  }
}

export type PayRunPreview = {
  id?: string;
  frequency: PayFrequency;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  taxYear: string;
  lines: PayLine[];
  totals: {
    grossPence: number;
    taxPence: number;
    employeeNiPence: number;
    employerNiPence: number;
    netPence: number;
  };
  checks: ReturnType<typeof preflightPayRun>;
  status?: string;
  hmrcCorrelationId?: string | null;
  timesheetRows: number;
};

async function buildPayRunPackage(
  data: z.infer<typeof payRunSchema>,
): Promise<PayRunPreview> {
  const client = await getClient(data.clientId);
  const employees = await listEmployees(data.clientId, { includeLeavers: true });
  const runs = await listPayRuns(data.clientId);
  const taxYear = taxYearFromDate(data.payDate);
  const sheet = await loadTimesheetRows(
    data.clientId,
    data.periodStart,
    data.periodEnd,
  );
  const inPeriod = employees.filter((e) => {
    if (e.startDate > data.periodEnd) return false;
    if (e.leaveDate && e.leaveDate < data.periodStart) return false;
    return e.active || Boolean(e.leaveDate && e.leaveDate >= data.periodStart);
  });

  const checks = preflightPayRun({
    payeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    isEmployer: client.isEmployer,
    payDate: data.payDate,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    frequency: data.frequency,
    employees: inPeriod.map((e) => ({
      ...e,
      jobTitle: e.jobTitle ?? null,
    })),
  });

  const lines = inPeriod
    .filter((e) => e.active || (e.leaveDate && e.leaveDate >= data.periodStart))
    .map((e) =>
      calculatePeriodPay(
        {
          id: e.id,
          payrollId: e.payrollId,
          previousPayrollId: e.previousPayrollId,
          payrollIdChanged: Boolean(e.previousPayrollId && !e.firstFpsSent),
          forename: e.forename,
          surname: e.surname,
          nino: e.nino,
          gender: e.gender,
          dateOfBirth: e.dateOfBirth,
          address: e.address,
          taxCode: e.taxCode,
          annualSalaryPence: e.annualSalaryPence,
          startDate: e.startDate,
          leaveDate: e.leaveDate,
          starterDeclaration: e.starterDeclaration,
          firstFpsSent: e.firstFpsSent,
          niCategory: e.niCategory,
          hoursPerWeekHundredths: e.hoursPerWeek,
          hourlyRatePence: e.hourlyRatePence,
          payBasis: e.payBasis,
          pensionOptOut: e.pensionOptOut,
          sspQualifyingDays: e.sspQualifyingDays,
          payDate: data.payDate,
          taxYear,
          taxBasis: e.taxBasis,
          studentLoanPlan: e.studentLoanPlan,
          postgraduateLoan: e.postgraduateLoan,
          isDirector:
            e.isDirector || /director/i.test(String(e.jobTitle ?? "")),
          directorsNicMethod: e.directorsNicMethod,
          adjustments: adjustmentsForEmployee(e, sheet),
        },
        data.frequency,
        mergeYtdWithBroughtForward(
          e.bfTaxYear
            ? {
                taxYear: e.bfTaxYear,
                taxablePence: e.bfTaxablePence,
                taxPence: e.bfTaxPence,
                employeeNiPence: e.bfEmployeeNiPence,
              }
            : null,
          ytdFromRuns(e.id, taxYear, runs),
          taxYear,
        ),
      ),
    );

  const totals = lines.reduce(
    (acc, l) => ({
      grossPence: acc.grossPence + l.grossPence,
      taxPence: acc.taxPence + l.taxPence,
      employeeNiPence: acc.employeeNiPence + l.employeeNiPence,
      employerNiPence: acc.employerNiPence + l.employerNiPence,
      netPence: acc.netPence + l.netPence,
    }),
    {
      grossPence: 0,
      taxPence: 0,
      employeeNiPence: 0,
      employerNiPence: 0,
      netPence: 0,
    },
  );

  if (sheet.length) {
    const matched = inPeriod.filter((e) =>
      Boolean(adjustmentsForEmployee(e, sheet)),
    ).length;
    checks.push({
      level: matched ? "ok" : "warn",
      code: "timesheet",
      message:
        matched < sheet.length
          ? `Timesheet has ${sheet.length} row(s); ${matched} matched an employee. Unmatched rows are ignored.`
          : `Payslips use hours from the uploaded timesheet (${matched} people).`,
    });
  }

  return {
    frequency: data.frequency,
    payDate: data.payDate,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    taxYear,
    lines,
    totals,
    checks,
    timesheetRows: sheet.length,
  };
}

export async function previewPayRun(input: z.input<typeof payRunSchema>) {
  await requireSession();
  const data = payRunSchema.parse({ ...input, submit: false });
  return buildPayRunPackage(data);
}

/**
 * Finalise a pay period without filing FPS — creates payslips + payroll summary
 * in History (QuickBooks / Xero-style “approve payroll” before optional HMRC submit).
 */
export async function savePayRun(input: z.input<typeof payRunSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = payRunSchema.parse({ ...input, submit: false });
  const pack = await buildPayRunPackage(data);
  if (pack.checks.some((c) => c.level === "error")) {
    throw new Error(pack.checks.find((c) => c.level === "error")!.message);
  }
  if (!pack.lines.length) {
    throw new Error("No employees in this period to pay.");
  }

  const existing = await listPayRuns(data.clientId);
  const clash = existing.find((r) => {
    const row = r as {
      payDate?: string;
      kind?: string;
      status?: string;
      payFrequency?: string;
      lines?: PayLine[];
    };
    if (
      String(row.payDate) !== data.payDate ||
      String(row.kind ?? "FPS") !== "FPS" ||
      String(row.status) === "rejected" ||
      String(row.payFrequency ?? "M1") !== data.frequency
    ) {
      return false;
    }
    // Allow a new draft when every payslip on the filed run was reversed (amend path).
    const lines = Array.isArray(row.lines) ? row.lines : [];
    if (
      isPayrollRtiSubmitted(row) &&
      lines.length > 0 &&
      lines.every((l) => Boolean(l.reversed))
    ) {
      return false;
    }
    return true;
  });
  if (clash) {
    throw new Error(
      `A pay run already exists for ${data.payDate}. Open History & packs for payslips.`,
    );
  }

  const payRun = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    payDate: data.payDate,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    payFrequency: data.frequency,
    kind: "FPS",
    status: "ready",
    totals: pack.totals,
    lines: pack.lines,
    fpsXmlHash: null as string | null,
    hmrcCorrelationId: null as string | null,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.payRuns.push(payRun);
  } else if (isDeskStoreConfigured()) {
    await deskInsertPayRun({
      id: payRun.id,
      client_id: payRun.clientId,
      pay_date: payRun.payDate,
      period_start: payRun.periodStart,
      period_end: payRun.periodEnd,
      pay_frequency: payRun.payFrequency,
      kind: payRun.kind,
      status: payRun.status,
      totals: payRun.totals,
      lines: payRun.lines,
      fps_xml_hash: payRun.fpsXmlHash,
      hmrc_correlation_id: payRun.hmrcCorrelationId,
      submitted_at: payRun.submittedAt,
    });
    if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { getSupabaseAdmin } = await import("@/lib/supabase");
        await getSupabaseAdmin().from("pay_runs").upsert(
          {
            id: payRun.id,
            client_id: payRun.clientId,
            pay_date: payRun.payDate,
            period_start: payRun.periodStart,
            period_end: payRun.periodEnd,
            pay_frequency: payRun.payFrequency,
            kind: payRun.kind,
            status: payRun.status,
            totals: payRun.totals,
            lines: payRun.lines,
            fps_xml_hash: payRun.fpsXmlHash,
            hmrc_correlation_id: payRun.hmrcCorrelationId,
            submitted_at: payRun.submittedAt,
          },
          { onConflict: "id" },
        );
      } catch {
        /* dual-write best-effort */
      }
    }
  } else {
    const { getDb } = await import("@/server/db");
    const { payRuns } = await import("@/server/db/schema");
    await getDb().insert(payRuns).values({
      id: payRun.id,
      clientId: payRun.clientId,
      payDate: payRun.payDate,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      payFrequency: data.frequency,
      kind: "FPS",
      status: "ready",
      totals: payRun.totals,
      lines: pack.lines,
      fpsXmlHash: null,
      hmrcCorrelationId: null,
      submittedAt: new Date(),
    });
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "payroll.run.finalise",
    entityType: "pay_run",
    entityId: payRun.id,
  });

  revalidatePath(`/clients/${data.clientId}/payroll`);
  return {
    ...payRun,
    ok: true as const,
    taxYear: pack.taxYear,
  };
}

export async function createAndSubmitPayRun(
  input: z.input<typeof payRunSchema> & { confirmEndTrial?: boolean },
) {
  const session = await requireSession();
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });
  const data = payRunSchema.parse({ ...input, submit: true });
  const client = await getClient(data.clientId);
  const pack = await buildPayRunPackage(data);
  if (pack.checks.some((c) => c.level === "error")) {
    throw new Error(pack.checks.find((c) => c.level === "error")!.message);
  }
  if (!client.payeRef || !client.accountsOfficeRef) {
    throw new Error("Client must be an employer with PAYE and Accounts Office refs");
  }

  const { resolveGatewayCredentialsForSubmit } = await import(
    "@/server/hmrc/gateway-credentials"
  );
  const { senderId, senderPassword } = await resolveGatewayCredentialsForSubmit({
    clientId: data.clientId,
    senderId: data.senderId,
    senderPassword: data.senderPassword,
    useSavedPassword: data.useSavedPassword,
    rememberPassword: data.rememberPassword,
  });

  const fps = buildFpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    payDate: data.payDate,
    taxYear: pack.taxYear,
    frequency: data.frequency,
    lines: pack.lines,
    senderId,
    senderPassword,
  });

  const submit = await submitRtiXml({
    xml: fps.xml,
    kind: "FPS",
    payeRef: client.payeRef,
    senderId,
    senderPassword,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
    demo: isDemoMode(),
  });

  const payRun = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    payDate: data.payDate,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    payFrequency: data.frequency,
    kind: "FPS",
    status: submit.ok ? "accepted" : "rejected",
    totals: pack.totals,
    lines: pack.lines,
    fpsXmlHash: fps.hash,
    hmrcCorrelationId: submit.correlationId,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.payRuns.push(payRun);
    for (const line of pack.lines) {
      const emp = demoStore.employees.find((e) => e.id === line.employeeId);
      if (emp) {
        emp.firstFpsSent = true;
        emp.previousPayrollId = null;
      }
    }
  } else if (isDeskStoreConfigured()) {
    await deskInsertPayRun({
      id: payRun.id,
      client_id: payRun.clientId,
      pay_date: payRun.payDate,
      period_start: payRun.periodStart,
      period_end: payRun.periodEnd,
      pay_frequency: payRun.payFrequency,
      kind: payRun.kind,
      status: payRun.status,
      totals: payRun.totals,
      lines: payRun.lines,
      fps_xml_hash: payRun.fpsXmlHash,
      hmrc_correlation_id: payRun.hmrcCorrelationId ?? null,
      submitted_at: payRun.submittedAt,
    });
    const ids = pack.lines.map((line) => line.employeeId);
    await deskMarkEmployeesFpsSent(data.clientId, ids);
  } else {
    const { getDb } = await import("@/server/db");
    const { payRuns, employees } = await import("@/server/db/schema");
    const { inArray } = await import("drizzle-orm");
    await getDb().insert(payRuns).values({
      id: payRun.id,
      clientId: payRun.clientId,
      payDate: payRun.payDate,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      payFrequency: data.frequency,
      kind: "FPS",
      status: submit.ok ? "accepted" : "rejected",
      totals: pack.totals,
      lines: pack.lines,
      fpsXmlHash: fps.hash,
      hmrcCorrelationId: submit.correlationId ?? null,
      submittedAt: new Date(),
    });
    const ids = pack.lines.map((l) => l.employeeId);
    if (ids.length) {
      await getDb()
        .update(employees)
        .set({ firstFpsSent: true, previousPayrollId: null })
        .where(inArray(employees.id, ids));
    }
  }

  revalidatePath(`/clients/${data.clientId}/payroll`);
  return {
    ...payRun,
    ok: Boolean(submit.ok),
    kind: "FPS" as const,
    correlationId: submit.correlationId,
  };
}

export async function submitEpsNoPayment(
  input: z.input<typeof epsSchema> & { confirmEndTrial?: boolean },
) {
  return submitEps({
    ...input,
    noPaymentForPeriod: input.noPaymentForPeriod ?? true,
  });
}

/** File EPS — no-payment and/or statutory recoveries (SMP/SPP/…). */
export async function submitEps(
  input: z.input<typeof epsSchema> & { confirmEndTrial?: boolean },
) {
  const session = await requireSession();
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });
  const data = epsSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.payeRef || !client.accountsOfficeRef) {
    throw new Error("Missing PAYE refs");
  }

  const { resolveGatewayCredentialsForSubmit } = await import(
    "@/server/hmrc/gateway-credentials"
  );
  const { senderId, senderPassword } = await resolveGatewayCredentialsForSubmit({
    clientId: data.clientId,
    senderId: data.senderId,
    senderPassword: data.senderPassword,
    useSavedPassword: data.useSavedPassword,
    rememberPassword: data.rememberPassword,
  });

  const { getHmrcConfig } = await import("@/server/hmrc/config");
  const cfg = getHmrcConfig();
  const taxYear = taxYearFromDate(data.periodEnd);
  // HMRC tax-month bounds (From day 06, To day 05) for no-payment and recoveries.
  const fromDay = data.periodStart.slice(8, 10);
  const toDay = data.periodEnd.slice(8, 10);
  if (fromDay !== "06" || toDay !== "05") {
    throw new Error(
      "EPS period must be a UK tax month (start on the 6th, end on the 5th). Check Period start / Period end.",
    );
  }
  if (!client.accountsOfficeRef?.trim()) {
    throw new Error(
      "Accounts Office reference is required for EPS. Enter it under Payroll → Settings.",
    );
  }

  const { rtiTaxMonthNo } = await import("@/server/hmrc/rti-fps-fields");
  const recoverables = {
    taxMonth: rtiTaxMonthNo(data.periodEnd),
    smpRecoveredPence: optionalPoundsToPence(data.smpRecoveredPounds),
    sppRecoveredPence: optionalPoundsToPence(data.sppRecoveredPounds),
    sapRecoveredPence: optionalPoundsToPence(data.sapRecoveredPounds),
    shppRecoveredPence: optionalPoundsToPence(data.shppRecoveredPounds),
    spbpRecoveredPence: optionalPoundsToPence(data.spbpRecoveredPounds),
    sncpRecoveredPence: optionalPoundsToPence(data.sncpRecoveredPounds),
    nicCompensationOnSmpPence: optionalPoundsToPence(data.nicCompSmpPounds),
    nicCompensationOnSppPence: optionalPoundsToPence(data.nicCompSppPounds),
  };
  const { hasRecoverableAmounts } = await import(
    "@/server/payroll/eps-recoverables"
  );
  const {
    APPRENTICESHIP_LEVY_ALLOWANCE_PENCE,
    hasApprenticeshipLevy,
    wholePoundsPence,
  } = await import("@/server/payroll/eps-levy");
  const hasRec = hasRecoverableAmounts(recoverables);
  const levyDueYtdPence = wholePoundsPence(
    optionalPoundsToPence(data.levyDueYtdPounds),
  );
  const levyAnnualAllowancePence = data.levyAnnualAllowancePounds?.trim()
    ? optionalPoundsToPence(data.levyAnnualAllowancePounds)
    : APPRENTICESHIP_LEVY_ALLOWANCE_PENCE;
  const apprenticeshipLevy =
    levyDueYtdPence > 0 || data.levyDueYtdPounds?.trim() || data.levyAnnualAllowancePounds?.trim()
      ? {
          taxMonth: rtiTaxMonthNo(data.periodEnd),
          levyDueYtdPence,
          annualAllowancePence: levyAnnualAllowancePence,
        }
      : null;
  const hasLevy = hasApprenticeshipLevy(apprenticeshipLevy);
  const noPayment = data.noPaymentForPeriod !== false;
  if (!noPayment && !hasRec && !hasLevy) {
    throw new Error(
      "Enter statutory recoveries or apprenticeship levy, or mark that nobody was paid this month.",
    );
  }

  const eps = buildEpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    taxYear,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    noPaymentForPeriod: noPayment,
    recoverables: hasRec ? recoverables : null,
    apprenticeshipLevy: hasLevy ? apprenticeshipLevy : null,
    senderId,
    senderPassword,
  });

  const res = await submitRtiXml({
    xml: eps.xml,
    kind: "EPS",
    payeRef: client.payeRef,
    senderId,
    senderPassword,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
    demo: isDemoMode(),
  });

  const payRun = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    payDate: data.periodEnd,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    payFrequency: "M1",
    kind: "EPS",
    status: res.ok ? "accepted" : "rejected",
    totals: {
      grossPence: 0,
      taxPence: 0,
      employeeNiPence: 0,
      employerNiPence: 0,
      netPence: 0,
      smpRecoveredPence: recoverables.smpRecoveredPence,
      sppRecoveredPence: recoverables.sppRecoveredPence,
      noPaymentForPeriod: noPayment,
    },
    lines: [],
    fpsXmlHash: eps.hash,
    hmrcCorrelationId: res.correlationId,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  if (isDemoMode()) {
    demoStore.payRuns.push(payRun);
  } else if (isDeskStoreConfigured()) {
    await deskInsertPayRun({
      id: payRun.id,
      client_id: payRun.clientId,
      pay_date: payRun.payDate,
      period_start: payRun.periodStart,
      period_end: payRun.periodEnd,
      pay_frequency: payRun.payFrequency,
      kind: payRun.kind,
      status: payRun.status,
      totals: payRun.totals,
      lines: payRun.lines,
      fps_xml_hash: payRun.fpsXmlHash,
      hmrc_correlation_id: payRun.hmrcCorrelationId ?? null,
      submitted_at: payRun.submittedAt,
    });
  } else {
    const { getDb } = await import("@/server/db");
    const { payRuns } = await import("@/server/db/schema");
    await getDb().insert(payRuns).values({
      id: payRun.id,
      clientId: payRun.clientId,
      payDate: payRun.payDate,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      payFrequency: "M1",
      kind: "EPS",
      status: payRun.status as "accepted" | "rejected",
      totals: payRun.totals,
      lines: [],
      fpsXmlHash: payRun.fpsXmlHash,
      hmrcCorrelationId: payRun.hmrcCorrelationId ?? null,
      submittedAt: new Date(),
    });
  }

  revalidatePath(`/clients/${data.clientId}/payroll`);
  return {
    ok: res.ok,
    correlationId: res.correlationId,
    kind: "EPS" as const,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    taxYear,
    env: cfg.env,
  };
}

export async function listPayRuns(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.payRuns
      .filter((p) => p.clientId === clientId)
      .slice()
      .reverse();
  }
  const { isD1Configured } = await import("@/server/db/d1");
  if (isD1Configured()) {
    try {
      const deskRows = await deskListPayRuns(clientId);
      if (deskRows && deskRows.length > 0) {
        return deskRows.map((row) => mapSnakeCaseRow(row));
      }
    } catch (err) {
      console.warn("[payroll] D1 listPayRuns failed; trying Supabase", err);
    }
  } else {
    const deskRows = await deskListPayRuns(clientId).catch(() => null);
    if (deskRows && deskRows.length > 0) {
      return deskRows.map((row) => mapSnakeCaseRow(row));
    }
  }

  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("pay_runs")
        .select("*")
        .eq("client_id", clientId)
        .order("pay_date", { ascending: false });
      if (!error && data?.length) {
        return data.map((row) => mapSnakeCaseRow(row as Record<string, unknown>));
      }
    }
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { getSupabaseAdmin } = await import("@/lib/supabase");
        const { data } = await getSupabaseAdmin()
          .from("pay_runs")
          .select("*")
          .eq("client_id", clientId)
          .order("pay_date", { ascending: false });
        if (data?.length) {
          return data.map((row) =>
            mapSnakeCaseRow(row as Record<string, unknown>),
          );
        }
      }
    } catch {
      /* optional */
    }
  }

  const db = tryGetDb();
  if (!db) return [];
  await ensurePayrollSchema();
  const { payRuns } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select()
    .from(payRuns)
    .where(eq(payRuns.clientId, clientId))
    .orderBy(desc(payRuns.createdAt));
}

export async function getPayRun(clientId: string, runId: string) {
  const runs = await listPayRuns(clientId);
  return (
    runs.find((r) => String((r as { id?: string }).id) === runId) ?? null
  );
}

/** Batch payroll card summaries for the Payroll clients desk. */
export type PayrollClientDeskSummary = PayrollClientSummary & {
  employeeCount: number;
};

export async function listPayrollClientSummaries(
  clientIds: string[],
): Promise<Record<string, PayrollClientDeskSummary>> {
  const out: Record<string, PayrollClientDeskSummary> = {};
  await Promise.all(
    clientIds.map(async (id) => {
      try {
        const [runs, employees] = await Promise.all([
          listPayRuns(id),
          listEmployees(id, { includeLeavers: true }).catch(() => []),
        ]);
        const freqs = employees.map(
          (e) => (e.payFrequency === "W1" ? "W1" : "M1") as "M1" | "W1",
        );
        const activeCount = employees.filter((e) => {
          const row = e as { active?: boolean };
          return row.active !== false;
        }).length;
        out[id] = {
          ...derivePayrollClientSummary(
            runs.map((r) => {
              const row = r as {
                payDate?: string;
                periodStart?: string;
                periodEnd?: string;
                status?: string;
                kind?: string;
                payFrequency?: string;
                hmrcCorrelationId?: string | null;
                submittedAt?: string | Date | null;
              };
              return {
                payDate: row.payDate,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                status: row.status,
                kind: row.kind,
                payFrequency: row.payFrequency,
                hmrcCorrelationId: row.hmrcCorrelationId,
                submittedAt: row.submittedAt,
              };
            }),
            freqs,
          ),
          employeeCount: activeCount,
        };
      } catch {
        out[id] = { ...derivePayrollClientSummary([], []), employeeCount: 0 };
      }
    }),
  );
  return out;
}

function totalsFromLines(lines: PayLine[]) {
  return {
    grossPence: lines.reduce((s, l) => s + (l.grossPence ?? 0), 0),
    taxPence: lines.reduce((s, l) => s + (l.taxPence ?? 0), 0),
    employeeNiPence: lines.reduce((s, l) => s + (l.employeeNiPence ?? 0), 0),
    employerNiPence: lines.reduce((s, l) => s + (l.employerNiPence ?? 0), 0),
    netPence: lines.reduce((s, l) => s + (l.netPence ?? 0), 0),
  };
}

async function persistPayRunLines(
  runId: string,
  clientId: string,
  lines: PayLine[],
  totals: ReturnType<typeof totalsFromLines>,
) {
  if (isDemoMode()) {
    const hit = demoStore.payRuns.find((r) => String(r.id) === runId);
    if (hit) {
      hit.lines = lines;
      hit.totals = totals;
    }
    return;
  }
  if (isDeskStoreConfigured()) {
    await deskUpdatePayRun(runId, { lines, totals });
    if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { getSupabaseAdmin } = await import("@/lib/supabase");
        await getSupabaseAdmin()
          .from("pay_runs")
          .update({ lines, totals })
          .eq("id", runId);
      } catch {
        /* dual-write best-effort */
      }
    }
    return;
  }
  const db = tryGetDb();
  if (!db) return;
  const { payRuns } = await import("@/server/db/schema");
  const { eq, and } = await import("drizzle-orm");
  await db
    .update(payRuns)
    .set({ lines, totals })
    .where(and(eq(payRuns.id, runId), eq(payRuns.clientId, clientId)));
}

/**
 * After RTI is filed: reverse one employee payslip so YTD excludes it.
 * Desk then regenerates / files an amended FPS with corrected figures.
 */
export async function reversePayslip(input: {
  clientId: string;
  runId: string;
  employeeId: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  await getClient(input.clientId);

  const run = await getPayRun(input.clientId, input.runId);
  if (!run) return { ok: false as const };

  const row = run as {
    id?: string;
    status?: string;
    hmrcCorrelationId?: string | null;
    kind?: string;
    lines?: PayLine[];
  };
  if (String(row.kind ?? "FPS") !== "FPS") return { ok: false as const };
  if (!isPayrollRtiSubmitted(row)) return { ok: false as const };

  const lines = Array.isArray(row.lines) ? [...row.lines] : [];
  const idx = lines.findIndex((l) => l.employeeId === input.employeeId);
  if (idx < 0) return { ok: false as const };
  if (lines[idx]!.reversed) return { ok: true as const, already: true };

  lines[idx] = {
    ...lines[idx]!,
    reversed: true,
    reversedAt: new Date().toISOString(),
  };
  const active = lines.filter((l) => !l.reversed);
  const totals = totalsFromLines(active);

  await persistPayRunLines(input.runId, input.clientId, lines, totals);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "payroll.payslip.reverse",
    entityType: "pay_run",
    entityId: input.runId,
    detail: { employeeId: input.employeeId },
  }).catch(() => undefined);

  revalidatePath(`/clients/${input.clientId}/payroll`);
  return { ok: true as const };
}

/**
 * Build a ready amend draft for a previously filed (and typically reversed) period.
 * Accountant edits employees then files FPS again — corrected YTD is the HMRC path.
 */
export async function prepareAmendedPayRun(input: {
  clientId: string;
  runId: string;
  employeeId?: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  await getClient(input.clientId);

  const run = await getPayRun(input.clientId, input.runId);
  if (!run) return { ok: false as const };

  const row = run as {
    id?: string;
    payDate?: string;
    periodStart?: string;
    periodEnd?: string;
    payFrequency?: string;
    status?: string;
    hmrcCorrelationId?: string | null;
    kind?: string;
    lines?: PayLine[];
    totals?: Record<string, number>;
  };
  if (String(row.kind ?? "FPS") !== "FPS") return { ok: false as const };
  if (!isPayrollRtiSubmitted(row)) return { ok: false as const };
  if (!row.payDate || !row.periodStart || !row.periodEnd) {
    return { ok: false as const };
  }

  const frequency = (row.payFrequency === "W1" ? "W1" : "M1") as PayFrequency;
  const sourceLines = Array.isArray(row.lines) ? row.lines : [];

  // Prefer a fresh calc so YTD reflects reverses; fall back to cloning lines.
  let lines: PayLine[] = [];
  let totals = row.totals ?? totalsFromLines([]);
  try {
    const pack = await buildPayRunPackage({
      clientId: input.clientId,
      payDate: row.payDate,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      frequency,
      submit: false,
    });
    lines = pack.lines.map((l) => ({
      ...l,
      amendsRunId: input.runId,
    }));
    if (input.employeeId) {
      lines = lines.filter((l) => l.employeeId === input.employeeId);
    }
    totals = pack.totals;
  } catch {
    lines = sourceLines
      .filter((l) => (input.employeeId ? l.employeeId === input.employeeId : true))
      .filter((l) => l.reversed)
      .map((l) => {
        const { reversed: _r, reversedAt: _a, ...rest } = l;
        return { ...rest, amendsRunId: input.runId, reversed: false };
      });
    totals = totalsFromLines(lines);
  }

  if (!lines.length) return { ok: false as const };

  // Soft-mark remaining active lines on the original as reversed when amending all.
  if (!input.employeeId) {
    const marked = sourceLines.map((l) =>
      l.reversed
        ? l
        : { ...l, reversed: true, reversedAt: new Date().toISOString() },
    );
    await persistPayRunLines(
      input.runId,
      input.clientId,
      marked,
      totalsFromLines(marked.filter((l) => !l.reversed)),
    );
  }

  const payRun = {
    id: crypto.randomUUID(),
    clientId: input.clientId,
    payDate: row.payDate,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    payFrequency: frequency,
    kind: "FPS",
    status: "ready",
    totals,
    lines,
    fpsXmlHash: null as string | null,
    hmrcCorrelationId: null as string | null,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  // Drop any prior unfiled amend draft for the same date/frequency.
  if (isDemoMode()) {
    demoStore.payRuns = demoStore.payRuns.filter((r) => {
      if (String(r.clientId) !== input.clientId) return true;
      if (String(r.payDate) !== row.payDate) return true;
      if (String(r.kind ?? "FPS") !== "FPS") return true;
      if (String(r.payFrequency ?? "M1") !== frequency) return true;
      if (String(r.status) !== "ready") return true;
      const ls = Array.isArray(r.lines) ? (r.lines as PayLine[]) : [];
      return !ls.some((l) => l.amendsRunId === input.runId);
    });
    demoStore.payRuns.push(payRun);
  } else if (isDeskStoreConfigured()) {
    await deskInsertPayRun({
      id: payRun.id,
      client_id: payRun.clientId,
      pay_date: payRun.payDate,
      period_start: payRun.periodStart,
      period_end: payRun.periodEnd,
      pay_frequency: payRun.payFrequency,
      kind: payRun.kind,
      status: payRun.status,
      totals: payRun.totals,
      lines: payRun.lines,
      fps_xml_hash: null,
      hmrc_correlation_id: null,
      submitted_at: payRun.submittedAt,
    });
  } else {
    const { getDb } = await import("@/server/db");
    const { payRuns } = await import("@/server/db/schema");
    await getDb().insert(payRuns).values({
      id: payRun.id,
      clientId: payRun.clientId,
      payDate: payRun.payDate,
      periodStart: payRun.periodStart,
      periodEnd: payRun.periodEnd,
      payFrequency: frequency,
      kind: "FPS",
      status: "ready",
      totals: payRun.totals,
      lines: payRun.lines,
      fpsXmlHash: null,
      hmrcCorrelationId: null,
      submittedAt: new Date(),
    });
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "payroll.run.amend_draft",
    entityType: "pay_run",
    entityId: payRun.id,
    detail: { amendsRunId: input.runId, employeeId: input.employeeId ?? null },
  }).catch(() => undefined);

  revalidatePath(`/clients/${input.clientId}/payroll`);
  return {
    ok: true as const,
    runId: payRun.id,
    payDate: payRun.payDate,
  };
}

/**
 * File FPS for an existing ready pay run (including amend drafts).
 * Quiet failure when credentials or refs are missing.
 */
export async function submitSavedPayRun(
  input: {
    clientId: string;
    runId: string;
    senderId?: string;
    senderPassword?: string;
    useSavedPassword?: boolean;
    rememberPassword?: boolean;
    confirmEndTrial?: boolean;
  },
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });

  const client = await getClient(input.clientId);
  const run = await getPayRun(input.clientId, input.runId);
  if (!run) return { ok: false as const };

  const row = run as {
    id?: string;
    payDate?: string;
    periodStart?: string;
    periodEnd?: string;
    payFrequency?: string;
    status?: string;
    kind?: string;
    lines?: PayLine[];
    totals?: Record<string, number>;
  };
  if (String(row.kind ?? "FPS") !== "FPS") return { ok: false as const };
  if (String(row.status) !== "ready") return { ok: false as const };
  if (!client.payeRef || !client.accountsOfficeRef) return { ok: false as const };
  if (!row.payDate) return { ok: false as const };

  const lines = (Array.isArray(row.lines) ? row.lines : []).filter(
    (l) => !l.reversed,
  );
  if (!lines.length) return { ok: false as const };

  const frequency = (row.payFrequency === "W1" ? "W1" : "M1") as PayFrequency;
  const taxYear = taxYearFromDate(row.payDate);

  const { resolveGatewayCredentialsForSubmit } = await import(
    "@/server/hmrc/gateway-credentials"
  );
  const { senderId, senderPassword } = await resolveGatewayCredentialsForSubmit({
    clientId: input.clientId,
    senderId: input.senderId,
    senderPassword: input.senderPassword,
    useSavedPassword: input.useSavedPassword,
    rememberPassword: input.rememberPassword,
  });

  const fps = buildFpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    payDate: row.payDate,
    taxYear,
    frequency,
    lines,
    senderId,
    senderPassword,
  });

  const submit = await submitRtiXml({
    xml: fps.xml,
    kind: "FPS",
    payeRef: client.payeRef,
    senderId,
    senderPassword,
    actorId: session.userId,
    clientId: input.clientId,
    practiceId: session.practiceId,
    demo: isDemoMode(),
  });

  const nextStatus = submit.ok ? "accepted" : "rejected";
  const submittedAt = new Date().toISOString();

  if (isDemoMode()) {
    const hit = demoStore.payRuns.find((r) => String(r.id) === input.runId);
    if (hit) {
      hit.status = nextStatus;
      hit.fpsXmlHash = fps.hash;
      hit.hmrcCorrelationId = submit.correlationId;
      hit.submittedAt = submittedAt;
      hit.lines = lines;
    }
    if (submit.ok) {
      for (const line of lines) {
        const emp = demoStore.employees.find((e) => e.id === line.employeeId);
        if (emp) {
          emp.firstFpsSent = true;
          emp.previousPayrollId = null;
        }
      }
    }
  } else if (isDeskStoreConfigured()) {
    await deskUpdatePayRun(input.runId, {
      status: nextStatus,
      lines,
      totals: row.totals ?? totalsFromLines(lines),
      fps_xml_hash: fps.hash,
      hmrc_correlation_id: submit.correlationId ?? null,
      submitted_at: submittedAt,
    });
    if (submit.ok) {
      await deskMarkEmployeesFpsSent(
        input.clientId,
        lines.map((l) => l.employeeId),
      );
    }
  } else {
    const { getDb } = await import("@/server/db");
    const { payRuns, employees } = await import("@/server/db/schema");
    const { eq, and, inArray } = await import("drizzle-orm");
    await getDb()
      .update(payRuns)
      .set({
        status: nextStatus as "accepted" | "rejected",
        fpsXmlHash: fps.hash,
        hmrcCorrelationId: submit.correlationId ?? null,
        submittedAt: new Date(),
        lines,
      })
      .where(
        and(eq(payRuns.id, input.runId), eq(payRuns.clientId, input.clientId)),
      );
    if (submit.ok) {
      const ids = lines.map((l) => l.employeeId);
      if (ids.length) {
        await getDb()
          .update(employees)
          .set({ firstFpsSent: true, previousPayrollId: null })
          .where(inArray(employees.id, ids));
      }
    }
  }

  revalidatePath(`/clients/${input.clientId}/payroll`);
  return {
    ok: Boolean(submit.ok),
    kind: "FPS" as const,
    correlationId: submit.correlationId,
    status: nextStatus,
  };
}

/**
 * Bacs Standard 18 Direct Credit file for a pay run.
 * Null when originator settings incomplete or no staff bank details / net pay.
 */
export async function downloadBacsStandard18(input: {
  clientId: string;
  runId: string;
}) {
  await requireSession();
  await getClient(input.clientId);
  const { getPayrollDeskSettings } = await import(
    "@/server/actions/payroll-settings"
  );
  const settings = await getPayrollDeskSettings(input.clientId);
  const {
    bacsOriginatorReady,
    buildBacsStandard18File,
  } = await import("@/server/payroll/exports/bacs-standard18");
  const originator = {
    serviceUserNumber: settings.bacsServiceUserNumber ?? "",
    sortCode: settings.bacsOriginatorSortCode ?? "",
    accountNumber: settings.bacsOriginatorAccountNumber ?? "",
    accountName: settings.bacsOriginatorName ?? "",
    fileSerial: settings.bacsFileSerial,
  };
  if (!bacsOriginatorReady(originator)) return null;

  const run = await getPayRun(input.clientId, input.runId);
  if (!run) return null;
  const payDate = String((run as { payDate?: string }).payDate ?? "");
  if (!payDate) return null;
  const lines = Array.isArray((run as { lines?: PayLine[] }).lines)
    ? (run as { lines: PayLine[] }).lines
    : [];
  if (!lines.length) return null;

  const employees = await listEmployees(input.clientId);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const payments = lines
    .map((l) => {
      const emp = byId.get(l.employeeId);
      return {
        sortCode: emp?.bankSortCode ?? "",
        accountNumber: emp?.bankAccountNumber ?? "",
        accountName:
          emp?.bankAccountName?.trim() ||
          `${l.forename} ${l.surname}`.trim(),
        amountPence: l.netPence ?? 0,
        reference: (l.payrollId || "SALARY").slice(0, 18),
      };
    })
    .filter((p) => p.amountPence > 0);

  const text = buildBacsStandard18File({
    originator,
    payments,
    processingDateIso: payDate,
  });
  if (!text) return null;
  return {
    filename: `bacs-credits-${payDate}.txt`,
    text,
  };
}

/** NEST contribution CSV for a completed pay run — null when nothing to export. */
export async function downloadNestContributionsCsv(input: {
  clientId: string;
  runId: string;
}) {
  await requireSession();
  await getClient(input.clientId);
  const run = await getPayRun(input.clientId, input.runId);
  if (!run) return null;
  const lines = (
    Array.isArray((run as { lines?: PayLine[] }).lines)
      ? (run as { lines: PayLine[] }).lines
      : []
  ).filter(
    (l) =>
      (l.pensionEmployeePence ?? 0) > 0 || (l.pensionEmployerPence ?? 0) > 0,
  );
  if (!lines.length) return null;
  const { buildNestContributionsCsv } = await import(
    "@/server/payroll/exports/nest-csv"
  );
  const payDate = String((run as { payDate?: string }).payDate ?? "");
  const csv = buildNestContributionsCsv(
    lines.map((l) => ({
      nino: l.nino,
      forename: l.forename,
      surname: l.surname,
      payDate,
      employeeContributionPence: l.pensionEmployeePence ?? 0,
      employerContributionPence: l.pensionEmployerPence ?? 0,
      pensionablePayPence: l.taxablePence ?? l.grossPence,
    })),
  );
  const safeDate = payDate || "export";
  return {
    filename: `nest-contributions-${safeDate}.csv`,
    csv,
  };
}

/**
 * Suggest EPS recovery figures from YTD statutory paid on FPS lines this tax year.
 * Accountant still confirms — recovery % (92% / 109%) is applied as 92% default.
 */
/** Suggest apprenticeship levy figures from YTD NI’able gross this tax year. */
export async function suggestApprenticeshipLevy(input: {
  clientId: string;
  periodEnd: string;
  annualAllowancePounds?: string;
}) {
  await requireSession();
  await getClient(input.clientId);
  const taxYear = taxYearFromDate(input.periodEnd);
  const { rtiTaxMonthNo } = await import("@/server/hmrc/rti-fps-fields");
  const {
    APPRENTICESHIP_LEVY_ALLOWANCE_PENCE,
    computeLevyDueYtdPence,
  } = await import("@/server/payroll/eps-levy");
  const runs = await listPayRuns(input.clientId);
  let payBillYtd = 0;
  for (const run of runs) {
    const kind = String((run as { kind?: string }).kind ?? "FPS");
    if (kind === "EPS") continue;
    const payDate = String((run as { payDate?: string }).payDate ?? "");
    if (!payDate || taxYearFromDate(payDate) !== taxYear) continue;
    const lines = Array.isArray((run as { lines?: PayLine[] }).lines)
      ? ((run as { lines: PayLine[] }).lines)
      : [];
    for (const l of lines) {
      payBillYtd += l.grossPence ?? 0;
    }
  }
  const allowance = input.annualAllowancePounds?.trim()
    ? optionalPoundsToPence(input.annualAllowancePounds)
    : APPRENTICESHIP_LEVY_ALLOWANCE_PENCE;
  const taxMonth = rtiTaxMonthNo(input.periodEnd);
  const due = computeLevyDueYtdPence({
    payBillYtdPence: payBillYtd,
    taxMonth,
    annualAllowancePence: allowance,
  });
  const toPounds = (p: number) => (p / 100).toFixed(2);
  return {
    levyDueYtdPounds: toPounds(due),
    levyAnnualAllowancePounds: toPounds(allowance),
    payBillYtdPounds: toPounds(payBillYtd),
    taxMonth,
  };
}

export async function suggestEpsRecoverables(input: {
  clientId: string;
  periodEnd: string;
}) {
  await requireSession();
  await getClient(input.clientId);
  const taxYear = taxYearFromDate(input.periodEnd);
  const runs = await listPayRuns(input.clientId);
  let smpYtd = 0;
  let sppYtd = 0;
  let sapYtd = 0;
  let shppYtd = 0;
  let spbpYtd = 0;
  let sncpYtd = 0;
  for (const run of runs) {
    const kind = String((run as { kind?: string }).kind ?? "FPS");
    if (kind === "EPS") continue;
    const payDate = String((run as { payDate?: string }).payDate ?? "");
    if (!payDate || taxYearFromDate(payDate) !== taxYear) continue;
    const lines = Array.isArray((run as { lines?: PayLine[] }).lines)
      ? ((run as { lines: PayLine[] }).lines)
      : [];
    for (const l of lines) {
      smpYtd = Math.max(smpYtd, l.ytdSmpPence ?? l.smpPence ?? 0);
      sppYtd = Math.max(sppYtd, l.ytdSppPence ?? l.sppPence ?? 0);
      sapYtd = Math.max(sapYtd, l.ytdSapPence ?? l.sapPence ?? 0);
      shppYtd = Math.max(shppYtd, l.ytdShppPence ?? l.shppPence ?? 0);
      spbpYtd = Math.max(spbpYtd, l.ytdSpbpPence ?? l.spbpPence ?? 0);
      sncpYtd = Math.max(sncpYtd, l.ytdSncpPence ?? l.sncpPence ?? 0);
    }
  }
  // Standard recovery 92% (non small-employer) — GOV.UK employer rates.
  const rateBps = 9200;
  const apply = (n: number) =>
    n > 0 ? Math.floor((n * rateBps) / 10_000 / 100) * 100 : 0;
  const toPounds = (p: number) =>
    p > 0 ? (p / 100).toFixed(2) : "";
  return {
    smpRecoveredPounds: toPounds(apply(smpYtd)),
    sppRecoveredPounds: toPounds(apply(sppYtd)),
    sapRecoveredPounds: toPounds(apply(sapYtd)),
    shppRecoveredPounds: toPounds(apply(shppYtd)),
    spbpRecoveredPounds: toPounds(apply(spbpYtd)),
    sncpRecoveredPounds: toPounds(apply(sncpYtd)),
  };
}

export async function getTimesheetMeta(
  clientId: string,
  periodStart: string,
  periodEnd: string,
) {
  await getClient(clientId);
  const rows = await loadTimesheetRows(clientId, periodStart, periodEnd);
  return { rowCount: rows.length };
}

export async function importTimesheet(formData: FormData) {
  const session = await requireSession();
  const clientId = String(formData.get("clientId") || "");
  const periodStart = String(formData.get("periodStart") || "");
  const periodEnd = String(formData.get("periodEnd") || "");
  const file = formData.get("file");
  if (!clientId || !periodStart || !periodEnd) {
    throw new Error("Period dates are required for a timesheet.");
  }
  await getClient(clientId);
  await ensurePayrollSchema();
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an Excel timesheet (.xlsx or .csv).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseTimesheetBuffer(buffer);
  if (parsed.rows.length === 0) {
    throw new Error(
      "No timesheet rows found. Use payroll ID, NI number or name plus hours.",
    );
  }
  const employees = await listEmployees(clientId, { includeLeavers: true });
  const matched = parsed.rows.filter((r) => matchTimesheetRow(r, employees)).length;
  const record = {
    id: crypto.randomUUID(),
    clientId,
    periodStart,
    periodEnd,
    filename: file.name,
    rows: parsed.rows,
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.payrollTimesheets = demoStore.payrollTimesheets.filter(
      (t) =>
        !(
          t.clientId === clientId &&
          t.periodStart === periodStart &&
          t.periodEnd === periodEnd
        ),
    );
    demoStore.payrollTimesheets.push(record);
  } else if (isDeskStoreConfigured()) {
    await deskUpsertTimesheet({
      id: record.id,
      client_id: clientId,
      period_start: periodStart,
      period_end: periodEnd,
      filename: record.filename,
      rows: parsed.rows,
    });
  } else {
    const { getDb } = await import("@/server/db");
    const { payrollTimesheets } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await getDb()
      .delete(payrollTimesheets)
      .where(
        and(
          eq(payrollTimesheets.clientId, clientId),
          eq(payrollTimesheets.periodStart, periodStart),
          eq(payrollTimesheets.periodEnd, periodEnd),
        ),
      );
    await getDb().insert(payrollTimesheets).values({
      id: record.id,
      clientId,
      periodStart,
      periodEnd,
      filename: record.filename,
      rows: parsed.rows,
    });
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "payroll.timesheet.import",
    entityType: "payroll_timesheet",
    entityId: record.id,
    detail: { rows: parsed.rows.length, matched, filename: file.name },
  });
  revalidatePath(`/clients/${clientId}/payroll`);
  return {
    ok: true,
    rows: parsed.rows.length,
    matched,
    unmatchedHeaders: parsed.unmatchedHeaders,
  };
}

export async function timesheetTemplateBase64() {
  await requireSession();
  return timesheetTemplateBuffer().toString("base64");
}

export async function getPayrollPackSettings(clientId: string) {
  const client = await getClient(clientId);
  let encrypted: string | null | undefined;
  if (isDemoMode()) {
    encrypted = demoStore.clients.find(
      (c) => c.id === clientId,
    )?.payrollPackPasswordEncrypted;
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase
      .from("clients")
      .select("payroll_pack_password_encrypted")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw new Error(`Could not load payroll settings: ${error.message}`);
    encrypted = data?.payroll_pack_password_encrypted;
  } else if (hasDatabase()) {
    await ensurePayrollSchema();
    encrypted = (client as { payrollPackPasswordEncrypted?: string | null })
      .payrollPackPasswordEncrypted;
  }
  return {
    hasPackPassword: Boolean(encrypted),
    contactEmail: client.contactEmail ?? null,
  };
}

const packPasswordSchema = z.object({
  clientId: z.string(),
  password: z.string().min(8).max(128),
});

export async function savePayrollPackPassword(
  input: z.infer<typeof packPasswordSchema>,
) {
  const session = await requireSession();
  const data = packPasswordSchema.parse(input);
  await getClient(data.clientId);
  await ensurePayrollSchema();
  const encrypted = encryptSecret(data.password);
  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (!row) throw new Error("Client not found");
    row.payrollPackPasswordEncrypted = encrypted;
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase
      .from("clients")
      .update({
        payroll_pack_password_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(`Could not save payroll password: ${error.message}`);
  } else {
    const { getDb } = await import("@/server/db");
    const { clients } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(clients)
      .set({ payrollPackPasswordEncrypted: encrypted })
      .where(eq(clients.id, data.clientId));
  }
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "payroll.pack.password.save",
    entityType: "client",
    entityId: data.clientId,
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return { ok: true };
}

async function resolvePackPassword(clientId: string, override?: string) {
  if (override && override.length >= 8) return override;
  const client = await getClient(clientId);
  let encrypted: string | null | undefined;
  if (isDemoMode()) {
    encrypted = demoStore.clients.find(
      (c) => c.id === clientId,
    )?.payrollPackPasswordEncrypted;
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase
      .from("clients")
      .select("payroll_pack_password_encrypted")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw new Error(`Could not load payroll password: ${error.message}`);
    encrypted = data?.payroll_pack_password_encrypted;
  } else {
    encrypted = (client as { payrollPackPasswordEncrypted?: string | null })
      .payrollPackPasswordEncrypted;
  }
  if (!encrypted) {
    throw new Error(
      "Set a pack password first (at least 8 characters). You choose it — the client uses the same password to open the zip.",
    );
  }
  return decryptSecret(encrypted);
}

async function zipForRun(clientId: string, runId: string, password: string) {
  const client = await getClient(clientId);
  const run = await getPayRun(clientId, runId);
  if (!run) throw new Error("Pay run not found");
  const lines = (
    Array.isArray((run as { lines?: PayLine[] }).lines)
      ? (run as { lines: PayLine[] }).lines
      : []
  ) as PayLine[];
  if (lines.length === 0) {
    throw new Error("This run has no payslips to pack.");
  }
  const zip = await buildPayrollPackZip({
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    payDate: String((run as { payDate?: string }).payDate ?? ""),
    periodStart: String((run as { periodStart?: string }).periodStart ?? ""),
    periodEnd: String((run as { periodEnd?: string }).periodEnd ?? ""),
    frequency: String((run as { payFrequency?: string }).payFrequency ?? "M1"),
    lines,
    password,
  });
  const payDate = String((run as { payDate?: string }).payDate ?? "payroll");
  return {
    zip,
    filename: `hydratax-payroll-${payDate}.zip`,
    payDate,
    lineCount: lines.length,
  };
}

const sendPackSchema = z.object({
  clientId: z.string(),
  runId: z.string(),
  toEmail: z.string().email(),
  password: z.string().min(8).max(128).optional(),
});

export async function downloadPayrollPack(input: {
  clientId: string;
  runId: string;
  password?: string;
}) {
  await requireSession();
  const password = await resolvePackPassword(input.clientId, input.password);
  const pack = await zipForRun(input.clientId, input.runId, password);
  return {
    filename: pack.filename,
    base64: pack.zip.toString("base64"),
  };
}

export async function sendPayrollPack(input: z.infer<typeof sendPackSchema>) {
  const session = await requireSession();
  const data = sendPackSchema.parse(input);
  await getClient(data.clientId);
  const password = await resolvePackPassword(data.clientId, data.password);
  const pack = await zipForRun(data.clientId, data.runId, password);

  const from = process.env.EMAIL_FROM ?? "HydraTax <onboarding@resend.dev>";
  const resendKey = process.env.RESEND_API_KEY;
  let delivery: "resend" | "logged" = "logged";

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.toEmail],
        subject: `Payroll pack ${pack.payDate} — password-protected`,
        text: `Please find attached the password-protected payroll pack for ${pack.payDate} (${pack.lineCount} payslip${pack.lineCount === 1 ? "" : "s"} plus a period summary).\n\nOpen the zip with the password your accountant has given you. Do not forward the password in the same email thread.`,
        attachments: [
          {
            filename: pack.filename,
            content: pack.zip.toString("base64"),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[payroll.sendPack] email provider error, status", res.status);
      throw new Error(`Email provider error (${res.status}). Please try again.`);
    }
    delivery = "resend";
  }

  if (isDemoMode()) {
    const c = demoStore.clients.find((x) => x.id === data.clientId);
    if (c) c.contactEmail = data.toEmail;
    demoStore.emailLogs.push({
      id: crypto.randomUUID(),
      practiceId: session.practiceId,
      clientId: data.clientId,
      sentBy: session.userId,
      fromEmail:
        session.email ??
        (from.match(/<([^>]+)>/)?.[1] ?? "unknown"),
      toEmail: data.toEmail,
      subject: `Payroll pack ${pack.payDate}`,
      messagePreview: `Payroll pack for ${pack.payDate}`,
      kind: "payroll_pack",
      documentCount: pack.lineCount + 1,
      delivery,
      accountsDue: null,
      createdAt: new Date().toISOString(),
    });
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "payroll.pack.send",
    entityType: "pay_run",
    entityId: data.runId,
    detail: {
      toDomain: data.toEmail.split("@")[1] ?? "unknown",
      documentCount: pack.lineCount + 1,
      delivery,
    },
  });

  try {
    const { appendClientWorkLog } = await import("@/server/actions/desk");
    await appendClientWorkLog({
      clientId: data.clientId,
      kind: "email",
      label: `Email sent — Payroll pack ${pack.payDate}`,
      detail: `To ${data.toEmail}`,
      desk: "paye",
    });
  } catch {
    /* freeze path — work log best-effort */
  }

  return {
    ok: true,
    delivery,
    filename: pack.filename,
    base64: pack.zip.toString("base64"),
    message: "Emailed to the client.",
  };
}

const employeePackSchema = z.object({
  clientId: z.string(),
  employeeId: z.string(),
  /** Inclusive YYYY-MM-DD — payslips with payDate in range. */
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toEmail: z.string().email().optional(),
});

async function employeePayslipItems(
  clientId: string,
  employeeId: string,
  fromDate: string,
  toDate: string,
) {
  await getEmployeeOrThrow(clientId, employeeId);
  const runs = await listPayRuns(clientId);
  const items: Array<{
    payDate: string;
    periodStart: string;
    periodEnd: string;
    frequency: string;
    line: PayLine;
  }> = [];
  for (const run of runs) {
    const payDate = String((run as { payDate?: string }).payDate ?? "");
    if (!payDate || payDate < fromDate || payDate > toDate) continue;
    const status = String((run as { status?: string }).status ?? "");
    if (status === "rejected") continue;
    const lines = Array.isArray((run as { lines?: PayLine[] }).lines)
      ? ((run as { lines: PayLine[] }).lines as PayLine[])
      : [];
    const line = lines.find((l) => l.employeeId === employeeId);
    if (!line) continue;
    items.push({
      payDate,
      periodStart: String((run as { periodStart?: string }).periodStart ?? payDate),
      periodEnd: String((run as { periodEnd?: string }).periodEnd ?? payDate),
      frequency: String((run as { payFrequency?: string }).payFrequency ?? "M1"),
      line,
    });
  }
  items.sort((a, b) => a.payDate.localeCompare(b.payDate));
  return items;
}

/** Download/email one employee’s payslips across a custom date range (PDF zip). */
export async function downloadEmployeePayslipPack(
  input: z.infer<typeof employeePackSchema>,
) {
  await requireSession();
  const data = employeePackSchema.parse(input);
  const client = await getClient(data.clientId);
  const password = await resolvePackPassword(data.clientId);
  const items = await employeePayslipItems(
    data.clientId,
    data.employeeId,
    data.fromDate,
    data.toDate,
  );
  const zip = await buildEmployeePayslipPackZip({
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    password,
    items,
  });
  const emp = await getEmployeeOrThrow(data.clientId, data.employeeId);
  return {
    filename: `hydratax-${emp.forename}-payslips-${data.fromDate}_${data.toDate}.zip`,
    base64: zip.toString("base64"),
    count: items.length,
  };
}

export async function sendEmployeePayslipPack(
  input: z.infer<typeof employeePackSchema>,
) {
  const session = await requireSession();
  const data = employeePackSchema.parse(input);
  if (!data.toEmail) throw new Error("Email address required");
  const client = await getClient(data.clientId);
  const password = await resolvePackPassword(data.clientId);
  const items = await employeePayslipItems(
    data.clientId,
    data.employeeId,
    data.fromDate,
    data.toDate,
  );
  const zip = await buildEmployeePayslipPackZip({
    employerName: client.name,
    payeRef: client.payeRef ?? "—",
    password,
    items,
  });
  const emp = await getEmployeeOrThrow(data.clientId, data.employeeId);
  const filename = `hydratax-${emp.forename}-payslips-${data.fromDate}_${data.toDate}.zip`;
  const from = process.env.EMAIL_FROM ?? "HydraTax <onboarding@resend.dev>";
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.toEmail],
        subject: `Payslips — ${emp.forename} ${emp.surname}`,
        text: `Password-protected payslip pack for ${emp.forename} ${emp.surname} (${items.length} payslip${items.length === 1 ? "" : "s"}, ${data.fromDate} to ${data.toDate}).\n\nUse the pack password your accountant shared with you.`,
        attachments: [{ filename, content: zip.toString("base64") }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Email provider error (${res.status}). Please try again.`);
    }
  }
  void session;
  return {
    ok: true,
    filename,
    base64: zip.toString("base64"),
    message: "Emailed to the client.",
    count: items.length,
  };
}

const statutoryEmailSchema = z.object({
  clientId: z.string(),
  employeeId: z.string(),
  kind: z.enum(["p60", "p45"]),
  taxYear: z.string().optional(),
  toEmail: z.string().email(),
});

/** Email a filled P60 or P45 PDF (password-protected zip of one file). */
export async function sendStatutoryDocument(
  input: z.infer<typeof statutoryEmailSchema>,
) {
  await requireSession();
  const data = statutoryEmailSchema.parse(input);
  await getClient(data.clientId);
  const password = await resolvePackPassword(data.clientId);
  const emp = await getEmployeeOrThrow(data.clientId, data.employeeId);
  let pdf: Buffer;
  let label: string;
  if (data.kind === "p60") {
    pdf = Buffer.from(
      await getEmployeeP60Pdf(data.clientId, data.employeeId, data.taxYear),
    );
    label = `P60-${emp.surname}-${data.taxYear || "current"}`;
  } else {
    pdf = Buffer.from(await getEmployeeP45Pdf(data.clientId, data.employeeId));
    label = `P45-${emp.surname}`;
  }
  const { createPasswordProtectedZip } = await import(
    "@/server/payroll/zip-crypto"
  );
  const zip = createPasswordProtectedZip(
    [{ name: `${label}.pdf`, data: pdf }],
    password,
  );
  const filename = `hydratax-${label}.zip`;
  const from = process.env.EMAIL_FROM ?? "HydraTax <onboarding@resend.dev>";
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.toEmail],
        subject: `${data.kind.toUpperCase()} — ${emp.forename} ${emp.surname}`,
        text: `Attached is a password-protected ${data.kind.toUpperCase()} for ${emp.forename} ${emp.surname}.\n\nUse the pack password your accountant shared with you.`,
        attachments: [{ filename, content: zip.toString("base64") }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Email provider error (${res.status}). Please try again.`);
    }
  }
  return {
    ok: true,
    filename,
    base64: zip.toString("base64"),
    message: "Emailed to the client.",
  };
}

async function getEmployeeOrThrow(clientId: string, employeeId: string) {
  const all = await listEmployees(clientId, { includeLeavers: true });
  const emp = all.find((e) => e.id === employeeId);
  if (!emp) throw new Error("Employee not found");
  return emp;
}

function broughtForwardForYear(
  emp: PayrollEmployee,
  taxYear: string,
): BroughtForwardYtd | null {
  if (!emp.bfTaxYear || emp.bfTaxYear !== taxYear) return null;
  if (
    emp.bfTaxablePence <= 0 &&
    emp.bfTaxPence <= 0 &&
    emp.bfEmployeeNiPence <= 0
  ) {
    return null;
  }
  return {
    taxYear: emp.bfTaxYear,
    taxablePence: emp.bfTaxablePence,
    taxPence: emp.bfTaxPence,
    employeeNiPence: emp.bfEmployeeNiPence,
  };
}

async function statutoryPackForEmployee(
  clientId: string,
  employeeId: string,
  kind: "p45" | "p60",
  taxYear?: string,
) {
  await requireSession();
  await ensurePayrollSchema();
  const client = await getClient(clientId);
  const emp = await getEmployeeOrThrow(clientId, employeeId);
  if (kind === "p45" && !emp.leaveDate) {
    throw new Error("Mark the employee as a leaver before issuing a P45.");
  }
  const year =
    kind === "p45"
      ? taxYearFromDate(emp.leaveDate!)
      : taxYear?.trim() ||
        taxYearFromDate(new Date().toISOString().slice(0, 10));
  const runs = await listPayRuns(clientId);
  const thisEmployment = ytdFromRuns(emp.id, year, runs);
  const previous = broughtForwardForYear(emp, year);
  const employer = {
    name: client.name,
    payeRef: client.payeRef ?? "",
    accountsOfficeRef: client.accountsOfficeRef,
  };
  const employee = {
    forename: emp.forename,
    surname: emp.surname,
    nino: emp.nino,
    taxCode: emp.taxCode,
    payrollId: emp.payrollId,
    startDate: emp.startDate,
    leaveDate: emp.leaveDate,
    niCategory: emp.niCategory,
    gender: emp.gender,
    dateOfBirth: emp.dateOfBirth,
    address: emp.address,
  };
  return {
    employer,
    employee,
    taxYear: year,
    leaveDate: emp.leaveDate,
    totals: thisEmployment,
    previousEmployment: previous
      ? {
          grossPence: previous.taxablePence,
          taxablePence: previous.taxablePence,
          taxPence: previous.taxPence,
          employeeNiPence: previous.employeeNiPence,
        }
      : null,
  };
}

/** P45 HTML for a leaver — totals are this employment only (not previous P45 BF). */
export async function getEmployeeP45Html(clientId: string, employeeId: string) {
  const pack = await statutoryPackForEmployee(clientId, employeeId, "p45");
  const { renderP45Html } = await import("@/server/payroll/statutory-forms");
  return renderP45Html({
    employer: pack.employer,
    employee: pack.employee,
    taxYear: pack.taxYear,
    leaveDate: pack.leaveDate!,
    totals: pack.totals,
  });
}

export async function getEmployeeP45Pdf(clientId: string, employeeId: string) {
  const pack = await statutoryPackForEmployee(clientId, employeeId, "p45");
  const { renderP45Pdf } = await import("@/server/payroll/statutory-pdf");
  return renderP45Pdf({
    employer: pack.employer,
    employee: pack.employee,
    taxYear: pack.taxYear,
    leaveDate: pack.leaveDate!,
    totals: pack.totals,
  });
}

/** P60 HTML for a tax year (defaults to tax year of today, or ?year=25-26). */
export async function getEmployeeP60Html(
  clientId: string,
  employeeId: string,
  taxYear?: string,
) {
  const pack = await statutoryPackForEmployee(
    clientId,
    employeeId,
    "p60",
    taxYear,
  );
  const { renderP60Html } = await import("@/server/payroll/statutory-forms");
  return renderP60Html({
    employer: pack.employer,
    employee: pack.employee,
    taxYear: pack.taxYear,
    totals: pack.totals,
    previousEmployment: pack.previousEmployment,
  });
}

export async function getEmployeeP60Pdf(
  clientId: string,
  employeeId: string,
  taxYear?: string,
) {
  const pack = await statutoryPackForEmployee(
    clientId,
    employeeId,
    "p60",
    taxYear,
  );
  const { renderP60Pdf } = await import("@/server/payroll/statutory-pdf");
  return renderP60Pdf({
    employer: pack.employer,
    employee: pack.employee,
    taxYear: pack.taxYear,
    totals: pack.totals,
    previousEmployment: pack.previousEmployment,
  });
}

