"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { isDemoMode } from "@/lib/env";
import { demoStore, type DemoClient } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["sole_trader", "limited_company", "partnership"]),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vrn: z.string().optional(),
  nino: z.string().optional(),
  payeRef: z.string().optional(),
  accountsOfficeRef: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  isEmployer: z.boolean().default(false),
  isVatRegistered: z.boolean().default(false),
});

export async function listClients() {
  const session = await requireSession();
  if (isDemoMode()) {
    return demoStore.clients.filter((c) => c.practiceId === session.practiceId);
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(clients)
    .where(eq(clients.practiceId, session.practiceId));
}

export async function getClient(clientId: string) {
  const session = await requireSession();
  if (isDemoMode()) {
    const client = demoStore.clients.find(
      (c) => c.id === clientId && c.practiceId === session.practiceId,
    );
    if (!client) throw new Error("Client not found");
    return client;
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Client not found");
  return rows[0];
}

export async function createClient(input: z.infer<typeof createClientSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = createClientSchema.parse(input);
  const now = new Date().toISOString();

  if (isDemoMode()) {
    const client: DemoClient = {
      id: crypto.randomUUID(),
      practiceId: session.practiceId,
      name: data.name,
      type: data.type,
      companyNumber: data.companyNumber ?? null,
      utr: data.utr ?? null,
      vrn: data.vrn ?? null,
      nino: data.nino ?? null,
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
      isEmployer: data.isEmployer,
      isVatRegistered: data.isVatRegistered,
      createdAt: now,
      updatedAt: now,
    };
    demoStore.clients.push(client);
    demoStore.hmrcConnections.push({
      clientId: client.id,
      connected: false,
      hmrcEnv: "sandbox",
      scopes: "",
    });
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: client.id,
      actorId: session.userId,
      action: "client.create",
      entityType: "client",
      entityId: client.id,
      detail: { name: client.name, type: client.type },
    });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return client;
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const [created] = await getDb()
    .insert(clients)
    .values({
      practiceId: session.practiceId,
      ...data,
      companyNumber: data.companyNumber ?? null,
      utr: data.utr ?? null,
      vrn: data.vrn ?? null,
      nino: data.nino ?? null,
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
    })
    .returning();

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: created.id,
    actorId: session.userId,
    action: "client.create",
    entityType: "client",
    entityId: created.id,
    detail: { name: created.name, type: created.type },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return created;
}
