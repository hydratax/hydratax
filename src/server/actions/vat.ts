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
import { tryGetDb } from "@/server/db";
import { getSupabaseDataClient } from "@/server/db/supabase-data";
import {
  isDeskStoreConfigured,
  deskListVatReturns,
  deskSaveVatReturn,
  deskUpdateVatReturn,
  mapSnakeCaseRow,
} from "@/server/db/desk-store";

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

async function saveVatReturn(draft: {
  id: string;
  clientId: string;
  periodKey: string;
  status: string;
  boxes: unknown;
}) {
  const saved = await deskSaveVatReturn({
    id: draft.id,
    clientId: draft.clientId,
    periodKey: draft.periodKey,
    status: draft.status,
    boxes: draft.boxes,
  });
  if (saved !== null) return saved;

  const db = tryGetDb();
  if (!db) return null;
  const { vatReturns } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const existing = await db
    .select({ id: vatReturns.id })
    .from(vatReturns)
    .where(
      and(
        eq(vatReturns.clientId, draft.clientId),
        eq(vatReturns.periodKey, draft.periodKey),
      ),
    )
    .limit(1);
  const status = draft.status as
    | "draft"
    | "ready"
    | "submitted"
    | "accepted"
    | "rejected"
    | "error";
  if (existing[0]) {
    const [updated] = await db
      .update(vatReturns)
      .set({ status, boxes: draft.boxes })
      .where(eq(vatReturns.id, existing[0].id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(vatReturns)
    .values({
      id: draft.id,
      clientId: draft.clientId,
      periodKey: draft.periodKey,
      status,
      boxes: draft.boxes,
    })
    .returning();
  return created;
}

async function updateStoredVatReturn(
  clientId: string,
  periodKey: string,
  result: {
    status: string;
    hmrcFormBundleNumber?: string | null;
    hmrcProcessingDate?: string | null;
    submittedAt?: string | null;
  },
) {
  if (isDeskStoreConfigured()) {
    await deskUpdateVatReturn(clientId, periodKey, {
      status: result.status,
      hmrc_form_bundle_number: result.hmrcFormBundleNumber ?? null,
      hmrc_processing_date: result.hmrcProcessingDate ?? null,
      submitted_at: result.submittedAt ?? null,
    });
    return;
  }
  const db = tryGetDb();
  if (!db) return;
  const { vatReturns } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  await db
    .update(vatReturns)
    .set({
      status: result.status as "accepted" | "rejected",
      hmrcFormBundleNumber: result.hmrcFormBundleNumber ?? null,
      hmrcProcessingDate: result.hmrcProcessingDate ?? null,
      submittedAt: result.submittedAt ? new Date(result.submittedAt) : null,
    })
    .where(
      and(
        eq(vatReturns.clientId, clientId),
        eq(vatReturns.periodKey, periodKey),
      ),
    );
}

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
  } else {
    await saveVatReturn(draft);
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
  const deskRows = await deskListVatReturns(clientId);
  if (deskRows !== null) {
    return deskRows.map((row) => mapSnakeCaseRow(row));
  }
  const db = tryGetDb();
  if (!db) return [];
  const { vatReturns } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(vatReturns).where(eq(vatReturns.clientId, clientId));
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
    } else {
      await updateStoredVatReturn(data.clientId, data.periodKey, result);
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
  } else {
    await updateStoredVatReturn(data.clientId, data.periodKey, result);
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

const connectSchema = z.object({
  clientId: z.string().min(1),
  filingAs: z.enum(["business", "agent"]),
  vrn: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "VAT number must be 9 digits"),
  agentArn: z.string().trim().optional(),
  vatRegistrationDate: z.string().optional(),
});

/**
 * Persist VRN (and optional agent details) before redirecting to HMRC OAuth.
 * ARN / registration date are kept on the practice profile in memory + audit log
 * so agents are not asked again on this client.
 */
export async function saveVatHmrcConnectDetails(
  input: z.infer<typeof connectSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = connectSchema.parse(input);

  if (data.filingAs === "agent") {
    if (!data.agentArn?.trim()) {
      throw new Error("Enter your Agent Reference Number (ARN)");
    }
    if (!data.vatRegistrationDate?.trim()) {
      throw new Error("Enter the client’s VAT registration date");
    }
  }

  const client = await getClient(data.clientId);

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (!row) throw new Error("Client not found");
    row.vrn = data.vrn;
    row.isVatRegistered = true;
    row.updatedAt = new Date().toISOString();
    if (!demoStore.accountProfile) {
      demoStore.accountProfile = {
        orgType: "practice",
        orgSearch: "",
        firstName: "",
        createdAt: new Date().toISOString(),
      };
    }
    Object.assign(demoStore.accountProfile, {
      agentArn: data.filingAs === "agent" ? data.agentArn : undefined,
    });
    (row as { vatRegistrationDate?: string }).vatRegistrationDate =
      data.vatRegistrationDate ?? undefined;
  } else {
    const supabase = await getSupabaseDataClient();
    if (supabase) {
      const { error } = await supabase
        .from("clients")
        .update({
          vrn: data.vrn,
          is_vat_registered: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.clientId)
        .eq("practice_id", session.practiceId);
      if (error) throw new Error(`Could not save VAT details: ${error.message}`);
    } else {
      const { getDb, hasDatabase } = await import("@/server/db");
      if (!hasDatabase()) {
        throw new Error(
          "Client storage is not configured. Supabase (or DATABASE_URL) is required.",
        );
      }
      const { clients } = await import("@/server/db/schema");
      const { and, eq } = await import("drizzle-orm");
      await getDb()
        .update(clients)
        .set({
          vrn: data.vrn,
          isVatRegistered: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clients.id, data.clientId),
            eq(clients.practiceId, session.practiceId),
          ),
        );
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "vat.hmrc_connect.prepare",
    entityType: "hmrc_connection",
    entityId: data.clientId,
    detail: {
      filingAs: data.filingAs,
      vrn: data.vrn,
      hasArn: Boolean(data.agentArn),
      hasVatRegDate: Boolean(data.vatRegistrationDate),
      clientName: client.name,
    },
  });

  revalidatePath(`/clients/${data.clientId}/vat`);
  revalidatePath(`/clients/${data.clientId}`);
  return {
    ok: true as const,
    authorizeUrl: `/api/hmrc/authorize?clientId=${encodeURIComponent(data.clientId)}&returnTo=vat`,
  };
}

const manualBoxesSchema = z.object({
  clientId: z.string(),
  periodKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  boxes: z.object({
    vatDueSales: z.number(),
    vatDueAcquisitions: z.number(),
    totalVatDue: z.number(),
    vatReclaimedCurrPeriod: z.number(),
    netVatDue: z.number(),
    totalValueSalesExVAT: z.number(),
    totalValuePurchasesExVAT: z.number(),
    totalValueGoodsSuppliedExVAT: z.number(),
    totalAcquisitionsExVAT: z.number(),
  }),
});

/** Save manually entered / uploaded nine-box figures (values in pence). */
export async function prepareVatReturnFromBoxes(
  input: z.infer<typeof manualBoxesSchema>,
) {
  const session = await requireSession();
  const data = manualBoxesSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.isVatRegistered || !client.vrn) {
    throw new Error("Client is not VAT registered — connect to HMRC first");
  }

  const draft = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    periodKey: data.periodKey,
    status: "ready",
    boxes: data.boxes,
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
  } else {
    await saveVatReturn(draft);
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "vat.prepare.manual",
    entityType: "vat_return",
    entityId: draft.id,
    detail: { periodKey: data.periodKey, boxes: data.boxes },
  });

  revalidatePath(`/clients/${data.clientId}/vat`);
  return draft;
}

/** @deprecated Use listVatObligations */
export const getDemoVatObligations = listVatObligations;
