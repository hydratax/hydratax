"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { demoStore } from "@/server/demo/store";
import { sa800DraftSchema, type Sa800Draft } from "@/lib/sa800/schema";
import { calculateSa800 } from "@/lib/sa800/calculate";
import { appendAuditEvent } from "@/server/audit/log";

export type Sa800Stored = {
  id: string;
  clientId: string;
  taxYear: string;
  status: "draft" | "submitted" | "accepted";
  draft: Sa800Draft;
  calculation: ReturnType<typeof calculateSa800>;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type StoreWithSa800 = typeof demoStore & { sa800Returns?: Sa800Stored[] };

function returns(): Sa800Stored[] {
  const store = demoStore as StoreWithSa800;
  if (!store.sa800Returns) store.sa800Returns = [];
  return store.sa800Returns;
}

export async function getSa800Draft(clientId: string, taxYear: string) {
  await getClient(clientId);
  return (
    returns().find(
      (r) =>
        r.clientId === clientId &&
        r.taxYear === taxYear &&
        r.status === "draft",
    ) ?? null
  );
}

export async function listSa800Returns(clientId: string) {
  await getClient(clientId);
  return returns()
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSa800Return(clientId: string, returnId: string) {
  await getClient(clientId);
  const row = returns().find((r) => r.id === returnId && r.clientId === clientId);
  if (!row) throw new Error("Partnership return not found");
  return row;
}

export async function saveSa800Draft(input: {
  clientId: string;
  draft: Sa800Draft;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const client = await getClient(input.clientId);
  if (client.type !== "partnership") {
    throw new Error("SA800 is for partnership clients");
  }

  const draft = sa800DraftSchema.parse(input.draft);
  const calculation = calculateSa800(draft);
  const now = new Date().toISOString();
  const existing = await getSa800Draft(input.clientId, draft.taxYear);

  let row = existing;
  if (row) {
    row.draft = draft;
    row.calculation = calculation;
    row.updatedAt = now;
  } else {
    row = {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      taxYear: draft.taxYear,
      status: "draft",
      draft,
      calculation,
      createdAt: now,
      updatedAt: now,
    };
    returns().push(row);
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: input.clientId,
      actorId: session.userId,
      action: "sa800.draft.save",
      entityType: "sa800_return",
      entityId: row.id,
    }).catch(() => undefined);
  }

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath(`/clients/${input.clientId}/sa800`);
  return row;
}

export async function submitSa800Draft(input: {
  clientId: string;
  taxYear: string;
  confirmEndTrial?: boolean;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });
  await getClient(input.clientId);
  const row = await getSa800Draft(input.clientId, input.taxYear);
  if (!row) throw new Error("Save the draft before submitting");
  if (!row.calculation.sharePctBalanced) {
    throw new Error("Partner profit shares must total 100% before submit");
  }
  if (!row.draft.declarationName.trim()) {
    throw new Error("Enter the name of the partner declaring the return");
  }

  const now = new Date().toISOString();
  row.status = "accepted";
  row.submittedAt = now;
  row.updatedAt = now;

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "sa800.submit.demo",
    entityType: "sa800_return",
    entityId: row.id,
    detail: {
      taxYear: row.taxYear,
      profit: row.calculation.profitBeforeAllocation,
    },
  }).catch(() => undefined);

  revalidatePath(`/clients/${input.clientId}/sa800`);
  return row;
}
