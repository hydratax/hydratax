/**
 * Session-free payroll automation helpers for cron.
 */

import { preflightPayRun, taxYearFromDate } from "@/lib/payroll";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type { PayFrequency } from "@/server/hmrc/payroll";
import { calculatePeriodPay } from "@/server/hmrc/payroll";

type PeriodOpts = {
  clientId: string;
  practiceId: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  frequency: PayFrequency;
};

async function loadEmployeesRaw(clientId: string) {
  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    return demoStore.employees.filter((e) => e.clientId === clientId);
  }
  const { isDeskStoreConfigured, deskListEmployees, mapSnakeCaseRow } =
    await import("@/server/db/desk-store");
  if (isDeskStoreConfigured()) {
    const rows = (await deskListEmployees(clientId)) ?? [];
    return rows.map((r) => mapSnakeCaseRow(r as Record<string, unknown>));
  }
  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { mapSnakeCaseRow } = await import("@/server/db/desk-store");
    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .select("*")
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) =>
      mapSnakeCaseRow(r as Record<string, unknown>),
    );
  }
  return [];
}

function asEmp(r: Record<string, unknown>) {
  const gender = r.gender === "M" || r.gender === "F" ? r.gender : null;
  return {
    id: String(r.id),
    forename: String(r.forename ?? ""),
    surname: String(r.surname ?? ""),
    nino: String(r.nino ?? ""),
    gender: gender as "M" | "F" | null,
    dateOfBirth: r.dateOfBirth ? String(r.dateOfBirth) : null,
    address: r.address ? String(r.address) : null,
    taxCode: String(r.taxCode ?? "1257L"),
    annualSalaryPence: Number(r.annualSalaryPence ?? 0),
    startDate: String(r.startDate ?? ""),
    payrollId: String(r.payrollId || String(r.id).slice(0, 8).toUpperCase()),
    niCategory: String(r.niCategory || "A"),
    jobTitle: r.jobTitle ? String(r.jobTitle) : null,
    leaveDate: r.leaveDate ? String(r.leaveDate) : null,
    starterDeclaration:
      r.starterDeclaration === "B" || r.starterDeclaration === "C"
        ? (r.starterDeclaration as "B" | "C")
        : ("A" as const),
    firstFpsSent: Boolean(r.firstFpsSent),
    previousPayrollId: r.previousPayrollId
      ? String(r.previousPayrollId)
      : null,
    hoursPerWeek: Number(r.hoursPerWeek ?? 3750) || 3750,
    hourlyRatePence: Number(r.hourlyRatePence ?? 0),
    payBasis:
      r.payBasis === "hourly" ? ("hourly" as const) : ("salary" as const),
    pensionOptOut: Boolean(r.pensionOptOut),
    sspQualifyingDays: Number(r.sspQualifyingDays ?? 5) || 5,
    taxBasis:
      r.taxBasis === "week1Month1"
        ? ("week1Month1" as const)
        : ("cumulative" as const),
    studentLoanPlan: r.studentLoanPlan ? String(r.studentLoanPlan) : null,
    postgraduateLoan: Boolean(r.postgraduateLoan),
    isDirector: Boolean(r.isDirector),
    directorsNicMethod:
      r.directorsNicMethod === "AL" ? ("AL" as const) : ("AN" as const),
    active: r.active !== false,
  };
}

async function loadClientRefs(clientId: string) {
  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const c = demoStore.clients.find((x) => x.id === clientId);
    return {
      payeRef: c?.payeRef ?? null,
      accountsOfficeRef: c?.accountsOfficeRef ?? null,
    };
  }
  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data } = await getSupabaseAdmin()
      .from("clients")
      .select("paye_ref, accounts_office_ref")
      .eq("id", clientId)
      .maybeSingle();
    return {
      payeRef: data?.paye_ref ? String(data.paye_ref) : null,
      accountsOfficeRef: data?.accounts_office_ref
        ? String(data.accounts_office_ref)
        : null,
    };
  }
  return { payeRef: null, accountsOfficeRef: null };
}

export async function runAutomatedSavePayRun(opts: PeriodOpts) {
  const raw = await loadEmployeesRaw(opts.clientId);
  const employees = raw.map((r) => asEmp(r as Record<string, unknown>));
  const active = employees.filter((e) => {
    if (!e.active) return false;
    if (e.startDate > opts.periodEnd) return false;
    if (e.leaveDate && e.leaveDate < opts.periodStart) return false;
    return true;
  });

  const clientPaye = await loadClientRefs(opts.clientId);
  const checks = preflightPayRun({
    payeRef: clientPaye.payeRef,
    accountsOfficeRef: clientPaye.accountsOfficeRef,
    isEmployer: true,
    payDate: opts.payDate,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    frequency: opts.frequency,
    employees: active,
  });
  if (checks.some((c) => c.level === "error")) {
    throw new Error(checks.find((c) => c.level === "error")!.message);
  }

  const taxYear = taxYearFromDate(opts.payDate);
  const lines = active.map((e) =>
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
        payDate: opts.payDate,
        taxYear,
        taxBasis: e.taxBasis,
        studentLoanPlan: e.studentLoanPlan as
          | "plan1"
          | "plan2"
          | "plan4"
          | "plan5"
          | null,
        postgraduateLoan: e.postgraduateLoan,
        isDirector: e.isDirector || /director/i.test(String(e.jobTitle ?? "")),
        directorsNicMethod: e.directorsNicMethod,
      },
      opts.frequency,
    ),
  );

  if (!lines.length) throw new Error("No employees to pay");

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

  const payRun = {
    id: crypto.randomUUID(),
    clientId: opts.clientId,
    payDate: opts.payDate,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    payFrequency: opts.frequency,
    kind: "FPS",
    status: "ready",
    totals,
    lines,
    fpsXmlHash: null as string | null,
    hmrcCorrelationId: null as string | null,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const clash = demoStore.payRuns.find(
      (r) =>
        r.clientId === opts.clientId &&
        r.payDate === opts.payDate &&
        r.kind === "FPS",
    );
    if (clash) return { id: clash.id, already: true };
    demoStore.payRuns.push(payRun);
    return { id: payRun.id, already: false };
  }

  const { isDeskStoreConfigured, deskInsertPayRun, deskListPayRuns } =
    await import("@/server/db/desk-store");
  if (isDeskStoreConfigured()) {
    const existing = (await deskListPayRuns(opts.clientId)) ?? [];
    const clash = existing.find(
      (r) =>
        String(r.pay_date) === opts.payDate &&
        String(r.kind ?? "FPS") === "FPS",
    );
    if (clash) return { id: String(clash.id), already: true };
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
  }

  return { id: payRun.id, already: false };
}

export async function runAutomatedSubmitFps(
  opts: PeriodOpts & { payeRef: string | null },
) {
  if (!opts.payeRef?.trim()) {
    throw new Error("PAYE reference missing — cannot file FPS");
  }

  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const run = demoStore.payRuns.find(
      (r) =>
        r.clientId === opts.clientId &&
        r.payDate === opts.payDate &&
        r.kind === "FPS",
    );
    if (!run) throw new Error("No payslips to file — run payroll first");
    run.status = "accepted";
    run.hmrcCorrelationId = run.hmrcCorrelationId || `AUTO-${opts.payDate}`;
    return { correlationId: run.hmrcCorrelationId };
  }

  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("FPS automation needs live storage");
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { decryptSecret } = await import("@/server/hmrc/crypto");
  const admin = getSupabaseAdmin();
  const { data: creds } = await admin
    .from("user_gateway_credentials")
    .select("sender_id_encrypted, password_encrypted")
    .eq("client_id", opts.clientId)
    .eq("practice_id", opts.practiceId)
    .not("password_encrypted", "is", null)
    .limit(1)
    .maybeSingle();

  if (!creds?.sender_id_encrypted || !creds.password_encrypted) {
    throw new Error("Save Gateway login under HMRC Credentials first");
  }

  const senderId = decryptSecret(creds.sender_id_encrypted);
  const senderPassword = decryptSecret(creds.password_encrypted);

  // Build + submit via createAndSubmit when a session exists; otherwise stop cleanly.
  try {
    const { createAndSubmitPayRun } = await import("@/server/actions/payroll");
    const res = await createAndSubmitPayRun({
      clientId: opts.clientId,
      payDate: opts.payDate,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      frequency: opts.frequency,
      submit: true,
      senderId,
      senderPassword,
      useSavedPassword: false,
    });
    return { correlationId: res.correlationId ?? res.hmrcCorrelationId };
  } catch {
    void senderId;
    void senderPassword;
    throw new Error(
      "FPS automation could not submit from cron — open Run payroll and submit once credentials are saved",
    );
  }
}

export async function runAutomatedEmailPack(opts: {
  clientId: string;
  practiceId: string;
  payDate: string;
  toEmail: string | null | undefined;
}) {
  const to = opts.toEmail?.trim();
  if (!to) throw new Error("Set Contact Details email for pack delivery");

  if (isDemoMode()) {
    return { ok: true as const, message: `Demo: would email pack to ${to}` };
  }

  const { isDeskStoreConfigured, deskListPayRuns } = await import(
    "@/server/db/desk-store"
  );
  if (!isDeskStoreConfigured()) {
    throw new Error("No payslip store for email automation");
  }
  const runs = (await deskListPayRuns(opts.clientId)) ?? [];
  const hit = runs.find((r) => String(r.pay_date) === opts.payDate);
  if (!hit?.id) throw new Error("No payslips for this payday to email");

  try {
    const { sendPayrollPack } = await import("@/server/actions/payroll");
    return await sendPayrollPack({
      clientId: opts.clientId,
      runId: String(hit.id),
      toEmail: to,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : "Could not email pack from automation",
    );
  }
}
