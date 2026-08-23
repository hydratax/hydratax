"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { vatOnNet, poundsToPence } from "@/server/money/pence";
import { appendAuditEvent } from "@/server/audit/log";
import { tryGetDb } from "@/server/db";
import {
  isDeskStoreConfigured,
  deskListLedger,
  deskInsertLedger,
  mapSnakeCaseRow,
} from "@/server/db/desk-store";

const addEntrySchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["income", "expense"]),
  description: z.string().min(1).max(500),
  amountPounds: z.string().min(1),
  vatRateBps: z.union([z.literal(0), z.literal(500), z.literal(2000)]),
  dated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().optional(),
});

type LedgerRecord = {
  id: string;
  clientId: string;
  type: "income" | "expense";
  description: string;
  amountPence: number;
  vatRateBps: number;
  vatPence: number;
  dated: string;
  category: string | null;
  createdBy: string;
  createdAt: string | Date;
};

function mapDeskLedger(row: Record<string, unknown>): LedgerRecord {
  const mapped = mapSnakeCaseRow(row);
  return {
    id: String(mapped.id),
    clientId: String(mapped.clientId),
    type: mapped.type === "expense" ? "expense" : "income",
    description: String(mapped.description),
    amountPence: Number(mapped.amountPence),
    vatRateBps: Number(mapped.vatRateBps),
    vatPence: Number(mapped.vatPence),
    dated: String(mapped.dated),
    category: mapped.category == null ? null : String(mapped.category),
    createdBy: String(mapped.createdBy),
    createdAt: String(mapped.createdAt),
  };
}

export async function listLedgerEntries(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.ledger
      .filter((e) => e.clientId === clientId)
      .sort((a, b) => b.dated.localeCompare(a.dated));
  }

  const deskRows = await deskListLedger(clientId);
  if (deskRows !== null) {
    return deskRows.map((row) => mapDeskLedger(row));
  }

  const db = tryGetDb();
  if (!db) return [];
  const { ledgerEntries } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
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

  if (isDeskStoreConfigured()) {
    const row = await deskInsertLedger({
      client_id: data.clientId,
      type: data.type,
      description: data.description,
      amount_pence: amountPence,
      vat_rate_bps: data.vatRateBps,
      vat_pence: vatPence,
      dated: data.dated,
      category: data.category ?? null,
      created_by: session.userId,
    });
    const created = mapDeskLedger(row as Record<string, unknown>);
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "ledger.create",
      entityType: "ledger_entry",
      entityId: String(created.id),
      detail: { type: data.type, amountPence, vatPence },
    });
    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath(`/clients/${data.clientId}/books`);
    return created;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) {
    throw new Error(
      "Ledger storage is not configured. Supabase (or DATABASE_URL) is required.",
    );
  }
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
