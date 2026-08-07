"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { vatOnNet, poundsToPence } from "@/server/money/pence";
import { appendAuditEvent } from "@/server/audit/log";

const addEntrySchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1).max(500),
  amountPounds: z.string().min(1),
  vatRateBps: z.union([z.literal(0), z.literal(500), z.literal(2000)]),
  dated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().optional(),
});

export async function listLedgerEntries(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.ledger
      .filter((e) => e.clientId === clientId)
      .sort((a, b) => b.dated.localeCompare(a.dated));
  }

  const { getDb } = await import("@/server/db");
  const { ledgerEntries } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.clientId, clientId))
    .orderBy(desc(ledgerEntries.dated));
}

export async function addLedgerEntry(input: z.infer<typeof addEntrySchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = addEntrySchema.parse(input);
  await getClient(data.clientId);

  const amountPence = Number(poundsToPence(data.amountPounds));
  const vatPence = Number(vatOnNet(amountPence, data.vatRateBps));

  if (isDemoMode()) {
    const entry = {
      id: crypto.randomUUID(),
      clientId: data.clientId,
      type: data.type,
      description: data.description,
      amountPence,
      vatRateBps: data.vatRateBps,
      vatPence,
      dated: data.dated,
      category: data.category ?? null,
      createdBy: session.userId,
      createdAt: new Date().toISOString(),
    };
    demoStore.ledger.push(entry);
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "ledger.create",
      entityType: "ledger_entry",
      entityId: entry.id,
      detail: {
        type: entry.type,
        amountPence: entry.amountPence,
        vatPence: entry.vatPence,
      },
    });
    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath(`/clients/${data.clientId}/books`);
    return entry;
  }

  const { getDb } = await import("@/server/db");
  const { ledgerEntries } = await import("@/server/db/schema");
  const [created] = await getDb()
    .insert(ledgerEntries)
    .values({
      clientId: data.clientId,
      type: data.type,
      description: data.description,
      amountPence,
      vatRateBps: data.vatRateBps,
      vatPence,
      dated: data.dated,
      category: data.category ?? null,
      createdBy: session.userId,
    })
    .returning();

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "ledger.create",
    entityType: "ledger_entry",
    entityId: created.id,
    detail: {
      type: created.type,
      amountPence: created.amountPence,
      vatPence: created.vatPence,
    },
  });

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/books`);
  return created;
}
