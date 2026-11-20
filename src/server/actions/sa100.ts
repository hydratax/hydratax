"use server";
import { safeErr } from "@/lib/redact";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { sa100DraftSchema, type Sa100Draft } from "@/lib/sa100/schema";
import { calculateSa302 } from "@/lib/sa100/calculate";
import { supplementCodesForDraft } from "@/lib/sa100/forms-catalog";
import { appendAuditEvent } from "@/server/audit/log";
import {
  buildFraudPreventionHeaders,
  clientFraudMetadataSchema,
} from "@/server/hmrc/fraud-headers";
import { getHmrcConfig } from "@/server/hmrc/config";

export type Sa100Stored = {
  id: string;
  clientId: string;
  /** Personal taxpayer id when the client is a limited company desk */
  taxpayerId?: string | null;
  taxYear: string;
  status: "draft" | "submitted" | "accepted";
  draft: Sa100Draft;
  calculation: ReturnType<typeof calculateSa302>;
  /** Supplementary form codes attached with this SA100 (e.g. SA102, SA103F). */
  attachedSupplements: string[];
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

function sameTaxpayer(
  row: Sa100Stored,
  taxpayerId?: string | null,
): boolean {
  const a = row.taxpayerId ?? null;
  const b = taxpayerId ?? null;
  return a === b;
}

function rowKey(r: Pick<Sa100Stored, "taxYear" | "taxpayerId">) {
  return `${r.taxYear}:${r.taxpayerId ?? ""}`;
}

/** desk_profile.sa100BlankStarts key — blocks income re-seed after delete. */
function sa100BlankStartKey(
  taxpayerId: string | null | undefined,
  taxYear: string,
): string {
  return `${taxpayerId ?? ""}:${taxYear}`;
}

export async function isSa100BlankStart(
  clientId: string,
  taxYear: string,
  taxpayerId?: string | null,
): Promise<boolean> {
  const client = await getClient(clientId);
  const keys = client.deskProfile?.sa100BlankStarts ?? [];
  return keys.includes(sa100BlankStartKey(taxpayerId, taxYear));
}

function hydrateStored(raw: unknown): Sa100Stored | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Sa100Stored;
  if (!r.id || !r.clientId || !r.taxYear || !r.draft) return null;
  try {
    return {
      ...r,
      draft: sa100DraftSchema.parse(r.draft),
      calculation:
        r.calculation ??
        calculateSa302(sa100DraftSchema.parse(r.draft)),
      attachedSupplements:
        r.attachedSupplements ??
        supplementCodesForDraft(sa100DraftSchema.parse(r.draft)),
      status: r.status ?? "draft",
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Load durable SA100 rows from clients.desk_profile (survives serverless). */
async function loadDurableReturns(clientId: string): Promise<Sa100Stored[]> {
  const client = await getClient(clientId);
  const raw = client.deskProfile?.sa100Returns ?? [];
  return raw
    .map((r) => hydrateStored(r))
    .filter((r): r is Sa100Stored => Boolean(r));
}

async function writeDurableReturns(
  clientId: string,
  rows: Sa100Stored[],
  extraProfile?: Record<string, unknown>,
): Promise<void> {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  const profile = {
    ...(client.deskProfile ?? {}),
    ...(extraProfile ?? {}),
    sa100Returns: rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      taxpayerId: r.taxpayerId ?? null,
      taxYear: r.taxYear,
      status: r.status,
      draft: r.draft,
      calculation: r.calculation,
      attachedSupplements: r.attachedSupplements,
      hmrcCorrelationId: r.hmrcCorrelationId,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (row) {
      row.deskProfile = profile;
      row.updatedAt = new Date().toISOString();
    }
    return;
  }

  const { isSupabaseConfigured } = await import("@/lib/env");
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        desk_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(error.message);
    return;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return;
  const { eq, and } = await import("drizzle-orm");
  const { clients } = await import("@/server/db/schema");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    );
}

async function upsertDurableReturn(row: Sa100Stored): Promise<void> {
  const all = await loadDurableReturns(row.clientId);
  const idx = all.findIndex(
    (r) =>
      r.taxYear === row.taxYear &&
      sameTaxpayer(r, row.taxpayerId) &&
      (r.status === "draft" || r.id === row.id),
  );
  // Replace matching draft for same year/person; keep other years / filed rows.
  const next = all.filter(
    (r) =>
      !(
        r.taxYear === row.taxYear &&
        sameTaxpayer(r, row.taxpayerId) &&
        r.status === "draft" &&
        row.status === "draft"
      ),
  );
  if (idx >= 0 && all[idx] && all[idx]!.status !== "draft") {
    next.push(row);
  } else {
    next.push(row);
  }
  // De-dupe by id
  const byId = new Map<string, Sa100Stored>();
  for (const r of next) byId.set(r.id, r);
  // Also ensure one draft per year+taxpayer
  const drafts = new Map<string, Sa100Stored>();
  const filed: Sa100Stored[] = [];
  for (const r of byId.values()) {
    if (r.status === "draft") drafts.set(rowKey(r), r);
    else filed.push(r);
  }
  const blankKey = sa100BlankStartKey(row.taxpayerId, row.taxYear);
  const client = await getClient(row.clientId);
  const blankPrev = client.deskProfile?.sa100BlankStarts ?? [];
  await writeDurableReturns(
    row.clientId,
    [...drafts.values(), ...filed],
    {
      sa100BlankStarts: blankPrev.filter((k) => k !== blankKey),
    },
  );
}

export async function getSa100Draft(
  clientId: string,
  taxYear = "2025-26",
  taxpayerId?: string | null,
) {
  await getClient(clientId);
  const durable = await loadDurableReturns(clientId);
  const hit =
    durable.find(
      (r) =>
        r.taxYear === taxYear &&
        r.status === "draft" &&
        sameTaxpayer(r, taxpayerId),
    ) ?? null;

  const list = returns();
  // Durable desk_profile is source of truth — drop stale in-memory drafts
  // that survive after delete on another serverless instance.
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]!;
    if (
      r.clientId === clientId &&
      r.taxYear === taxYear &&
      r.status === "draft" &&
      sameTaxpayer(r, taxpayerId)
    ) {
      if (!hit || r.id !== hit.id) list.splice(i, 1);
    }
  }
  if (hit) {
    if (!list.some((r) => r.id === hit.id)) list.push(hit);
    return hit;
  }
  return null;
}

export async function listSa100Returns(
  clientId: string,
  taxpayerId?: string | null,
) {
  await getClient(clientId);
  const fromDurable = (await loadDurableReturns(clientId)).filter(
    (r) => taxpayerId === undefined || sameTaxpayer(r, taxpayerId),
  );
  const durableIds = new Set(fromDurable.map((r) => r.id));
  const durableDraftKeys = new Set(
    fromDurable.filter((r) => r.status === "draft").map((r) => rowKey(r)),
  );

  // Drop in-memory drafts that were deleted from desk_profile.
  const mem = returns();
  for (let i = mem.length - 1; i >= 0; i--) {
    const r = mem[i]!;
    if (r.clientId !== clientId) continue;
    if (taxpayerId !== undefined && !sameTaxpayer(r, taxpayerId)) continue;
    if (r.status === "draft" && !durableDraftKeys.has(rowKey(r))) {
      mem.splice(i, 1);
    }
  }

  const fromMemory = mem.filter(
    (r) =>
      r.clientId === clientId &&
      (taxpayerId === undefined || sameTaxpayer(r, taxpayerId)),
  );

  // Durable prior-year uploads live on client_documents (survive serverless refresh).
  const fromDocs = await filedReturnsFromDocuments(clientId, taxpayerId).catch(
    () => [] as Sa100Stored[],
  );

  const byYear = new Map<string, Sa100Stored>();
  for (const r of fromDocs) byYear.set(rowKey(r), r);
  for (const r of fromDurable) byYear.set(rowKey(r), r);
  for (const r of fromMemory) {
    // Memory may hold a just-saved draft not yet re-read from durable.
    if (r.status === "draft" || durableIds.has(r.id)) {
      byYear.set(rowKey(r), r);
    }
  }
  return Array.from(byYear.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

async function filedReturnsFromDocuments(
  clientId: string,
  taxpayerId?: string | null,
): Promise<Sa100Stored[]> {
  const { listClientDocuments } = await import("@/server/actions/documents");
  const { parseSaFiledCategory } = await import("@/lib/sa-filed-docs");
  const { emptySa100Draft } = await import("@/lib/sa100/schema");
  const docs = await listClientDocuments(clientId);
  const byYear = new Map<string, Sa100Stored>();

  for (const d of docs) {
    const parsed = parseSaFiledCategory(d.category);
    if (!parsed || parsed.kind !== "return") continue;
    if (taxpayerId !== undefined) {
      const docTp = parsed.taxpayerId;
      if (taxpayerId && docTp && docTp !== taxpayerId) continue;
      if (taxpayerId && !docTp) {
        /* legacy year-only tags still show on the person desk */
      }
      if (!taxpayerId && docTp) continue;
    }
    const draft = emptySa100Draft({ taxYear: parsed.taxYear });
    const createdAt =
      typeof d.createdAt === "string"
        ? d.createdAt
        : new Date(d.createdAt).toISOString();
    byYear.set(parsed.taxYear, {
      id: `doc-${d.id}`,
      clientId,
      taxpayerId: parsed.taxpayerId ?? taxpayerId ?? null,
      taxYear: parsed.taxYear,
      status: "accepted",
      draft,
      calculation: calculateSa302(draft),
      attachedSupplements: [],
      hmrcCorrelationId: `upload-${d.id}`,
      submittedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return Array.from(byYear.values());
}

/** Filed SA100 / SA302 PDFs for a client (and optional taxpayer). */
export async function listSaFiledDocuments(
  clientId: string,
  taxpayerId?: string | null,
) {
  await getClient(clientId);
  const { listClientDocuments } = await import("@/server/actions/documents");
  const {
    parseSaFiledCategory,
    isUnassignedSaUpload,
    isLegacySaUploadCategory,
    isSystemGeneratedSaFilename,
    isSaDraftsStoragePath,
    SA_DISCARDED_CATEGORY,
  } = await import("@/lib/sa-filed-docs");
  const docs = await listClientDocuments(clientId);
  const filed: Array<{
    id: string;
    filename: string;
    blobUrl: string;
    taxYear: string | null;
    kind: "return" | "sa302" | "unassigned";
    createdAt: string;
  }> = [];

  const discardIds: string[] = [];

  for (const d of docs) {
    const createdAt =
      typeof d.createdAt === "string"
        ? d.createdAt
        : new Date(d.createdAt).toISOString();
    const parsed = parseSaFiledCategory(d.category);
    if (parsed) {
      if (taxpayerId) {
        if (parsed.taxpayerId && parsed.taxpayerId !== taxpayerId) continue;
      } else if (parsed.taxpayerId) {
        continue;
      }
      filed.push({
        id: d.id,
        filename: d.filename,
        blobUrl: d.blobUrl,
        taxYear: parsed.taxYear,
        kind: parsed.kind,
        createdAt,
      });
      continue;
    }
    // Soft-delete leftover system drafts that were retagged to self_assessment.
    if (
      isLegacySaUploadCategory(d.category) &&
      (isSystemGeneratedSaFilename(d.filename) ||
        isSaDraftsStoragePath(d.blobUrl))
    ) {
      discardIds.push(d.id);
      continue;
    }
    // Only accountant uploads — never system draft SA100/SA302 PDFs.
    if (isUnassignedSaUpload(d.category, d.filename, d.blobUrl)) {
      filed.push({
        id: d.id,
        filename: d.filename,
        blobUrl: d.blobUrl,
        taxYear: null,
        kind: "unassigned",
        createdAt,
      });
    }
  }

  if (discardIds.length) {
    const { updateClientDocumentCategory } = await import(
      "@/server/actions/documents"
    );
    for (const documentId of discardIds) {
      await updateClientDocumentCategory({
        clientId,
        documentId,
        category: SA_DISCARDED_CATEGORY,
      }).catch(() => undefined);
    }
  }
  return filed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSa100Return(clientId: string, returnId: string) {
  await getClient(clientId);
  const row = returns().find((r) => r.id === returnId && r.clientId === clientId);
  if (!row) throw new Error("Self Assessment return not found");
  if (!row.attachedSupplements) {
    row.attachedSupplements = supplementCodesForDraft(row.draft);
  }
  return row;
}

export async function saveSa100Draft(input: {
  clientId: string;
  draft: Sa100Draft;
  taxpayerId?: string | null;
  /** Skip SA100/SA302 PDF build — keeps Continue snappy between wizard steps. */
  skipPdfs?: boolean;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (client.type === "limited_company" && !input.taxpayerId) {
    throw new Error(
      "Select a director or shareholder before saving a Self Assessment return",
    );
  }

  const { listSaTaxpayers } = await import("@/server/actions/sa-taxpayers");
  const { saIdentifiersComplete, saIdentifiersMissing } = await import(
    "@/lib/sa-taxpayer"
  );
  const people = await listSaTaxpayers(input.clientId);
  const person =
    (input.taxpayerId
      ? people.find((p) => p.id === input.taxpayerId)
      : null) ??
    (people.length === 1 ? people[0] : null);

  if (!person || !saIdentifiersComplete(person)) {
    const missing = saIdentifiersMissing(person ?? {});
    throw new Error(
      `Enter ${missing.join(", ")} on the person’s Identifiers before saving the SA100.`,
    );
  }

  const draftIn = {
    ...input.draft,
    utr: person.utr || input.draft.utr,
    nino: person.nino || input.draft.nino,
  };

  const draft = sa100DraftSchema.parse(draftIn);
  const calculation = calculateSa302(draft);
  const attachedSupplements = supplementCodesForDraft(draft);
  const now = new Date().toISOString();
  const existing = await getSa100Draft(
    input.clientId,
    draft.taxYear,
    input.taxpayerId,
  );

  const isNew = !existing;
  let row = existing;
  if (row) {
    row.draft = draft;
    row.calculation = calculation;
    row.attachedSupplements = attachedSupplements;
    row.taxpayerId = input.taxpayerId ?? null;
    row.updatedAt = now;
  } else {
    row = {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      taxpayerId: input.taxpayerId ?? null,
      taxYear: draft.taxYear,
      status: "draft",
      draft,
      calculation,
      attachedSupplements,
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
  }

  // Persist to desk_profile (also clears blank-start flag for this year).
  await upsertDurableReturn(row);

  // People-list filter: saved SA100 → Drafted (do not downgrade later stages).
  try {
    const { normalizeWorkStage, mergeSaWorkStage } = await import(
      "@/lib/client-work-stage"
    );
    const { setClientWorkStage, appendClientWorkLog } = await import(
      "@/server/actions/desk"
    );
    const current = normalizeWorkStage(client.deskProfile?.workStage);
    const next = mergeSaWorkStage(current, "draft");
    if (next !== current) {
      await setClientWorkStage({
        clientId: input.clientId,
        stage: next,
        note: `Self Assessment ${draft.taxYear} draft saved`,
        desk: "sa",
      });
    }
    // Always record create / amend on the SA desk worklog.
    if (isNew) {
      await appendClientWorkLog({
        clientId: input.clientId,
        kind: "document",
        label: `SA100 draft created — ${draft.taxYear}`,
        detail: person?.fullName || undefined,
        desk: "sa",
      });
    } else if (!input.skipPdfs) {
      await appendClientWorkLog({
        clientId: input.clientId,
        kind: "document",
        label: `SA100 draft amended — ${draft.taxYear}`,
        detail: person?.fullName || undefined,
        desk: "sa",
      });
    }
  } catch {
    /* best-effort */
  }

  // PDF pack is expensive — only when explicitly requested (Save draft / submit).
  if (!input.skipPdfs) {
    try {
      await persistSaDraftPdfs({
        practiceId: session.practiceId,
        userId: session.userId,
        clientId: input.clientId,
        taxpayerId: input.taxpayerId,
        client,
        row,
      });
    } catch (err) {
      console.warn("[sa100] draft PDF persist failed", safeErr(err));
    }
  }

  // Avoid full /clients revalidation on every step — that stalls Continue.
  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  revalidatePath("/self-assessment", "layout");
  if (!input.skipPdfs) {
    revalidatePath("/clients");
  }
  return row;
}

async function persistSaDraftPdfs(input: {
  practiceId: string;
  userId: string;
  clientId: string;
  taxpayerId?: string | null;
  client: Awaited<ReturnType<typeof getClient>>;
  row: Sa100Stored;
}) {
  const { buildSa302Pdf } = await import("@/server/sa100/pdf");
  const { buildSa100PackPdf } = await import("@/server/sa100/pack");
  const { storeClientDocumentBytes } = await import(
    "@/server/documents/store-bytes"
  );
  const {
    saFiledCategory,
    parseSaFiledCategory,
    SA_DISCARDED_CATEGORY,
  } = await import("@/lib/sa-filed-docs");

  let taxpayerName =
    input.row.draft.declarationName?.trim() ||
    (input.client.type === "limited_company" ? "" : input.client.name);
  let taxpayerAddress: string | null = null;
  if (input.taxpayerId) {
    try {
      const { listSaTaxpayers } = await import("@/server/actions/sa-taxpayers");
      const person = (await listSaTaxpayers(input.clientId)).find(
        (p) => p.id === input.taxpayerId,
      );
      taxpayerAddress = person?.address?.trim() || null;
      if (person?.fullName?.trim()) {
        taxpayerName =
          input.row.draft.declarationName?.trim() || person.fullName.trim();
      }
    } catch {
      /* optional */
    }
  }
  const meta = {
    submissionRef: input.row.hmrcCorrelationId ?? null,
    status: input.row.status,
    taxYear: input.row.taxYear,
    address: taxpayerAddress || input.client.address || null,
  };

  const returnCat = saFiledCategory(
    input.row.taxYear,
    "return",
    input.taxpayerId,
  );
  const sa302Cat = saFiledCategory(
    input.row.taxYear,
    "sa302",
    input.taxpayerId,
  );

  // Replace prior auto-drafts for this year — do not stack copies into Documents.
  try {
    const { listClientDocuments, updateClientDocumentCategory } = await import(
      "@/server/actions/documents"
    );
    const existing = await listClientDocuments(input.clientId);
    for (const d of existing) {
      const parsed = parseSaFiledCategory(d.category);
      if (!parsed || parsed.taxYear !== input.row.taxYear) continue;
      if (input.taxpayerId) {
        if (parsed.taxpayerId && parsed.taxpayerId !== input.taxpayerId) continue;
      } else if (parsed.taxpayerId) {
        continue;
      }
      if (parsed.kind !== "return" && parsed.kind !== "sa302") continue;
      await updateClientDocumentCategory({
        clientId: input.clientId,
        documentId: d.id,
        category: SA_DISCARDED_CATEGORY,
      }).catch(() => undefined);
    }
  } catch {
    /* best-effort */
  }

  const sa302 = await buildSa302Pdf(
    input.row.calculation,
    taxpayerName,
    input.row.draft.utr || input.client.utr || "",
    meta,
  );
  const pack = await buildSa100PackPdf(input.row.draft, taxpayerName, meta);

  await storeClientDocumentBytes({
    practiceId: input.practiceId,
    clientId: input.clientId,
    filename: `SA100-${input.row.taxYear}-${(taxpayerName || "taxpayer").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "taxpayer"}.pdf`,
    contentType: "application/pdf",
    bytes: pack.bytes,
    category: returnCat,
    uploadedBy: input.userId,
    folder: "sa-drafts",
  });
  await storeClientDocumentBytes({
    practiceId: input.practiceId,
    clientId: input.clientId,
    filename: `SA302-${input.row.taxYear}-draft.pdf`,
    contentType: "application/pdf",
    bytes: sa302,
    category: sa302Cat,
    uploadedBy: input.userId,
    folder: "sa-drafts",
  });
}

const submitSchema = z.object({
  clientId: z.string(),
  draft: sa100DraftSchema,
  fraudMetadata: clientFraudMetadataSchema,
  taxpayerId: z.string().optional().nullable(),
  /** Government Gateway — required for live SA Online submit. */
  senderId: z.string().optional(),
  senderPassword: z.string().optional(),
  useSavedPassword: z.boolean().optional(),
  rememberPassword: z.boolean().optional(),
  /** Force demo accept (local/demo only). */
  demo: z.boolean().optional(),
  /**
   * When true, submit live to HMRC Transaction Engine even in local demo mode
   * (uses Government Gateway + ETS/live endpoints from HMRC_ENV).
   */
  live: z.boolean().optional(),
});

export async function submitSa100Return(
  input: z.infer<typeof submitSchema> & { confirmEndTrial?: boolean },
) {
  const session = await requireSession();
  const { requireLiveFilingAllowed } = await import(
    "@/server/billing/filing-gate"
  );
  await requireLiveFilingAllowed(session.practiceId, {
    confirmEndTrial: Boolean(input.confirmEndTrial),
  });
  const data = submitSchema.parse(input);
  const client = await getClient(data.clientId);
  if (client.type === "limited_company" && !data.taxpayerId) {
    throw new Error(
      "Select a director or shareholder before submitting Self Assessment",
    );
  }
  if (!data.draft.declarationAccepted) {
    throw new Error("Accept the TR8 declaration before submitting.");
  }
  if (!data.draft.declarationDate?.trim()) {
    throw new Error("Enter the declaration date before submitting.");
  }

  const { listSaTaxpayers } = await import("@/server/actions/sa-taxpayers");
  const { saIdentifiersComplete, saIdentifiersMissing } = await import(
    "@/lib/sa-taxpayer"
  );
  const people = await listSaTaxpayers(data.clientId);
  const person =
    (data.taxpayerId
      ? people.find((p) => p.id === data.taxpayerId)
      : null) ??
    (people.length === 1 ? people[0] : null);
  if (!person || !saIdentifiersComplete(person)) {
    const missing = saIdentifiersMissing(person ?? {});
    throw new Error(
      `Enter ${missing.join(", ")} on the person’s Identifiers before submitting.`,
    );
  }

  // Personal UTR only — never fall back to a limited company UTR.
  const personalUtr =
    data.draft.utr?.replace(/\s/g, "") ||
    person.utr?.replace(/\s/g, "") ||
    (client.type === "limited_company"
      ? ""
      : (client.utr || "").replace(/\s/g, ""));
  const personalNino =
    data.draft.nino?.replace(/\s/g, "") ||
    person.nino?.replace(/\s/g, "") ||
    (client.type === "limited_company"
      ? ""
      : (client.nino || "").replace(/\s/g, ""));

  const draft = sa100DraftSchema.parse({
    ...data.draft,
    utr: personalUtr,
    nino: personalNino,
  });
  if (!draft.utr) {
    throw new Error(
      "A personal UTR is required to submit Self Assessment (not a company UTR).",
    );
  }
  if (!draft.nino) throw new Error("National Insurance number is required.");

  let taxpayerName =
    draft.declarationName.trim() ||
    person.fullName?.trim() ||
    (client.type === "limited_company" ? "" : client.name);

  const calculation = calculateSa302(draft);
  const attachedSupplements = supplementCodesForDraft(draft);
  const { fraudOptsFromRequest } = await import("@/server/hmrc/fraud-headers");
  const fraudHeaders = buildFraudPreventionHeaders(
    data.fraudMetadata,
    await fraudOptsFromRequest(),
  );
  void fraudHeaders;
  const cfg = getHmrcConfig();
  const now = new Date().toISOString();

  // Live SA Online uses Government Gateway + Transaction Engine (not MTD OAuth).
  const wantDemo =
    data.demo === true || (isDemoMode() && data.live !== true);
  let senderId = "";
  let senderPassword = "";
  if (!wantDemo) {
    const { resolveGatewayCredentialsForSubmit } = await import(
      "@/server/hmrc/gateway-credentials"
    );
    const resolved = await resolveGatewayCredentialsForSubmit({
      clientId: data.clientId,
      senderId: data.senderId,
      senderPassword: data.senderPassword,
      useSavedPassword: data.useSavedPassword,
      rememberPassword: data.rememberPassword,
    });
    senderId = resolved.senderId;
    senderPassword = resolved.senderPassword;
  }

  const { submitSa100ToHmrc } = await import("@/server/hmrc/sa100/submit");
  const hmrc = await submitSa100ToHmrc({
    draft,
    taxpayerName: taxpayerName || "Taxpayer",
    senderId,
    senderPassword,
    actorId: session.userId,
    clientId: data.clientId,
    practiceId: session.practiceId,
    demo: wantDemo,
  });

  if (!hmrc.ok) {
    throw new Error(
      hmrc.errorMessage ||
        "HMRC did not accept this Self Assessment return. Check Gateway credentials and return details.",
    );
  }

  const correlationId = hmrc.correlationId;
  const demo = hmrc.demo;

  let row = await getSa100Draft(data.clientId, draft.taxYear, data.taxpayerId);
  if (!row) {
    row = {
      id: crypto.randomUUID(),
      clientId: data.clientId,
      taxpayerId: data.taxpayerId ?? null,
      taxYear: draft.taxYear,
      status: "draft",
      draft,
      calculation,
      attachedSupplements,
      createdAt: now,
      updatedAt: now,
    };
    returns().push(row);
  }

  row.draft = draft;
  row.calculation = calculation;
  row.attachedSupplements = attachedSupplements;
  row.taxpayerId = data.taxpayerId ?? null;
  row.status = demo ? "accepted" : "submitted";
  row.hmrcCorrelationId = correlationId;
  row.submittedAt = now;
  row.updatedAt = now;

  await upsertDurableReturn(row);

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
      taxpayerId: data.taxpayerId ?? null,
      amountDue: calculation.amountDue,
      refundDue: calculation.refundDue,
      attachedSupplements,
      demo,
      env: cfg.env,
      note: demo
        ? "Demo accept — use live submit with Government Gateway for HMRC"
        : "Submitted to HMRC Transaction Engine (HMRC-SA-SA100)",
    },
  });

  try {
    const { setClientWorkStage } = await import("@/server/actions/desk");
    await setClientWorkStage({
      clientId: data.clientId,
      stage: "submitted",
      note: `Self Assessment ${draft.taxYear} submitted`,
    });
  } catch {
    /* best-effort */
  }

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  return {
    id: row.id,
    correlationId,
    demo,
    calculation,
    attachedSupplements,
  };
}

/** Delete the draft for a tax year (one draft per year). */
export async function deleteSa100Draft(input: {
  clientId: string;
  taxYear: string;
  taxpayerId?: string | null;
}) {
  return deleteSa100Return({
    ...input,
    statuses: ["draft"],
  });
}

/** Delete an SA100 row for a tax year (draft and/or filed). */
export async function deleteSa100Return(input: {
  clientId: string;
  taxYear: string;
  taxpayerId?: string | null;
  statuses?: Array<"draft" | "submitted" | "accepted">;
}) {
  const session = await requireSession();
  await getClient(input.clientId);
  const allowed = new Set(
    input.statuses?.length
      ? input.statuses
      : (["draft", "submitted", "accepted"] as const),
  );
  function matchesDelete(r: Sa100Stored): boolean {
    if (r.clientId !== input.clientId) return false;
    if (r.taxYear !== input.taxYear) return false;
    if (!allowed.has(r.status)) return false;
    // Exact taxpayer match, or orphan year draft (null taxpayerId) when
    // deleting for a specific person — both must go so figures cannot linger.
    if (sameTaxpayer(r, input.taxpayerId)) return true;
    if (input.taxpayerId && (r.taxpayerId ?? null) === null) return true;
    return false;
  }

  const list = returns();
  let removed: Sa100Stored | undefined;
  // Purge every matching in-memory row (not just the first).
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]!;
    if (matchesDelete(r)) {
      list.splice(i, 1);
      removed = r;
    }
  }
  try {
    const client = await getClient(input.clientId);
    const durable = await loadDurableReturns(input.clientId);
    const hit = durable.find((r) => matchesDelete(r));
    const next = durable.filter((r) => !matchesDelete(r));
    const blankKey = sa100BlankStartKey(input.taxpayerId, input.taxYear);
    const blankPrev = client.deskProfile?.sa100BlankStarts ?? [];
    // Clear returns + mark blank start in one write (avoid profile race).
    await writeDurableReturns(input.clientId, next, {
      sa100BlankStarts: blankPrev.includes(blankKey)
        ? blankPrev
        : [...blankPrev, blankKey],
    });
    if (!removed && hit) removed = hit;
  } catch (err) {
    console.warn("[sa100] durable delete failed", safeErr(err));
    throw new Error("Could not delete the saved return. Try again.");
  }

  const filedBefore = await listSaFiledDocuments(
    input.clientId,
    input.taxpayerId,
  ).catch(() => []);
  const yearDocs = filedBefore.filter((d) => d.taxYear === input.taxYear);
  if (!removed && yearDocs.length === 0) {
    throw new Error("No Self Assessment return found for that year");
  }

  // Clear durable filed PDFs for that year (return + optional SA302).
  try {
    const { updateClientDocumentCategory } = await import(
      "@/server/actions/documents"
    );
    const { SA_DISCARDED_CATEGORY } = await import("@/lib/sa-filed-docs");
    for (const d of yearDocs) {
      await updateClientDocumentCategory({
        clientId: input.clientId,
        documentId: d.id,
        category: SA_DISCARDED_CATEGORY,
      }).catch(() => undefined);
    }
  } catch {
    /* documents optional */
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "sa100.return.delete",
    entityType: "sa100_return",
    entityId: removed?.id,
    detail: { taxYear: input.taxYear, status: removed?.status },
  }).catch(() => undefined);
  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  revalidatePath("/self-assessment", "layout");
  return { ok: true as const };
}

/**
 * Record a prior-year submitted return (upload supporting PDF) without
 * opening a new draft for that year. Tags the document so it survives refresh.
 */
export async function recordSubmittedSaReturn(input: {
  clientId: string;
  taxYear: string;
  taxpayerId?: string | null;
  documentId?: string | null;
  filename?: string | null;
}) {
  return recordSaFiledUpload({ ...input, kind: "return" });
}

/** Upload / attach an SA302 tax calculation PDF for a prior year. */
export async function recordSa302Upload(input: {
  clientId: string;
  taxYear: string;
  taxpayerId?: string | null;
  documentId: string;
  filename?: string | null;
}) {
  return recordSaFiledUpload({ ...input, kind: "sa302" });
}

/** Assign an untagged SA upload (legacy self_assessment) to a year + kind. */
export async function assignSaFiledDocument(input: {
  clientId: string;
  documentId: string;
  taxYear: string;
  kind: "return" | "sa302";
  taxpayerId?: string | null;
}) {
  return recordSaFiledUpload({
    clientId: input.clientId,
    taxYear: input.taxYear,
    taxpayerId: input.taxpayerId,
    documentId: input.documentId,
    kind: input.kind,
  });
}

async function recordSaFiledUpload(input: {
  clientId: string;
  taxYear: string;
  taxpayerId?: string | null;
  documentId?: string | null;
  filename?: string | null;
  kind: "return" | "sa302";
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  const { parseSaTaxYearLabel } = await import("@/lib/sa-tax-year");
  const { saFiledCategory, parseSaFiledCategory } = await import(
    "@/lib/sa-filed-docs"
  );
  const year = parseSaTaxYearLabel(input.taxYear);
  if (!year) throw new Error("Invalid tax year");
  if (!input.documentId) throw new Error("Upload a PDF first");

  if (input.kind === "return") {
    const existingDraft = await getSa100Draft(
      input.clientId,
      year.label,
      input.taxpayerId,
    );
    if (existingDraft) {
      throw new Error(
        `Delete the ${year.label} draft before recording a submitted return for that year`,
      );
    }
  }

  const filed = await listSaFiledDocuments(
    input.clientId,
    input.taxpayerId,
  ).catch(() => []);
  const clash = filed.find(
    (d) =>
      d.taxYear === year.label &&
      d.kind === input.kind &&
      d.id !== input.documentId,
  );
  if (clash) {
    throw new Error(
      `A ${input.kind === "sa302" ? "SA302" : "submitted return"} already exists for ${year.label}`,
    );
  }

  const { updateClientDocumentCategory } = await import(
    "@/server/actions/documents"
  );
  const tagged = await updateClientDocumentCategory({
    clientId: input.clientId,
    documentId: input.documentId,
    category: saFiledCategory(year.label, input.kind, input.taxpayerId),
  });

  // Keep an in-memory SA100 row for return uploads (desk session convenience).
  let row: Sa100Stored | null = null;
  if (input.kind === "return") {
    const already = returns().find(
      (r) =>
        r.clientId === input.clientId &&
        r.taxYear === year.label &&
        (r.status === "submitted" || r.status === "accepted") &&
        sameTaxpayer(r, input.taxpayerId),
    );
    if (!already) {
      const { emptySa100Draft } = await import("@/lib/sa100/schema");
      const draft = emptySa100Draft({
        taxYear: year.label,
        utr: client.utr ?? "",
        nino: client.nino ?? "",
      });
      const now = new Date().toISOString();
      row = {
        id: `doc-${input.documentId}`,
        clientId: input.clientId,
        taxpayerId: input.taxpayerId ?? null,
        taxYear: year.label,
        status: "accepted",
        draft,
        calculation: calculateSa302(draft),
        attachedSupplements: [],
        hmrcCorrelationId: `upload-${input.documentId}`,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      returns().push(row);
    } else {
      row = already;
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action:
      input.kind === "sa302" ? "sa100.sa302.upload" : "sa100.submitted.upload",
    entityType: "sa100_return",
    entityId: row?.id ?? input.documentId,
    detail: {
      taxYear: year.label,
      documentId: input.documentId,
      filename: input.filename ?? tagged.filename,
      kind: input.kind,
      category: parseSaFiledCategory(tagged.category),
    },
  }).catch(() => undefined);

  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  revalidatePath("/self-assessment", "layout");
  return {
    ok: true as const,
    kind: input.kind,
    taxYear: year.label,
    documentId: input.documentId,
    filename: tagged.filename,
    blobUrl: tagged.blobUrl,
    return: row,
  };
}
