"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { employeeInputSchema } from "@/server/money/schemas";
import { poundsToPence } from "@/server/money/pence";
import {
  buildEpsXml,
  buildFpsXml,
  calculateMonthlyPay,
  submitRtiXml,
} from "@/server/hmrc/payroll";
import { appendAuditEvent } from "@/server/audit/log";

const addEmployeeForm = z.object({
  clientId: z.string(),
  forename: z.string().min(1),
  surname: z.string().min(1),
  nino: z.string().min(1),
  taxCode: z.string().default("1257L"),
  annualSalaryPounds: z.string(),
  startDate: z.string(),
});

export async function listEmployees(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.employees.filter((e) => e.clientId === clientId && e.active);
  }
  const { getDb } = await import("@/server/db");
  const { employees } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(employees)
    .where(and(eq(employees.clientId, clientId), eq(employees.active, true)));
}

export async function addEmployee(input: z.infer<typeof addEmployeeForm>) {
  const session = await requireSession();
  const data = addEmployeeForm.parse(input);
  await getClient(data.clientId);

  const parsed = employeeInputSchema.parse({
    clientId: data.clientId,
    forename: data.forename,
    surname: data.surname,
    nino: data.nino,
    taxCode: data.taxCode,
    annualSalaryPence: poundsToPence(data.annualSalaryPounds),
    startDate: data.startDate,
  });

  if (isDemoMode()) {
    const emp = {
      id: crypto.randomUUID(),
      clientId: parsed.clientId,
      forename: parsed.forename,
      surname: parsed.surname,
      nino: parsed.nino,
      taxCode: parsed.taxCode,
      annualSalaryPence: Number(parsed.annualSalaryPence),
      startDate: parsed.startDate,
      active: true,
    };
    demoStore.employees.push(emp);
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "employee.create",
      entityType: "employee",
      entityId: emp.id,
      detail: { nino: emp.nino },
    });
    revalidatePath(`/clients/${data.clientId}/payroll`);
    return emp;
  }

  const { getDb } = await import("@/server/db");
  const { employees } = await import("@/server/db/schema");
  const [created] = await getDb()
    .insert(employees)
    .values({
      clientId: parsed.clientId,
      forename: parsed.forename,
      surname: parsed.surname,
      nino: parsed.nino,
      taxCode: parsed.taxCode,
      annualSalaryPence: Number(parsed.annualSalaryPence),
      startDate: parsed.startDate,
    })
    .returning();

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "employee.create",
    entityType: "employee",
    entityId: created.id,
  });

  revalidatePath(`/clients/${data.clientId}/payroll`);
  return created;
}

const payRunSchema = z.object({
  clientId: z.string(),
  payDate: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function createAndSubmitPayRun(input: z.infer<typeof payRunSchema>) {
  const session = await requireSession();
  const data = payRunSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.isEmployer || !client.payeRef || !client.accountsOfficeRef) {
    throw new Error("Client must be an employer with PAYE and Accounts Office refs");
  }

  const employees = await listEmployees(data.clientId);
  if (employees.length === 0) throw new Error("No active employees");

  const lines = employees.map((e) =>
    calculateMonthlyPay({
      id: e.id,
      forename: e.forename,
      surname: e.surname,
      nino: e.nino,
      taxCode: e.taxCode,
      annualSalaryPence: e.annualSalaryPence,
    }),
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

  const taxYear = taxYearFromDate(data.payDate);
  const fps = buildFpsXml({
    employerPayeRef: client.payeRef,
    accountsOfficeRef: client.accountsOfficeRef,
    payDate: data.payDate,
    taxYear,
    lines,
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
    status: submit.ok ? "accepted" : "rejected",
    totals,
    lines,
    fpsXmlHash: fps.hash,
    hmrcCorrelationId: submit.correlationId,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.payRuns.push(payRun);
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

  revalidatePath(`/clients/${clientId}/payroll`);
  return res;
}

export async function listPayRuns(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.payRuns.filter((p) => p.clientId === clientId);
  }
  const { getDb } = await import("@/server/db");
  const { payRuns } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb().select().from(payRuns).where(eq(payRuns.clientId, clientId));
}

function taxYearFromDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // UK tax year starts 6 April
  if (month < 4 || (month === 4 && day < 6)) {
    const start = year - 1;
    return `${String(start).slice(2)}-${String(year).slice(2)}`;
  }
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}
