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
import {
  matchTimesheetRow,
  parseTimesheetBuffer,
  timesheetTemplateBuffer,
  type TimesheetRow,
} from "@/server/payroll/timesheet";
import { buildPayrollPackZip } from "@/server/payroll/pack";
import { decryptSecret, encryptSecret } from "@/server/hmrc/crypto";
import type { TimesheetAdjustments } from "@/server/payroll/statutory";
import { hasDatabase, tryGetDb } from "@/server/db";
import {
  getSupabaseDataClient,
  mapSnakeCaseRow,
} from "@/server/db/supabase-data";

const addEmployeeForm = z.object({
  clientId: z.string(),
  forename: z.string().min(1),
  surname: z.string().min(1),
  nino: z.string().min(1),
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
    bfTaxYear: r.bfTaxYear ? String(r.bfTaxYear) : null,
    bfTaxablePence: Number(r.bfTaxablePence ?? 0) || 0,
    bfTaxPence: Number(r.bfTaxPence ?? 0) || 0,
    bfEmployeeNiPence: Number(r.bfEmployeeNiPence ?? 0) || 0,
    active: r.active !== false,
  };
}

export async function listEmployees(clientId: string, opts?: { includeLeavers?: boolean }) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.employees
      .filter((e) => e.clientId === clientId)
      .filter((e) => (opts?.includeLeavers ? true : e.active))
      .map((e) => asEmployee(e));
  }
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Could not load employees: ${error.message}`);
    return (data ?? [])
      .map((row) => asEmployee(row))
      .filter((e) => (opts?.includeLeavers ? true : e.active));
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

  const existing = await listEmployees(data.clientId, { includeLeavers: true });
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

  const emp: PayrollEmployee = {
    id: crypto.randomUUID(),
    clientId: parsed.clientId,
    forename: parsed.forename,
    surname: parsed.surname,
    nino: parsed.nino,
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
    bfTaxYear,
    bfTaxablePence,
    bfTaxPence,
    bfEmployeeNiPence,
    active: true,
  };

  if (isDemoMode()) {
    demoStore.employees.push(emp);
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("employees").insert({
      id: emp.id,
      client_id: emp.clientId,
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
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
      bf_tax_year: emp.bfTaxYear,
      bf_taxable_pence: emp.bfTaxablePence,
      bf_tax_pence: emp.bfTaxPence,
      bf_employee_ni_pence: emp.bfEmployeeNiPence,
      active: true,
    });
    if (error) throw new Error(`Could not add employee: ${error.message}`);
  } else {
    const { getDb } = await import("@/server/db");
    const { employees } = await import("@/server/db/schema");
    await getDb().insert(employees).values({
      id: emp.id,
      clientId: emp.clientId,
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
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
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: updated, error } = await supabase
      .from("employees")
      .update({ leave_date: data.leaveDate, active: false })
      .eq("id", data.employeeId)
      .eq("client_id", data.clientId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Could not update employee: ${error.message}`);
    if (!updated) throw new Error("Employee not found");
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
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("payroll_timesheets")
      .select("rows")
      .eq("client_id", clientId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();
    if (error) throw new Error(`Could not load timesheet: ${error.message}`);
    return Array.isArray(data?.rows) ? (data.rows as TimesheetRow[]) : [];
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
});

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
    employees: inPeriod,
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

export async function createAndSubmitPayRun(input: z.input<typeof payRunSchema>) {
  const session = await requireSession();
  const data = payRunSchema.parse({ ...input, submit: true });
  const client = await getClient(data.clientId);
  const pack = await buildPayRunPackage(data);
  if (pack.checks.some((c) => c.level === "error")) {
    throw new Error(pack.checks.find((c) => c.level === "error")!.message);
  }
  if (!client.payeRef || !client.accountsOfficeRef) {
    throw new Error("Client must be an employer with PAYE and Accounts Office refs");
  }

  const fps = buildFpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    payDate: data.payDate,
    taxYear: pack.taxYear,
    frequency: data.frequency,
    lines: pack.lines,
  });

  const submit = await submitRtiXml({
    xml: fps.xml,
    kind: "FPS",
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
    demo: isDemoMode() || !process.env.HMRC_CLIENT_ID,
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
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error: insertError } = await supabase.from("pay_runs").insert({
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
    if (insertError) {
      throw new Error(`Could not save pay run: ${insertError.message}`);
    }
    const ids = pack.lines.map((line) => line.employeeId);
    if (ids.length) {
      const { error: updateError } = await supabase
        .from("employees")
        .update({ first_fps_sent: true, previous_payroll_id: null })
        .in("id", ids)
        .eq("client_id", data.clientId);
      if (updateError) {
        throw new Error(`Could not update employees: ${updateError.message}`);
      }
    }
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
  return payRun;
}

export async function submitEpsNoPayment(clientId: string, taxYear: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client.payeRef || !client.accountsOfficeRef) {
    throw new Error("Missing PAYE refs");
  }

  const eps = buildEpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    taxYear,
    noPaymentForPeriod: true,
  });

  const res = await submitRtiXml({
    xml: eps.xml,
    kind: "EPS",
    actorId: session.userId,
    clientId,
    practiceId: session.practiceId,
    demo: isDemoMode() || !process.env.HMRC_CLIENT_ID,
  });

  const payRun = {
    id: crypto.randomUUID(),
    clientId,
    payDate: new Date().toISOString().slice(0, 10),
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    payFrequency: "M1",
    kind: "EPS",
    status: res.ok ? "accepted" : "rejected",
    totals: {
      grossPence: 0,
      taxPence: 0,
      employeeNiPence: 0,
      employerNiPence: 0,
      netPence: 0,
    },
    lines: [],
    fpsXmlHash: eps.hash,
    hmrcCorrelationId: res.correlationId,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  if (isDemoMode()) {
    demoStore.payRuns.push(payRun);
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("pay_runs").insert({
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
    if (error) throw new Error(`Could not save EPS: ${error.message}`);
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

  revalidatePath(`/clients/${clientId}/payroll`);
  return res;
}

export async function listPayRuns(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.payRuns
      .filter((p) => p.clientId === clientId)
      .slice()
      .reverse();
  }
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("pay_runs")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load pay runs: ${error.message}`);
    return (data ?? []).map((row) => mapSnakeCaseRow(row));
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
  } else if (isSupabaseConfigured()) {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("payroll_timesheets").upsert(
      {
        id: record.id,
        client_id: clientId,
        period_start: periodStart,
        period_end: periodEnd,
        filename: record.filename,
        rows: parsed.rows,
      },
      { onConflict: "client_id,period_start,period_end" },
    );
    if (error) throw new Error(`Could not save timesheet: ${error.message}`);
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
  const zip = buildPayrollPackZip({
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
      const err = await res.text();
      throw new Error(`Email provider error: ${err.slice(0, 200)}`);
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
      toDomain: data.toEmail.split("@")[1] ?? "unknown",
      subject: `Payroll pack ${pack.payDate}`,
      documentCount: pack.lineCount + 1,
      delivery,
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

  return {
    ok: true,
    delivery,
    filename: pack.filename,
    base64: pack.zip.toString("base64"),
    message:
      delivery === "resend"
        ? "Password-protected pack emailed to the client."
        : "Pack built. Set RESEND_API_KEY to email it; you can still download the zip now.",
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

/** P45 HTML for a leaver — totals are this employment only (not previous P45 BF). */
export async function getEmployeeP45Html(clientId: string, employeeId: string) {
  await requireSession();
  await ensurePayrollSchema();
  const client = await getClient(clientId);
  const emp = await getEmployeeOrThrow(clientId, employeeId);
  if (!emp.leaveDate) {
    throw new Error("Mark the employee as a leaver before issuing a P45.");
  }
  const taxYear = taxYearFromDate(emp.leaveDate);
  const runs = await listPayRuns(clientId);
  const thisEmployment = ytdFromRuns(emp.id, taxYear, runs);
  const { renderP45Html } = await import("@/server/payroll/statutory-forms");
  return renderP45Html({
    employer: {
      name: client.name,
      payeRef: client.payeRef ?? "",
      accountsOfficeRef: client.accountsOfficeRef,
    },
    employee: {
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
      taxCode: emp.taxCode,
      payrollId: emp.payrollId,
      startDate: emp.startDate,
      leaveDate: emp.leaveDate,
      niCategory: emp.niCategory,
    },
    taxYear,
    leaveDate: emp.leaveDate,
    totals: thisEmployment,
  });
}

/** P60 HTML for a tax year (defaults to tax year of today, or ?year=25-26). */
export async function getEmployeeP60Html(
  clientId: string,
  employeeId: string,
  taxYear?: string,
) {
  await requireSession();
  await ensurePayrollSchema();
  const client = await getClient(clientId);
  const emp = await getEmployeeOrThrow(clientId, employeeId);
  const year =
    taxYear?.trim() ||
    taxYearFromDate(new Date().toISOString().slice(0, 10));
  const runs = await listPayRuns(clientId);
  const thisEmployment = ytdFromRuns(emp.id, year, runs);
  const previous = broughtForwardForYear(emp, year);
  const { renderP60Html } = await import("@/server/payroll/statutory-forms");
  return renderP60Html({
    employer: {
      name: client.name,
      payeRef: client.payeRef ?? "",
      accountsOfficeRef: client.accountsOfficeRef,
    },
    employee: {
      forename: emp.forename,
      surname: emp.surname,
      nino: emp.nino,
      taxCode: emp.taxCode,
      payrollId: emp.payrollId,
      startDate: emp.startDate,
      leaveDate: emp.leaveDate,
      niCategory: emp.niCategory,
    },
    taxYear: year,
    totals: thisEmployment,
    previousEmployment: previous
      ? {
          grossPence: previous.taxablePence,
          taxablePence: previous.taxablePence,
          taxPence: previous.taxPence,
          employeeNiPence: previous.employeeNiPence,
        }
      : null,
  });
}

