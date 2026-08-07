"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getChService, chServiceTotal } from "@/lib/ch-services";
import { isMemoryStore } from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { memoryStore, type MemoryChRequest } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import { createHash } from "crypto";

function accountRefFromUser(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

const submitSchema = z.object({
  serviceId: z.string().min(1),
  fields: z.record(z.union([z.string(), z.boolean()])),
});

export async function submitCompaniesHouseRequest(
  input: z.infer<typeof submitSchema>,
) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const service = getChService(data.serviceId);
  if (!service) throw new Error("Unknown Companies House service");

  for (const field of service.formFields) {
    if (!field.required) continue;
    const val = data.fields[field.name];
    if (field.type === "checkbox" || field.type === "personal_code_ack") {
      if (val !== true && val !== "true" && val !== "on") {
        throw new Error(`${field.label} is required`);
      }
    } else if (!val || (typeof val === "string" && !val.trim())) {
      throw new Error(`${field.label} is required`);
    }
  }

  const companyNumber =
    typeof data.fields.companyNumber === "string"
      ? data.fields.companyNumber.trim().toUpperCase()
      : null;

  const amountPence = chServiceTotal(service) * 100;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const record: MemoryChRequest = {
    id,
    practiceId: session.practiceId,
    serviceId: service.id,
    companyNumber,
    accountRef: accountRefFromUser(session.userId),
    paymentStatus: "unpaid",
    subscriptionActive: false,
    planKey: `companies-house:${service.id}`,
    status: "received",
    amountPence,
    createdAt: now,
    updatedAt: now,
    payload: data.fields as Record<string, unknown>,
  };

  if (isMemoryStore()) {
    memoryStore.chRequests.push(record);
  } else {
    const { getDb } = await import("@/server/db");
    const { companiesHouseRequests } = await import("@/server/db/schema");
    await getDb().insert(companiesHouseRequests).values({
      id,
      practiceId: session.practiceId,
      serviceId: service.id,
      companyNumber,
      accountRef: record.accountRef,
      paymentStatus: "unpaid",
      subscriptionActive: false,
      planKey: record.planKey,
      status: "received",
      amountPence,
      payload: data.fields,
    });
  }

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
      // no payload / PII in audit detail
    },
  });

  revalidatePath("/companies-house");
  revalidatePath(`/companies-house/${service.id}`);
  revalidatePath("/admin/companies-house");
  revalidatePath("/dashboard");

  return {
    requestId: id,
    checkoutPlanKey: `companies-house:${service.id}`,
    amountPence,
  };
}

/** Admin-safe list: no payload, no personal fields */
export async function listChRequestsAdmin() {
  await requireAdmin();

  if (isMemoryStore()) {
    return memoryStore.chRequests.map(toAdminRow);
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

async function requireAdmin() {
  const session = await requireSession();
  const allow =
    process.env.ADMIN_ACCOUNT_REFS?.split(",").map((s) => s.trim()) ?? [];
  const ref = accountRefFromUser(session.userId);
  // Local / owner practice always admin in memory mode for ops testing
  if (isMemoryStore() && session.role === "owner") return session;
  if (allow.includes(ref) || allow.includes(session.userId)) return session;
  if (session.role === "owner" && process.env.ADMIN_OPEN_TO_OWNERS === "true") {
    return session;
  }
  // Default: practice owners can view ops board (subscription checks only)
  if (session.role === "owner") return session;
  throw new Error("Forbidden");
}

export async function getAdminAccountRef() {
  const session = await requireSession();
  return accountRefFromUser(session.userId);
}
