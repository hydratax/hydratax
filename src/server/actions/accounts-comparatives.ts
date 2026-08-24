"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { getClient } from "@/server/actions/clients";
import {
  EMPTY_COMPARATIVES,
  parseComparatives,
  type PriorYearComparatives,
} from "@/lib/accounting-periods";

const pence = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  });

const comparativesSchema = z.object({
  clientId: z.string().min(1),
  turnoverPence: pence,
  costOfSalesPence: pence,
  adminExpensesPence: pence,
  taxationPence: pence,
  dividendsPence: pence,
  fixedAssetsPence: pence,
  otherDebtorsPence: pence,
  cashAtBankPence: pence,
  creditorsWithinOneYearPence: pence,
  creditorsAfterOneYearPence: pence,
  shareCapitalPence: pence,
  profitAndLossReservePence: pence,
});

export async function saveAccountsComparatives(
  input: z.infer<typeof comparativesSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = comparativesSchema.parse(input);
  const client = await getClient(data.clientId);
  const comparatives: PriorYearComparatives = parseComparatives({
    ...EMPTY_COMPARATIVES,
    ...data,
  });

  if (isDemoMode() || isMemoryStore()) {
    const row = demoStore.clients.find((c) => c.id === client.id);
    if (row) {
      row.accountsComparatives = comparatives;
      row.updatedAt = new Date().toISOString();
    }
  } else if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();
    const { error } = await supabase
      .from("clients")
      .update({
        accounts_comparatives: comparatives,
        updated_at: new Date().toISOString(),
      })
      .eq("id", client.id)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(error.message);
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) throw new Error("Client storage is not configured");
    const { clients } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    await getDb()
      .update(clients)
      .set({
        accountsComparatives: comparatives,
        updatedAt: new Date(),
      })
      .where(
        and(eq(clients.id, client.id), eq(clients.practiceId, session.practiceId)),
      );
  }

  revalidatePath(`/clients/${client.id}`);
  revalidatePath(`/clients/${client.id}/accounts-pack`);
  return { ok: true as const };
}
