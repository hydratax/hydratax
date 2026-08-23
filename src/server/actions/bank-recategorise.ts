"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listBankTransactions, updateBankCategory } from "@/server/actions/bank";
import { applyIdentifierRules } from "@/server/bank/merchant-identifiers";
import type { BankCategory } from "@/lib/bank-categories";

/** Re-apply merchant identifier rules to all stored bank lines for a client. */
export async function recategoriseBankTransactions(clientId: string) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  await getClient(clientId);
  const txs = await listBankTransactions(clientId);
  if (!txs.length) {
    return { ok: true as const, updated: 0 };
  }

  const tagged = await applyIdentifierRules(
    txs.map((t) => ({
      description: t.description,
      amountPence: t.amountPence,
      category: t.category as BankCategory,
      confidence: t.confidence ?? "low",
    })),
    session.practiceId,
  );

  let updated = 0;
  for (let i = 0; i < txs.length; i++) {
    const next = tagged[i];
    if (!next || next.category === txs[i].category) continue;
    await updateBankCategory(txs[i].id, next.category);
    updated += 1;
  }

  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);
  return { ok: true as const, updated };
}
