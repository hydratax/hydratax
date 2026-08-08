"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { demoStore } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import {
  defaultMappings,
  parseTrialBalanceRows,
  trialBalanceToCt600Figures,
  trialBalanceToVatBoxes,
  type TbMapTarget,
  type TrialBalance,
} from "@/server/trial-balance/map";

const uploadSchema = z.object({
  clientId: z.string().min(1),
  purpose: z.enum(["vat", "ct600", "general"]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filename: z.string().min(1).max(200),
  rows: z.array(z.record(z.unknown())).min(1).max(5000),
});

const mapSchema = z.object({
  trialBalanceId: z.string(),
  mappings: z.record(z.string()),
});

export async function uploadTrialBalance(
  input: z.infer<typeof uploadSchema>,
): Promise<TrialBalance> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = uploadSchema.parse(input);
  await getClient(data.clientId);

  const lines = parseTrialBalanceRows(data.rows);
  if (lines.length === 0) {
    throw new Error("No trial balance lines found — check column headers");
  }

  const tb: TrialBalance = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    practiceId: session.practiceId,
    purpose: data.purpose,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    filename: data.filename,
    lines,
    mappings: defaultMappings(lines),
    createdAt: new Date().toISOString(),
  };

  demoStore.trialBalances = demoStore.trialBalances.filter(
    (t) =>
      !(
        t.clientId === data.clientId &&
        t.purpose === data.purpose &&
        t.periodStart === data.periodStart &&
        t.periodEnd === data.periodEnd
      ),
  );
  demoStore.trialBalances.push(tb);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "trial_balance.upload",
    entityType: "trial_balance",
    entityId: tb.id,
    detail: {
      purpose: tb.purpose,
      lines: tb.lines.length,
      filename: tb.filename,
    },
  });

  revalidatePath(`/clients/${data.clientId}/vat`);
  revalidatePath(`/clients/${data.clientId}/corporation-tax`);
  return tb;
}

export async function listTrialBalances(clientId: string, purpose?: string) {
  await requireSession();
  await getClient(clientId);
  return demoStore.trialBalances
    .filter(
      (t) =>
        t.clientId === clientId && (!purpose || t.purpose === purpose),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTrialBalance(id: string) {
  await requireSession();
  const tb = demoStore.trialBalances.find((t) => t.id === id);
  if (!tb) throw new Error("Trial balance not found");
  return tb;
}

export async function updateTrialBalanceMappings(
  input: z.infer<typeof mapSchema>,
) {
  const session = await requireSession();
  const data = mapSchema.parse(input);
  const tb = demoStore.trialBalances.find((t) => t.id === data.trialBalanceId);
  if (!tb) throw new Error("Trial balance not found");

  const cleaned: Record<string, TbMapTarget> = { ...tb.mappings };
  for (const [code, target] of Object.entries(data.mappings)) {
    cleaned[code] = target as TbMapTarget;
  }
  tb.mappings = cleaned;

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: tb.clientId,
    actorId: session.userId,
    action: "trial_balance.map",
    entityType: "trial_balance",
    entityId: tb.id,
    detail: { mapped: Object.keys(data.mappings).length },
  });

  return tb;
}

export async function draftVatFromTrialBalance(trialBalanceId: string) {
  await requireSession();
  const tb = await getTrialBalance(trialBalanceId);
  return {
    trialBalanceId: tb.id,
    periodStart: tb.periodStart,
    periodEnd: tb.periodEnd,
    boxes: trialBalanceToVatBoxes(tb),
  };
}

export async function draftCt600FromTrialBalance(trialBalanceId: string) {
  await requireSession();
  const tb = await getTrialBalance(trialBalanceId);
  const figures = trialBalanceToCt600Figures(tb, tb.clientId);
  return { trialBalanceId: tb.id, figures };
}
