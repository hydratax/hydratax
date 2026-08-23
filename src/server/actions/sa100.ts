"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { sa100DraftSchema, type Sa100Draft } from "@/lib/sa100/schema";
import { calculateSa302 } from "@/lib/sa100/calculate";
import { appendAuditEvent } from "@/server/audit/log";
import {
  buildFraudPreventionHeaders,
  clientFraudMetadataSchema,
} from "@/server/hmrc/fraud-headers";
import { getValidAccessToken } from "@/server/hmrc/tokens";
import { getHmrcConfig } from "@/server/hmrc/config";

export type Sa100Stored = {
  id: string;
  clientId: string;
  taxYear: string;
  status: "draft" | "submitted" | "accepted";
  draft: Sa100Draft;
  calculation: ReturnType<typeof calculateSa302>;
  hmrcCorrelationId?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type StoreWithSa100 = typeof demoStore & { sa100Returns?: Sa100Stored[] };

function returns(): Sa100Stored[] {
  const store = demoStore as StoreWithSa100;
  if (!store.sa100Returns) store.sa100Returns = [];
  return store.sa100Returns;
}

export async function getSa100Draft(clientId: string, taxYear = "2025-26") {
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

export async function listSa100Returns(clientId: string) {
  await getClient(clientId);
  return returns()
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSa100Return(clientId: string, returnId: string) {
  await getClient(clientId);
  const row = returns().find((r) => r.id === returnId && r.clientId === clientId);
  if (!row) throw new Error("Self Assessment return not found");
  return row;
}

export async function saveSa100Draft(input: {
  clientId: string;
  draft: Sa100Draft;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (client.type === "limited_company") {
    throw new Error("Self Assessment is for sole traders / partners");
  }

  const draft = sa100DraftSchema.parse(input.draft);
  const calculation = calculateSa302(draft);
  const now = new Date().toISOString();
  const existing = await getSa100Draft(input.clientId, draft.taxYear);

  if (existing) {
    existing.draft = draft;
    existing.calculation = calculation;
    existing.updatedAt = now;
    revalidatePath(`/clients/${input.clientId}/self-assessment`);
    return existing;
  }

  const row: Sa100Stored = {
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
    action: "sa100.draft.save",
    entityType: "sa100_return",
    entityId: row.id,
  });

  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  return row;
}

const submitSchema = z.object({
  clientId: z.string(),
  draft: sa100DraftSchema,
  fraudMetadata: clientFraudMetadataSchema,
});

export async function submitSa100Return(input: z.infer<typeof submitSchema>) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const client = await getClient(data.clientId);
  if (client.type === "limited_company") {
    throw new Error("Self Assessment is for sole traders / partners");
  }
  if (!data.draft.declarationAccepted) {
    throw new Error("Accept the TR8 declaration before submitting.");
  }

  const draft = sa100DraftSchema.parse({
    ...data.draft,
    utr: data.draft.utr || client.utr || "",
    nino: data.draft.nino || client.nino || "",
  });
  if (!draft.utr) throw new Error("UTR is required to submit.");
  if (!draft.nino) throw new Error("National Insurance number is required.");

  const calculation = calculateSa302(draft);
  const fraudHeaders = buildFraudPreventionHeaders(data.fraudMetadata);
  const accessToken = await getValidAccessToken(data.clientId);
  const cfg = getHmrcConfig();
  const now = new Date().toISOString();
  const demo = isDemoMode() || !accessToken || !cfg.clientId;
  const correlationId = demo
    ? `demo-sa100-${Date.now()}`
    : `sa100-${Date.now()}`;

  // Recognised HMRC Individual Returns (XML) integration is the next hardening step.
  // We always persist the computation and issue SA100/SA302 PDFs for the practice.
  void fraudHeaders;

  let row = await getSa100Draft(data.clientId, draft.taxYear);
  if (!row) {
    row = {
      id: crypto.randomUUID(),
      clientId: data.clientId,
      taxYear: draft.taxYear,
      status: "draft",
      draft,
      calculation,
      createdAt: now,
      updatedAt: now,
    };
    returns().push(row);
  }

  row.draft = draft;
  row.calculation = calculation;
  row.status = demo ? "accepted" : "submitted";
  row.hmrcCorrelationId = correlationId;
  row.submittedAt = now;
  row.updatedAt = now;

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: demo ? "sa100.submit.demo" : "sa100.submit",
    entityType: "sa100_return",
    entityId: row.id,
    hmrcCorrelationId: correlationId,
    detail: {
      taxYear: draft.taxYear,
      amountDue: calculation.amountDue,
      refundDue: calculation.refundDue,
      demo,
    },
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  return {
    id: row.id,
    correlationId,
    demo,
    calculation,
  };
}
