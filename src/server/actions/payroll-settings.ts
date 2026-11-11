"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type {
  DeskProfile,
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
});

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
