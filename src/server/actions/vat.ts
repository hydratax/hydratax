"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { listLedgerEntries } from "./ledger";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import {
  draftVatBoxesFromLedger,
  submitVatReturn,
  boxesToHmrcPayload,
} from "@/server/hmrc/vat";
import {
  buildFraudPreventionHeaders,
  clientFraudMetadataSchema,
} from "@/server/hmrc/fraud-headers";
import { getValidAccessToken } from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";
import { getHmrcConfig } from "@/server/hmrc/config";

const prepareSchema = z.object({
  clientId: z.string(),
  periodKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  trialBalanceId: z.string().optional(),
});

const submitSchema = prepareSchema.extend({
  fraudMetadata: clientFraudMetadataSchema,
});

export async function prepareVatReturn(input: z.infer<typeof prepareSchema>) {
  const session = await requireSession();
  const data = prepareSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.isVatRegistered || !client.vrn) {
    throw new Error("Client is not VAT registered");
  }

  const ledger = await listLedgerEntries(data.clientId);
  let boxes = draftVatBoxesFromLedger(
    ledger.map((l) => ({
      type: l.type,
      amountPence: l.amountPence,
      vatPence: l.vatPence,
      dated: l.dated,
    })),
    data.periodStart,
    data.periodEnd,
  );

  if (data.trialBalanceId) {
    const { draftVatFromTrialBalance } = await import(
      "@/server/actions/trial-balance"
    );
    const fromTb = await draftVatFromTrialBalance(data.trialBalanceId);
    boxes = fromTb.boxes;
  }

  const draft = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    periodKey: data.periodKey,
    status: "ready",
    boxes,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.vatReturns = demoStore.vatReturns.filter(
      (r) =>
        !(r.clientId === data.clientId && r.periodKey === data.periodKey),
    );
    demoStore.vatReturns.push(draft);
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "vat.prepare",
    entityType: "vat_return",
    entityId: draft.id,
    detail: { periodKey: data.periodKey, boxes },
  });

  revalidatePath(`/clients/${data.clientId}/vat`);
  return draft;
}

export async function listVatReturns(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.vatReturns.filter((r) => r.clientId === clientId);
  }
  const { getDb } = await import("@/server/db");
  const { vatReturns } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb().select().from(vatReturns).where(eq(vatReturns.clientId, clientId));
}

export async function submitPreparedVatReturn(
  input: z.infer<typeof submitSchema>,
) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.vrn) throw new Error("Missing VRN");

  const fraudHeaders = buildFraudPreventionHeaders(data.fraudMetadata);
  const draft =
    (isDemoMode()
      ? demoStore.vatReturns.find(
          (r) =>
            r.clientId === data.clientId && r.periodKey === data.periodKey,
        )
      : null) ??
    (await prepareVatReturn({
      clientId: data.clientId,
      periodKey: data.periodKey,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    }));

  const boxes = draft.boxes as ReturnType<typeof draftVatBoxesFromLedger>;
  const accessToken = await getValidAccessToken(data.clientId);
  const cfg = getHmrcConfig();

  if (!accessToken || !cfg.clientId) {
    // No live credentials — record locally until HMRC keys + OAuth are configured
    const payload = boxesToHmrcPayload(boxes);
    payload.periodKey = data.periodKey;
    const correlationId = `demo-vat-${Date.now()}`;
    const result = {
      ...draft,
      status: "accepted",
      hmrcFormBundleNumber: `DEMO-${correlationId}`,
      hmrcProcessingDate: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    };
    if (isDemoMode()) {
      const idx = demoStore.vatReturns.findIndex((r) => r.id === draft.id);
      if (idx >= 0) demoStore.vatReturns[idx] = result;
    }
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "hmrc.vat.submit.demo",
      entityType: "vat_return",
      entityId: String(draft.id),
      hmrcStatusCode: 201,
      hmrcCorrelationId: correlationId,
      detail: { payload, fraudHeaderKeys: Object.keys(fraudHeaders) },
    });
    revalidatePath(`/clients/${data.clientId}/vat`);
    return result;
  }

  const res = await submitVatReturn({
    vrn: client.vrn,
    periodKey: data.periodKey,
    boxes,
    accessToken,
    fraudHeaders,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
  });

  const status = res.ok ? "accepted" : "rejected";
  const result = {
    ...draft,
    status,
    hmrcFormBundleNumber:
      (res.data as { formBundleNumber?: string } | null)?.formBundleNumber ??
      null,
    hmrcProcessingDate:
      (res.data as { processingDate?: string } | null)?.processingDate ?? null,
    submittedAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    const idx = demoStore.vatReturns.findIndex((r) => r.id === draft.id);
    if (idx >= 0) demoStore.vatReturns[idx] = result;
  }

  revalidatePath(`/clients/${data.clientId}/vat`);
  return { result, hmrc: res };
}

export async function listVatObligations(clientId: string) {
  await getClient(clientId);
  // Live HMRC obligations when connected; placeholder periods for prepare UI otherwise
  return [
    {
      periodKey: "26A1",
      start: "2026-01-01",
      end: "2026-03-31",
      due: "2026-05-07",
      status: "O",
    },
    {
      periodKey: "25A4",
      start: "2025-10-01",
      end: "2025-12-31",
      due: "2026-02-07",
      status: "F",
      received: "2026-01-20",
    },
  ];
}

/** @deprecated Use listVatObligations */
export const getDemoVatObligations = listVatObligations;
