"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type {
  DeskProfile,
  PayrollBenefitRow,
  PayrollDeskSettings,
  PayslipTemplateId,
} from "@/lib/desk-profile";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { appendAuditEvent } from "@/server/audit/log";
import { PAYE_RATES } from "@/lib/hmrc-rulebook/rates";

const templateSchema = z.enum([
  "hydra_a",
  "hydra_b",
  "hydra_c",
  "hydra_secure",
]);

const payRateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  ratePence: z.number().int().nonnegative(),
  unit: z.enum(["hour", "day", "fixed"]),
  isDefault: z.boolean().optional(),
  createdAt: z.string(),
});

const settingsSchema = z.object({
  clientId: z.string().min(1),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  payslipTemplate: templateSchema.optional(),
  bulkDownloadFormat: z.enum(["pdf", "zip"]).optional(),
  documentPasswordEnabled: z.boolean().optional(),
  payRates: z.array(payRateSchema).max(50).optional(),
  activeTaxYear: z.string().max(12).optional(),
  payFrequency: z.enum(["M1", "W1"]).optional(),
  bacsServiceUserNumber: z.string().max(12).optional(),
  bacsOriginatorSortCode: z.string().max(12).optional(),
  bacsOriginatorAccountNumber: z.string().max(16).optional(),
  bacsOriginatorName: z.string().max(40).optional(),
  bacsFileSerial: z.string().max(6).optional(),
  automation: z
    .object({
      automatePayroll: z.boolean().optional(),
      payrollDayOfMonth: z.number().int().min(1).max(28).optional(),
      automateRti: z.boolean().optional(),
      rtiDayOfMonth: z.number().int().min(1).max(28).optional(),
      automateEmail: z.boolean().optional(),
      emailDayOfMonth: z.number().int().min(1).max(28).optional(),
      lastRunYmd: z.string().max(10).optional(),
    })
    .optional(),
});

function clampDay(n: number | undefined, fallback = 28): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(28, Math.max(1, Math.round(n)));
}

function readSettings(profile: DeskProfile | null | undefined): PayrollDeskSettings {
  return {
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    payslipTemplate: "hydra_a",
    bulkDownloadFormat: "zip",
    documentPasswordEnabled: true,
    payRates: [],
    activeTaxYear: undefined,
    ...(profile?.payrollSettings ?? {}),
  };
}

async function writeDeskProfile(clientId: string, profile: DeskProfile) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    row.deskProfile = profile;
    row.updatedAt = new Date().toISOString();
    return;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        desk_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(error.message);
    return;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Client storage is not configured");
  const { eq, and } = await import("drizzle-orm");
  const { clients } = await import("@/server/db/schema");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    );
}

export async function getPayrollDeskSettings(clientId: string) {
  await requireSession();
  const client = await getClient(clientId);
  return readSettings(
    "deskProfile" in client ? (client.deskProfile as DeskProfile) : null,
  );
}

export async function savePayrollDeskSettings(
  input: z.infer<typeof settingsSchema>,
) {
  const session = await requireSession();
  const data = settingsSchema.parse(input);
  const client = await getClient(data.clientId);
  const current =
    "deskProfile" in client ? (client.deskProfile as DeskProfile) : {};
  const prev = readSettings(current);
  const next: PayrollDeskSettings = {
    ...prev,
    contactName: data.contactName?.trim() || prev.contactName,
    contactEmail: data.contactEmail?.trim() || prev.contactEmail,
    contactPhone: data.contactPhone?.trim() || prev.contactPhone,
    payslipTemplate:
      (data.payslipTemplate as PayslipTemplateId | undefined) ??
      prev.payslipTemplate,
    bulkDownloadFormat: data.bulkDownloadFormat ?? prev.bulkDownloadFormat,
    documentPasswordEnabled:
      data.documentPasswordEnabled ?? prev.documentPasswordEnabled,
    payRates: data.payRates ?? prev.payRates,
    activeTaxYear: data.activeTaxYear?.trim() || prev.activeTaxYear,
    // Pay cycle is set once at setup — never overwrite a locked choice.
    payFrequency:
      prev.payFrequencyLocked || prev.payFrequency
        ? prev.payFrequency
        : data.payFrequency ?? prev.payFrequency,
    payFrequencyLocked:
      prev.payFrequencyLocked ||
      Boolean(prev.payFrequency) ||
      Boolean(data.payFrequency),
    bacsServiceUserNumber:
      data.bacsServiceUserNumber !== undefined
        ? data.bacsServiceUserNumber.replace(/\D/g, "").slice(0, 6)
        : prev.bacsServiceUserNumber,
    bacsOriginatorSortCode:
      data.bacsOriginatorSortCode !== undefined
        ? data.bacsOriginatorSortCode.replace(/\D/g, "").slice(0, 6)
        : prev.bacsOriginatorSortCode,
    bacsOriginatorAccountNumber:
      data.bacsOriginatorAccountNumber !== undefined
        ? data.bacsOriginatorAccountNumber.replace(/\D/g, "").slice(0, 8)
        : prev.bacsOriginatorAccountNumber,
    bacsOriginatorName:
      data.bacsOriginatorName !== undefined
        ? data.bacsOriginatorName.trim().slice(0, 18)
        : prev.bacsOriginatorName,
    bacsFileSerial:
      data.bacsFileSerial !== undefined
        ? data.bacsFileSerial.replace(/[^A-Za-z0-9]/g, "").slice(0, 6)
        : prev.bacsFileSerial,
    automation:
      data.automation !== undefined
        ? {
            automatePayroll:
              data.automation.automatePayroll ??
              prev.automation?.automatePayroll ??
              false,
            payrollDayOfMonth: clampDay(
              data.automation.payrollDayOfMonth ??
                prev.automation?.payrollDayOfMonth,
              28,
            ),
            automateRti:
              data.automation.automateRti ??
              prev.automation?.automateRti ??
              false,
            rtiDayOfMonth: clampDay(
              data.automation.rtiDayOfMonth ?? prev.automation?.rtiDayOfMonth,
              28,
            ),
            automateEmail:
              data.automation.automateEmail ??
              prev.automation?.automateEmail ??
              false,
            emailDayOfMonth: clampDay(
              data.automation.emailDayOfMonth ??
                prev.automation?.emailDayOfMonth,
              28,
            ),
            lastRunYmd:
              data.automation.lastRunYmd ?? prev.automation?.lastRunYmd,
          }
        : prev.automation,
  };
  await writeDeskProfile(data.clientId, {
    ...current,
    payrollSettings: next,
  });
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "payroll.settings.update",
    entityType: "payroll_settings",
    entityId: data.clientId,
    detail: {
      template: next.payslipTemplate,
      passwordEnabled: next.documentPasswordEnabled,
    },
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return next;
}

/** Official employer rates for the HMRC Base Rates tab (read-only). */
export async function listHmrcPayrollBaseRates() {
  await requireSession();
  return PAYE_RATES.map((r) => ({
    id: r.id,
    label: r.label,
    value: r.value,
    detail: r.detail ?? "",
    period: r.period ?? "",
    sourceUrl: r.source.url,
    sourceTitle: r.source.title,
  }));
}

const benefitRowSchema = z.object({
  employeeId: z.string().min(1),
  taxYear: z.string().min(4).max(12),
  companyCarPounds: z.string().optional(),
  privateMedicalPounds: z.string().optional(),
  otherBenefitsPounds: z.string().optional(),
  expensesPounds: z.string().optional(),
  notes: z.string().max(500).optional(),
});

function poundsToPenceSafe(raw: string | undefined): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** Upsert one employee’s P11D / benefits working figures for a tax year. */
export async function savePayrollBenefitRow(
  input: z.infer<typeof benefitRowSchema> & { clientId: string },
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = benefitRowSchema.extend({ clientId: z.string() }).parse(input);
  const client = await getClient(data.clientId);
  const current =
    "deskProfile" in client ? (client.deskProfile as DeskProfile) : {};
  const prev = readSettings(current);
  const row: PayrollBenefitRow = {
    employeeId: data.employeeId,
    taxYear: data.taxYear.trim(),
    companyCarPence: poundsToPenceSafe(data.companyCarPounds),
    privateMedicalPence: poundsToPenceSafe(data.privateMedicalPounds),
    otherBenefitsPence: poundsToPenceSafe(data.otherBenefitsPounds),
    expensesPence: poundsToPenceSafe(data.expensesPounds),
    notes: data.notes?.trim() || undefined,
  };
  const others = (prev.benefits ?? []).filter(
    (b) =>
      !(b.employeeId === row.employeeId && b.taxYear === row.taxYear),
  );
  const next: PayrollDeskSettings = {
    ...prev,
    benefits: [...others, row],
  };
  await writeDeskProfile(data.clientId, {
    ...current,
    payrollSettings: next,
  });
  revalidatePath(`/clients/${data.clientId}/payroll`);
  return row;
}
