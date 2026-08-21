"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getChService,
  chServiceTotal,
  serviceRequiresCompanyAuthCode,
} from "@/lib/ch-services";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { getOptionalSession, requireSession } from "@/server/auth/session";
import { accountRefFromUser, requireAdmin } from "@/server/auth/admin";
import { memoryStore, type MemoryChRequest } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import { getPracticeTrialStatus } from "@/server/billing/trial-status";
import { companyAuthCodeSchema } from "@/server/companies-house/filing/personal-codes";

const submitSchema = z.object({
  serviceId: z.string().min(1),
  fields: z.record(z.union([z.string(), z.boolean()])),
  /** Where to return after sign-in if the session is missing */
  returnPath: z.string().optional(),
});

export type SubmitChRequestResult =
  | {
      ok: true;
      requestId: string;
      checkoutPlanKey: string;
      amountPence: number;
    }
  | { ok: false; error: string; needsAuth?: boolean };

export async function submitCompaniesHouseRequest(
  input: z.infer<typeof submitSchema>,
): Promise<SubmitChRequestResult> {
  try {
    const parsed = submitSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid filing details",
      };
    }
    const data = parsed.data;

    const session = await getOptionalSession();
    if (!session) {
      return {
        ok: false,
        needsAuth: true,
        error: "Please sign in to continue to payment.",
      };
    }

    const service = getChService(data.serviceId);
    if (!service) return { ok: false, error: "Unknown Companies House service" };

    for (const field of service.formFields) {
      if (!field.required) continue;
      const val = data.fields[field.name];
      if (field.type === "checkbox" || field.type === "personal_code_ack") {
        if (val !== true && val !== "true" && val !== "on") {
          return { ok: false, error: `${field.label} is required` };
        }
      } else if (!val || (typeof val === "string" && !val.trim())) {
        return { ok: false, error: `${field.label} is required` };
      }
    }

    if (serviceRequiresCompanyAuthCode(service.id)) {
      const raw = data.fields.companyAuthCode;
      const authParsed = companyAuthCodeSchema.safeParse(
        typeof raw === "string" ? raw : "",
      );
      if (!authParsed.success) {
        return {
          ok: false,
          error:
            "Company authentication code is required before payment. Enter the code from Companies House online filing.",
        };
      }
      data.fields.companyAuthCode = authParsed.data;
    }

    const companyNumber =
      typeof data.fields.companyNumber === "string"
        ? data.fields.companyNumber.trim().toUpperCase()
        : null;

    const amountStatutory = service.chFeePounds * 100;
    let amountPence = chServiceTotal(service) * 100;
    try {
      const trial = await getPracticeTrialStatus(session.practiceId);
      if (trial.onTrial) amountPence = amountStatutory;
    } catch {
      /* fee fall back to full total */
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const checkoutPlanKey = `companies-house:${service.id}`;

    const record: MemoryChRequest = {
      id,
      practiceId: session.practiceId,
      serviceId: service.id,
      companyNumber,
      accountRef: accountRefFromUser(session.userId),
      paymentStatus: "unpaid",
      subscriptionActive: false,
      planKey: checkoutPlanKey,
      status: "received",
      amountPence,
      createdAt: now,
      updatedAt: now,
      payload: data.fields as Record<string, unknown>,
    };

    const saved = await persistChRequest(record);
    if (!saved) {
      console.error(
        "[ch.request] persistence failed — continuing to Stripe checkout",
        { serviceId: service.id, companyNumber, practiceId: session.practiceId },
      );
    }

    try {
      await appendAuditEvent({
        practiceId: session.practiceId,
        actorId: session.userId,
        action: "ch.request.create",
        entityType: "ch_request",
        entityId: id,
        detail: {
          serviceId: service.id,
          companyNumber,
          amountPence,
          persisted: saved,
        },
      });
    } catch {
      /* audit must not block payment */
    }

    try {
      revalidatePath("/companies-house");
      revalidatePath(`/companies-house/${service.id}`);
      revalidatePath("/admin/companies-house");
      revalidatePath("/dashboard");
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      requestId: id,
      checkoutPlanKey,
      amountPence,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start Companies House checkout";
    console.error("[ch.request] submit failed", err);
    return { ok: false, error: message };
  }
}

async function persistChRequest(record: MemoryChRequest): Promise<boolean> {
  if (isMemoryStore()) {
    memoryStore.chRequests.push(record);
    return true;
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { error } = await supabase.from("companies_house_requests").insert({
        id: record.id,
        practice_id: record.practiceId,
        service_id: record.serviceId,
        company_number: record.companyNumber,
        account_ref: record.accountRef,
        payment_status: record.paymentStatus,
        subscription_active: record.subscriptionActive,
        plan_key: record.planKey,
        status: record.status,
        amount_pence: record.amountPence,
        payload: record.payload,
      });
      if (!error) return true;
      console.error("[ch.request] supabase insert", error.message);
    } catch (err) {
      console.error("[ch.request] supabase persist", err);
    }
  }

  try {
    if (!process.env.DATABASE_URL?.trim()) return false;
    const { getDb } = await import("@/server/db");
    const { companiesHouseRequests } = await import("@/server/db/schema");
    await getDb().insert(companiesHouseRequests).values({
      id: record.id,
      practiceId: record.practiceId,
      serviceId: record.serviceId,
      companyNumber: record.companyNumber,
      accountRef: record.accountRef,
      paymentStatus: "unpaid",
      subscriptionActive: false,
      planKey: record.planKey,
      status: "received",
      amountPence: record.amountPence,
      payload: record.payload,
    });
    return true;
  } catch (err) {
    console.error("[ch.request] drizzle persist", err);
    return false;
  }
}

/** Admin-safe list: no payload, no personal fields */
export async function listChRequestsAdmin() {
  await requireAdmin();

  if (isMemoryStore()) {
    return memoryStore.chRequests.map(toAdminRow);
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("companies_house_requests")
        .select(
          "id, practice_id, service_id, company_number, account_ref, payment_status, subscription_active, plan_key, status, amount_pence, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && data) {
        return data.map((r) =>
          toAdminRow({
            id: r.id,
            practiceId: r.practice_id,
            serviceId: r.service_id,
            companyNumber: r.company_number,
            accountRef: r.account_ref,
            paymentStatus: r.payment_status as MemoryChRequest["paymentStatus"],
            subscriptionActive: Boolean(r.subscription_active),
            planKey: r.plan_key,
            status: r.status as MemoryChRequest["status"],
            amountPence: r.amount_pence,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }),
        );
      }
    } catch {
      /* fall through to drizzle */
    }
  }

  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return [];
    }
    const { getDb } = await import("@/server/db");
    const { companiesHouseRequests } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const rows = await getDb()
      .select()
      .from(companiesHouseRequests)
      .orderBy(desc(companiesHouseRequests.createdAt));
    return rows.map((r) =>
      toAdminRow({
        id: r.id,
        practiceId: r.practiceId,
        serviceId: r.serviceId,
        companyNumber: r.companyNumber,
        accountRef: r.accountRef,
        paymentStatus: r.paymentStatus as MemoryChRequest["paymentStatus"],
        subscriptionActive: r.subscriptionActive,
        planKey: r.planKey,
        status: r.status as MemoryChRequest["status"],
        amountPence: r.amountPence,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }),
    );
  } catch (err) {
    console.error("[ch.request] admin list failed", err);
    return [];
  }
}

function toAdminRow(r: Omit<MemoryChRequest, "payload">) {
  return {
    id: r.id,
    serviceId: r.serviceId,
    companyNumber: r.companyNumber,
    accountRef: r.accountRef,
    paymentStatus: r.paymentStatus,
    subscriptionActive: r.subscriptionActive,
    planKey: r.planKey,
    status: r.status,
    amountPence: r.amountPence,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function updateChRequestStatus(
  requestId: string,
  status: MemoryChRequest["status"],
) {
  await requireAdmin();
  if (isMemoryStore()) {
    const row = memoryStore.chRequests.find((r) => r.id === requestId);
    if (!row) throw new Error("Not found");
    row.status = status;
    row.updatedAt = new Date().toISOString();
  } else {
    const { getDb } = await import("@/server/db");
    const { companiesHouseRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(companiesHouseRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(companiesHouseRequests.id, requestId));
  }
  revalidatePath("/admin/companies-house");
}

export async function markChRequestPaid(requestId: string) {
  await requireAdmin();
  if (isMemoryStore()) {
    const row = memoryStore.chRequests.find((r) => r.id === requestId);
    if (!row) throw new Error("Not found");
    row.paymentStatus = "paid";
    row.subscriptionActive = true;
    row.updatedAt = new Date().toISOString();
  } else {
    const { getDb } = await import("@/server/db");
    const { companiesHouseRequests } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(companiesHouseRequests)
      .set({
        paymentStatus: "paid",
        subscriptionActive: true,
        updatedAt: new Date(),
      })
      .where(eq(companiesHouseRequests.id, requestId));
  }
  revalidatePath("/admin/companies-house");
}

export async function getAdminAccountRef() {
  const session = await requireSession();
  return accountRefFromUser(session.userId);
}
