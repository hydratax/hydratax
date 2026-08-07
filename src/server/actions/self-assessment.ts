"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { listLedgerEntries } from "./ledger";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { digitalIncomeRecordSchema } from "@/server/money/schemas";
import { pence } from "@/server/money/pence";
import {
  buildItsaPeriodicPayload,
  mockItsaSubmit,
  submitItsaPeriodicUpdate,
} from "@/server/hmrc/self-assessment";
import {
  buildFraudPreventionHeaders,
  clientFraudMetadataSchema,
} from "@/server/hmrc/fraud-headers";
import { getValidAccessToken } from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";
import { getHmrcConfig } from "@/server/hmrc/config";

const draftSchema = z.object({
  clientId: z.string(),
  taxYear: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

const submitSchema = draftSchema.extend({
  fraudMetadata: clientFraudMetadataSchema,
  businessId: z.string().default("XBIS12345678901"),
});

export async function prepareSaUpdate(input: z.infer<typeof draftSchema>) {
  const session = await requireSession();
  const data = draftSchema.parse(input);
  const client = await getClient(data.clientId);
  if (client.type === "limited_company") {
    throw new Error("Self Assessment is for sole traders / partners");
  }

  const ledger = await listLedgerEntries(data.clientId);
  const inPeriod = ledger.filter(
    (l) => l.dated >= data.periodStart && l.dated <= data.periodEnd,
  );
  const turnover = inPeriod
    .filter((l) => l.type === "income")
    .reduce((s, l) => s + l.amountPence, 0);
  const expenses = inPeriod
    .filter((l) => l.type === "expense")
    .reduce((s, l) => s + l.amountPence, 0);

  const record = digitalIncomeRecordSchema.parse({
    clientId: data.clientId,
    taxYear: data.taxYear,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    turnoverPence: pence(turnover),
    otherIncomePence: pence(0),
    expensesPence: pence(expenses),
  });

  const draft = {
    id: crypto.randomUUID(),
    ...record,
    status: "ready",
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.saSubmissions.push(draft);
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "sa.prepare",
    entityType: "sa_submission",
    entityId: draft.id,
    detail: { record },
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  return draft;
}

export async function listSaSubmissions(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.saSubmissions.filter((s) => s.clientId === clientId);
  }
  const { getDb } = await import("@/server/db");
  const { saSubmissions } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(saSubmissions)
    .where(eq(saSubmissions.clientId, clientId));
}

export async function submitSaUpdate(input: z.infer<typeof submitSchema>) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.nino) throw new Error("Client NINO required for Self Assessment");

  const fraudHeaders = buildFraudPreventionHeaders(data.fraudMetadata);
  const draft = await prepareSaUpdate(data);
  const record = digitalIncomeRecordSchema.parse(draft);
  const accessToken = await getValidAccessToken(data.clientId);
  const cfg = getHmrcConfig();

  if (!accessToken || !cfg.clientId) {
    const mock = mockItsaSubmit(record);
    if (isDemoMode()) {
      const idx = demoStore.saSubmissions.findIndex((s) => s.id === draft.id);
      if (idx >= 0) {
        demoStore.saSubmissions[idx] = {
          ...draft,
          status: "accepted",
          hmrcCorrelationId: mock.correlationId,
          submittedAt: new Date().toISOString(),
        };
      }
    }
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "hmrc.itsa.periodic.demo",
      entityType: "sa_submission",
      entityId: draft.id,
      hmrcStatusCode: 200,
      hmrcCorrelationId: mock.correlationId,
      detail: {
        payload: buildItsaPeriodicPayload(record),
        fraudHeaderKeys: Object.keys(fraudHeaders),
      },
    });
    revalidatePath(`/clients/${data.clientId}/self-assessment`);
    return { ok: true, correlationId: mock.correlationId, draft };
  }

  const res = await submitItsaPeriodicUpdate({
    nino: client.nino,
    businessId: data.businessId,
    taxYear: data.taxYear,
    record,
    accessToken,
    fraudHeaders,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  return { ok: res.ok, correlationId: res.correlationId, draft, hmrc: res };
}
