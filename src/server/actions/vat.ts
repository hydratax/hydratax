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
  fetchVatObligations,
  submitVatReturn,
  boxesToHmrcPayload,
  type VatBoxes,
} from "@/server/hmrc/vat";
import {
  buildFraudPreventionHeaders,
  clientFraudMetadataSchema,
  fraudOptsFromRequest,
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
import { vatReturnBoxesSchema } from "@/server/money/schemas";

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

async function findStoredVatReturn(clientId: string, periodKey: string) {
  if (isDemoMode()) {
    return (
      demoStore.vatReturns.find(
        (r) => r.clientId === clientId && r.periodKey === periodKey,
      ) ?? null
    );
  }
  const deskRows = await deskListVatReturns(clientId);
  if (deskRows !== null) {
    const row = deskRows.find(
      (r) => String(r.period_key ?? r.periodKey ?? "") === periodKey,
    );
    return row ? mapSnakeCaseRow(row) : null;
  }
  const db = tryGetDb();
  if (!db) return null;
  const { vatReturns } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(vatReturns)
    .where(
      and(eq(vatReturns.clientId, clientId), eq(vatReturns.periodKey, periodKey)),
    )
    .limit(1);
  return rows[0] ?? null;
}

function parseStoredBoxes(raw: unknown): VatBoxes | null {
  const parsed = vatReturnBoxesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function submitPreparedVatReturn(
  input: z.infer<typeof submitSchema> & { confirmEndTrial?: boolean },
) {
  const session = await requireSession();
  const data = submitSchema.parse(input);
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });
  const client = await getClient(data.clientId);
  if (!client.vrn) throw new Error("Missing VRN");
  const approval = await import("@/server/actions/desk").then((m) =>
    m.portalApprovalError(data.clientId, "vat"),
  );
  if (approval) throw new Error(approval);

  const fraudHeaders = buildFraudPreventionHeaders(
    data.fraudMetadata,
    await fraudOptsFromRequest(),
  );

  // Prefer the saved draft (manual / TB / ledger prepare). Never silently
  // overwrite accountant-entered boxes by re-deriving from the ledger.
  const stored = await findStoredVatReturn(data.clientId, data.periodKey);
  const storedBoxes = stored ? parseStoredBoxes(stored.boxes) : null;
  const prepared =
    stored && storedBoxes
      ? { ...stored, boxes: storedBoxes }
      : await prepareVatReturn({
          clientId: data.clientId,
          periodKey: data.periodKey,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
  const draftId =
    "id" in prepared && typeof (prepared as { id?: unknown }).id === "string"
      ? String((prepared as { id: string }).id)
      : crypto.randomUUID();
  const draft = { ...prepared, id: draftId };
  const boxes = draft.boxes as VatBoxes;
  const accessToken = await getValidAccessToken(
    data.clientId,
    session.practiceId,
  );
  const cfg = getHmrcConfig();

  if (!accessToken || !cfg.clientId) {
    // Demo-only soft accept. Never mark a live desk return as HMRC-accepted
    // without a real OAuth token + app credentials.
    if (!isDemoMode()) {
      throw new Error(
        "HMRC VAT is not connected. Connect this client via OAuth (and set HMRC_CLIENT_ID) before submitting.",
      );
    }
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
    const idx = demoStore.vatReturns.findIndex((r) => r.id === draft.id);
    if (idx >= 0) demoStore.vatReturns[idx] = result;
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "hmrc.vat.submit.demo",
      entityType: "vat_return",
      entityId: draft.id,
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

  if (!res.ok) {
    const snippet = res.rawText.slice(0, 500);
    throw new Error(
      `HMRC rejected the VAT return (HTTP ${res.status})${snippet ? `: ${snippet}` : ""}`,
    );
  }

  revalidatePath(`/clients/${data.clientId}/vat`);
  return { result, hmrc: res };
}

/** Placeholder periods for UI when HMRC is not connected. */
function placeholderVatObligations() {
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

/**
 * SSR / initial paint: placeholders only. Live periodKeys must come from
 * `refreshVatObligationsFromHmrc` (browser fraud metadata required by law).
 */
export async function listVatObligations(clientId: string) {
  await getClient(clientId);
  return placeholderVatObligations();
}

const refreshObligationsSchema = z.object({
  clientId: z.string().min(1),
  fraudMetadata: clientFraudMetadataSchema,
});

/** Pull real HMRC VAT obligations (requires OAuth + fraud-prevention headers). */
export async function refreshVatObligationsFromHmrc(
  input: z.infer<typeof refreshObligationsSchema>,
) {
  const session = await requireSession();
  const data = refreshObligationsSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.vrn) {
    throw new Error("Client has no VRN — connect to HMRC first.");
  }

  const accessToken = await getValidAccessToken(
    data.clientId,
    session.practiceId,
  );
  const cfg = getHmrcConfig();
  if (!accessToken || !cfg.clientId) {
    throw new Error(
      "HMRC VAT is not connected. Complete OAuth before loading obligations.",
    );
  }

  const fraudHeaders = buildFraudPreventionHeaders(
    data.fraudMetadata,
    await fraudOptsFromRequest(),
  );
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 2);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetchVatObligations({
    vrn: client.vrn,
    accessToken,
    fraudHeaders,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
    from: iso(from),
    to: iso(to),
  });

  if (!res.ok) {
    throw new Error(
      `HMRC obligations request failed (HTTP ${res.status}): ${res.rawText.slice(0, 400)}`,
    );
  }

  const obligations = res.data?.obligations ?? [];
  return obligations.map((o) => ({
    periodKey: o.periodKey,
    start: o.start,
    end: o.end,
    due: o.due,
    status: o.status,
    received: o.received,
  }));
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
  boxes: vatReturnBoxesSchema,
});

/** Save manually entered / uploaded nine-box figures (values in pence). */
export async function prepareVatReturnFromBoxes(
  input: z.input<typeof manualBoxesSchema>,
) {
  const session = await requireSession();
  const data = manualBoxesSchema.parse(input);
  const client = await getClient(data.clientId);
  if (!client.isVatRegistered || !client.vrn) {
    throw new Error("Client is not VAT registered — connect to HMRC first");
  }

  // Enforce Box 3 / Box 5 identities before storing a ready draft.
  const { assertVatBoxIdentities } = await import("@/server/hmrc/vat");
  assertVatBoxIdentities(data.boxes);

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
