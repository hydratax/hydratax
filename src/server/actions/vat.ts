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

/**
 * Create AR1–AR5 for a filed VAT period. Uses `periodKey::ARn` so the unique
 * (client_id, period_key) constraint is respected without a migration.
 */
export async function createVatAmendment(input: {
  clientId: string;
  periodKey: string;
}): Promise<
  | {
      ok: true;
      returnId: string;
      periodKey: string;
      amendmentIndex: number;
      periodStart?: string;
      periodEnd?: string;
    }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false, error: "Read-only access." };
  }
  await getClient(input.clientId);
  const {
    nextAmendmentIndex,
    parseVatPeriodKeyAmendment,
    vatPeriodKeyWithAmendment,
  } = await import("@/lib/amendment-revision");

  const { basePeriodKey } = parseVatPeriodKeyAmendment(input.periodKey);
  const all = await listVatReturns(input.clientId);
  const related = all.filter((r) => {
    const key = String(
      (r as { periodKey?: string; period_key?: string }).periodKey ??
        (r as { period_key?: string }).period_key ??
        "",
    );
    return parseVatPeriodKeyAmendment(key).basePeriodKey === basePeriodKey;
  });
  const source =
    related.find((r) => {
      const key = String(
        (r as { periodKey?: string }).periodKey ??
          (r as { period_key?: string }).period_key ??
          "",
      );
      return parseVatPeriodKeyAmendment(key).amendmentIndex === 0;
    }) ?? related[0];
  if (!source) {
    return { ok: false, error: "No VAT return found for this period." };
  }
  const status = String(source.status ?? "").toLowerCase();
  if (!["submitted", "accepted", "ready"].includes(status) && status !== "submitted") {
    // Allow amend when filed; also when ready was already fulfilled via HMRC.
  }
  if (!["submitted", "accepted"].includes(status)) {
    return { ok: false, error: "Submit the VAT return before amending." };
  }

  const indexes = related.map((r) => {
    const key = String(
      (r as { periodKey?: string }).periodKey ??
        (r as { period_key?: string }).period_key ??
        "",
    );
    return parseVatPeriodKeyAmendment(key).amendmentIndex;
  });
  const nextIndex = nextAmendmentIndex(indexes);
  if (nextIndex == null) {
    return { ok: false, error: "Maximum five amendments (AR5) for this period." };
  }

  const newKey = vatPeriodKeyWithAmendment(basePeriodKey, nextIndex);
  const boxes = JSON.parse(JSON.stringify(source.boxes ?? {}));
  const id = crypto.randomUUID();
  const draft = {
    id,
    clientId: input.clientId,
    periodKey: newKey,
    status: "draft",
    boxes,
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.vatReturns.push(draft);
  } else {
    await saveVatReturn(draft);
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "vat.amendment.created",
    entityType: "vat_return",
    entityId: id,
    detail: {
      basePeriodKey,
      periodKey: newKey,
      amendmentIndex: nextIndex,
      sourcePeriodKey: input.periodKey,
    },
  });

  revalidatePath(`/clients/${input.clientId}/vat`);
  return {
    ok: true,
    returnId: id,
    periodKey: newKey,
    amendmentIndex: nextIndex,
  };
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
  // Stored rows (esp. mapSnakeCaseRow) are loosely typed and may lack `id`
  // on the union with prepareVatReturn — always materialise a string id.
  const draftId =
    typeof (prepared as { id?: unknown }).id === "string" &&
    (prepared as { id: string }).id.length > 0
      ? (prepared as { id: string }).id
      : crypto.randomUUID();
  const draft: { id: string; boxes: VatBoxes } & Record<string, unknown> = {
    ...(prepared as Record<string, unknown>),
    id: draftId,
    boxes: (prepared as { boxes: VatBoxes }).boxes,
  };
  const boxes = draft.boxes;
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
        "This client is not connected to HMRC yet. Connect first, then submit.",
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
    const { humanizeHmrcFailure } = await import("@/lib/hmrc-user-messages");
    throw new Error(
      humanizeHmrcFailure(
        res.rawText,
        "HMRC rejected the VAT return. Check the boxes and period, then try again.",
      ),
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
  vatRegistrationDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the VAT registration date"),
});

/**
 * Persist VRN + VAT registration date (durable client identifiers) before
 * HMRC OAuth. ARN stays on the practice profile for agent filers.
 */
export async function saveVatHmrcConnectDetails(
  input: z.infer<typeof connectSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = connectSchema.parse(input);

  if (data.filingAs === "agent" && !data.agentArn?.trim()) {
    throw new Error("Enter your Agent Reference Number (ARN)");
  }

  const client = await getClient(data.clientId);
  const vatRegistrationDate = data.vatRegistrationDate;

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (!row) throw new Error("Client not found");
    row.vrn = data.vrn;
    row.vatRegistrationDate = vatRegistrationDate;
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
  } else {
    const supabase = await getSupabaseDataClient();
    if (supabase) {
      const { error } = await supabase
        .from("clients")
        .update({
          vrn: data.vrn,
          vat_registration_date: vatRegistrationDate,
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
          vatRegistrationDate,
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
      hasVatRegDate: true,
      vatRegistrationDate,
      clientName: client.name,
    },
  });

  revalidatePath(`/clients/${data.clientId}/vat`);
  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/edit`);
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
  input: z.infer<typeof manualBoxesSchema>,
) {
  const session = await requireSession();
  const data = manualBoxesSchema.parse(input);
  const client = await getClient(data.clientId);
  const regDate =
    "vatRegistrationDate" in client
      ? (client.vatRegistrationDate as string | null)
      : null;
  if (
    !client.isVatRegistered ||
    !client.vrn ||
    !regDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(regDate)
  ) {
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

type VatDraftLine = {
  dated: string;
  category: string;
  amountPence: number;
};

function sliceVatPeriodLines(
  lines: VatDraftLine[],
  periodStart: string,
  periodEnd: string,
  regDate: string,
) {
  const effectiveStart = periodStart < regDate ? regDate : periodStart;
  return lines.filter(
    (t) => t.dated >= effectiveStart && t.dated <= periodEnd,
  );
}

/**
 * Draft VAT nine-box figures from the client's bank transactions.
 * Prefer {@link draftVatBoxesFromSelectedStatements} so the accountant
 * chooses CT / VAT / SA statement files before the pull.
 */
export async function draftVatBoxesFromBank(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  /** Per-category VAT treatment overrides from the transactions card. */
  treatmentOverrides?: Partial<Record<string, import("@/server/bank/vat-box-map").VatTreatment>>;
  /** Per-category direction overrides (output / input / none). */
  directionOverrides?: Partial<Record<string, import("@/server/bank/vat-box-map").VatDirection>>;
}) {
  await requireSession();
  const { clientId, periodStart, periodEnd } = input;
  const client = await getClient(clientId);
  const regDate =
    "vatRegistrationDate" in client
      ? (client.vatRegistrationDate as string | null)
      : null;
  if (!client.vrn || !regDate || !/^\d{4}-\d{2}-\d{2}$/.test(regDate)) {
    return {
      ok: false as const,
      error: "missing_vat_identifiers",
      boxes: null,
      breakdown: null,
      totalLines: 0,
      periodLines: 0,
    };
  }

  const { listBankTransactions } = await import("@/server/actions/bank");
  const { mapBankToVatBoxes } = await import("@/server/bank/vat-box-map");

  const allTxs = await listBankTransactions(clientId);
  const periodTxs = sliceVatPeriodLines(
    allTxs.map((t) => ({
      dated: t.dated,
      category: t.category,
      amountPence: t.amountPence,
    })),
    periodStart,
    periodEnd,
    regDate,
  );

  if (!periodTxs.length) {
    return {
      ok: false as const,
      error: "No bank transactions found in this VAT period. Upload or import statements first.",
      boxes: null,
      breakdown: null,
      totalLines: allTxs.length,
      periodLines: 0,
    };
  }

  const result = mapBankToVatBoxes(
    periodTxs,
    input.treatmentOverrides,
    input.directionOverrides,
  );

  return {
    ok: true as const,
    boxes: result.boxes,
    breakdown: result.breakdown,
    totalLines: allTxs.length,
    periodLines: periodTxs.length,
    outsideScopeLines: result.outsideScopeLineCount,
  };
}

/**
 * Draft VAT boxes from lines pulled from accountant-selected statement files.
 * Prefer {@link pullVatBoxesFromBooks} — it loads the company ledger and
 * selected files server-side (client blob fetch was failing silently).
 */
export async function draftVatBoxesFromSelectedStatements(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  /** Converted lines from the selected Books statement files. */
  lines: VatDraftLine[];
  /** Document ids confirmed in the pull dialog (audit only). */
  documentIds?: string[];
}) {
  const session = await requireSession();
  const { clientId, periodStart, periodEnd, lines, documentIds } = input;
  const client = await getClient(clientId);
  const regDate =
    "vatRegistrationDate" in client
      ? (client.vatRegistrationDate as string | null)
      : null;
  if (!client.vrn || !regDate || !/^\d{4}-\d{2}-\d{2}$/.test(regDate)) {
    return {
      ok: false as const,
      error: "missing_vat_identifiers",
      boxes: null,
      breakdown: null,
      totalLines: 0,
      periodLines: 0,
    };
  }

  if (!lines.length) {
    return {
      ok: false as const,
      error: "No lines in the selected statements.",
      boxes: null,
      breakdown: null,
      totalLines: 0,
      periodLines: 0,
    };
  }

  const { mapBankToVatBoxes } = await import("@/server/bank/vat-box-map");
  const periodTxs = sliceVatPeriodLines(
    lines,
    periodStart,
    periodEnd,
    regDate,
  );

  if (!periodTxs.length) {
    return {
      ok: false as const,
      error:
        "No transactions in this VAT period from the selected statements.",
      boxes: null,
      breakdown: null,
      totalLines: lines.length,
      periodLines: 0,
    };
  }

  const result = mapBankToVatBoxes(periodTxs);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "vat.boxes.drafted_from_statements",
    entityType: "vat_return",
    entityId: clientId,
    detail: {
      periodStart,
      periodEnd,
      documentIds: documentIds ?? [],
      totalLines: lines.length,
      periodLines: periodTxs.length,
    },
  }).catch(() => undefined);

  return {
    ok: true as const,
    boxes: result.boxes,
    breakdown: result.breakdown,
    totalLines: lines.length,
    periodLines: periodTxs.length,
    outsideScopeLines: result.outsideScopeLineCount,
  };
}

async function loadDocumentFileBytes(doc: {
  filename: string;
  contentType: string;
  blobUrl: string;
}): Promise<File | null> {
  try {
    if (doc.blobUrl.startsWith("data:")) {
      const comma = doc.blobUrl.indexOf(",");
      if (comma < 0) return null;
      const meta = doc.blobUrl.slice(0, comma);
      const data = doc.blobUrl.slice(comma + 1);
      const buf = meta.includes(";base64")
        ? Buffer.from(data, "base64")
        : Buffer.from(decodeURIComponent(data), "utf8");
      return new File([buf], doc.filename, {
        type: doc.contentType || "application/octet-stream",
      });
    }

    const keyMatch = doc.blobUrl.match(/[?&]key=([^&]+)/);
    if (keyMatch?.[1]) {
      const key = decodeURIComponent(keyMatch[1]);
      const { getR2Object, isR2Configured } = await import(
        "@/server/storage/r2"
      );
      if (!isR2Configured()) return null;
      const obj = await getR2Object(key);
      if (!obj.body) return null;
      return new File([obj.body], doc.filename, {
        type: obj.contentType || doc.contentType || "application/octet-stream",
      });
    }

    if (doc.blobUrl.startsWith("http")) {
      const res = await fetch(doc.blobUrl);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return new File([buf], doc.filename, {
        type: doc.contentType || res.headers.get("content-type") || "application/octet-stream",
      });
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Confirm-and-pull for VAT: uses company Books ledger when CT/VAT statements
 * are selected, and parses SA statement files only when explicitly chosen.
 * Avoids brittle client-side blob fetch/re-parse of archived PDFs.
 */
export async function pullVatBoxesFromBooks(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  documentIds: string[];
}) {
  const session = await requireSession();
  const { clientId, periodStart, periodEnd, documentIds } = input;
  const client = await getClient(clientId);
  const regDate =
    "vatRegistrationDate" in client
      ? (client.vatRegistrationDate as string | null)
      : null;
  if (!client.vrn || !regDate || !/^\d{4}-\d{2}-\d{2}$/.test(regDate)) {
    return {
      ok: false as const,
      error: "missing_vat_identifiers",
      boxes: null,
      breakdown: null,
      totalLines: 0,
      periodLines: 0,
    };
  }
  if (!documentIds.length) {
    return {
      ok: false as const,
      error: "No statements selected.",
      boxes: null,
      breakdown: null,
      totalLines: 0,
      periodLines: 0,
    };
  }

  const { listClientDocuments } = await import("@/server/actions/documents");
  const { bankStatementDesk } = await import("@/lib/bank/statement-docs");
  const { listBankTransactions } = await import("@/server/actions/bank");
  const { parseBankStatementFile } = await import(
    "@/server/bank/parse-statement-file"
  );
  const { mapBankToVatBoxes } = await import("@/server/bank/vat-box-map");

  const allDocs = await listClientDocuments(clientId);
  const selected = allDocs.filter((d) => documentIds.includes(d.id));
  const desks = new Set(
    selected
      .map((d) => bankStatementDesk(d.category))
      .filter((d): d is "ct" | "vat" | "sa" => Boolean(d)),
  );

  const lines: VatDraftLine[] = [];
  const seen = new Set<string>();

  function pushLine(line: VatDraftLine) {
    const key = `${line.dated}|${line.category}|${line.amountPence}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  }

  // Company tax / VAT selections → use the shared Books ledger for the period.
  if (desks.has("ct") || desks.has("vat")) {
    const txs = await listBankTransactions(clientId);
    for (const t of txs) {
      pushLine({
        dated: t.dated,
        category: t.category,
        amountPence: t.amountPence,
      });
    }
  }

  // Explicit SA selections → parse those personal statement files only.
  for (const doc of selected) {
    if (bankStatementDesk(doc.category) !== "sa") continue;
    const file = await loadDocumentFileBytes(doc);
    if (!file) continue;
    try {
      const parsed = await parseBankStatementFile(file);
      for (const line of parsed.lines) {
        pushLine({
          dated: line.dated,
          category: line.category,
          amountPence: line.amountPence,
        });
      }
    } catch {
      /* skip unreadable SA file */
    }
  }

  // If only SA was selected and parse failed, or CT/VAT with empty ledger —
  // also try parsing the selected CT/VAT source files as a fallback.
  if (!lines.length) {
    for (const doc of selected) {
      const desk = bankStatementDesk(doc.category);
      if (desk !== "ct" && desk !== "vat") continue;
      const file = await loadDocumentFileBytes(doc);
      if (!file) continue;
      try {
        const parsed = await parseBankStatementFile(file);
        for (const line of parsed.lines) {
          pushLine({
            dated: line.dated,
            category: line.category,
            amountPence: line.amountPence,
          });
        }
      } catch {
        /* skip */
      }
    }
  }

  const periodTxs = sliceVatPeriodLines(
    lines,
    periodStart,
    periodEnd,
    regDate,
  );

  if (!periodTxs.length) {
    return {
      ok: false as const,
      error:
        "No transactions in this VAT period from the selected Books statements.",
      boxes: null,
      breakdown: null,
      totalLines: lines.length,
      periodLines: 0,
    };
  }

  const result = mapBankToVatBoxes(periodTxs);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "vat.boxes.pulled_from_books",
    entityType: "vat_return",
    entityId: clientId,
    detail: {
      periodStart,
      periodEnd,
      documentIds,
      desks: [...desks],
      totalLines: lines.length,
      periodLines: periodTxs.length,
    },
  }).catch(() => undefined);

  return {
    ok: true as const,
    boxes: result.boxes,
    breakdown: result.breakdown,
    totalLines: lines.length,
    periodLines: periodTxs.length,
    outsideScopeLines: result.outsideScopeLineCount,
  };
}

/**
 * Check if a client has existing bank transactions (from CT/year-end desk).
 * Returns count + date range so the VAT desk knows if it can reuse them.
 */
export async function checkBankTransactionsForVat(clientId: string) {
  await requireSession();
  await getClient(clientId);

  const { listBankTransactions } = await import("@/server/actions/bank");
  const txs = await listBankTransactions(clientId);

  if (!txs.length) {
    return { count: 0, earliest: null, latest: null };
  }

  const dates = txs.map((t) => t.dated).sort();
  return {
    count: txs.length,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };
}

/** @deprecated Use listVatObligations */
export const getDemoVatObligations = listVatObligations;
