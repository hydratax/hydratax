"use server";

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
import { getValidAccessToken } from "@/server/hmrc/tokens";
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

export async function getSa100Draft(
  clientId: string,
  taxYear = "2025-26",
  taxpayerId?: string | null,
) {
  await getClient(clientId);
  return (
    returns().find(
      (r) =>
        r.clientId === clientId &&
        r.taxYear === taxYear &&
        r.status === "draft" &&
        sameTaxpayer(r, taxpayerId),
    ) ?? null
  );
}

export async function listSa100Returns(
  clientId: string,
  taxpayerId?: string | null,
) {
  await getClient(clientId);
  const fromMemory = returns().filter(
    (r) =>
      r.clientId === clientId &&
      (taxpayerId === undefined || sameTaxpayer(r, taxpayerId)),
  );

  // Durable prior-year uploads live on client_documents (survive serverless refresh).
  const fromDocs = await filedReturnsFromDocuments(clientId, taxpayerId).catch(
    () => [] as Sa100Stored[],
  );

  const byYear = new Map<string, Sa100Stored>();
  for (const r of fromDocs) byYear.set(`${r.taxYear}:${r.taxpayerId ?? ""}`, r);
  for (const r of fromMemory) {
    // In-memory drafts / live HMRC submits win over document placeholders.
    byYear.set(`${r.taxYear}:${r.taxpayerId ?? ""}`, r);
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
  const { parseSaFiledCategory, isLegacySaUploadCategory } = await import(
    "@/lib/sa-filed-docs"
  );
  const docs = await listClientDocuments(clientId);
  const filed: Array<{
    id: string;
    filename: string;
    blobUrl: string;
    taxYear: string | null;
    kind: "return" | "sa302" | "unassigned";
    createdAt: string;
  }> = [];

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
    if (isLegacySaUploadCategory(d.category)) {
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
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (client.type === "limited_company" && !input.taxpayerId) {
    throw new Error(
      "Select a director or shareholder before saving a Self Assessment return",
    );
  }

  const draft = sa100DraftSchema.parse(input.draft);
  const calculation = calculateSa302(draft);
  const attachedSupplements = supplementCodesForDraft(draft);
  const now = new Date().toISOString();
  const existing = await getSa100Draft(
    input.clientId,
    draft.taxYear,
    input.taxpayerId,
  );

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

  // People-list filter: saved SA100 → Drafted (do not downgrade later stages).
  try {
    const { normalizeWorkStage, mergeSaWorkStage } = await import(
      "@/lib/client-work-stage"
    );
    const { setClientWorkStage } = await import("@/server/actions/desk");
    const current = normalizeWorkStage(client.deskProfile?.workStage);
    const next = mergeSaWorkStage(current, "draft");
    if (next !== current) {
      await setClientWorkStage({
        clientId: input.clientId,
        stage: next,
        note: `Self Assessment ${draft.taxYear} draft saved`,
      });
    }
  } catch {
    /* best-effort */
  }

  // Persist SA100 pack + SA302 PDF alongside every draft save.
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
    console.warn("[sa100] draft PDF persist failed", err);
  }

  revalidatePath(`/clients/${input.clientId}/self-assessment`);
  revalidatePath("/self-assessment", "layout");
  revalidatePath("/clients");
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
  const { saFiledCategory } = await import("@/lib/sa-filed-docs");

  const taxpayerName =
    input.row.draft.declarationName?.trim() ||
    (input.client.type === "limited_company" ? "" : input.client.name);
  const meta = {
    submissionRef: input.row.hmrcCorrelationId ?? null,
    status: input.row.status,
    taxYear: input.row.taxYear,
  };

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
    filename: `SA100-${input.row.taxYear}-draft.pdf`,
    contentType: "application/pdf",
    bytes: pack.bytes,
    category: saFiledCategory(
      input.row.taxYear,
      "return",
      input.taxpayerId,
    ),
    uploadedBy: input.userId,
    folder: "sa-drafts",
  });
  await storeClientDocumentBytes({
    practiceId: input.practiceId,
    clientId: input.clientId,
    filename: `SA302-${input.row.taxYear}-draft.pdf`,
    contentType: "application/pdf",
    bytes: sa302,
    category: saFiledCategory(
      input.row.taxYear,
      "sa302",
      input.taxpayerId,
    ),
    uploadedBy: input.userId,
    folder: "sa-drafts",
  });
}

const submitSchema = z.object({
  clientId: z.string(),
  draft: sa100DraftSchema,
  fraudMetadata: clientFraudMetadataSchema,
  taxpayerId: z.string().optional().nullable(),
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

  const draft = sa100DraftSchema.parse({
    ...data.draft,
    utr: data.draft.utr || client.utr || "",
    nino: data.draft.nino || client.nino || "",
  });
  if (!draft.utr) throw new Error("UTR is required to submit.");
  if (!draft.nino) throw new Error("National Insurance number is required.");

  const calculation = calculateSa302(draft);
  const attachedSupplements = supplementCodesForDraft(draft);
  const fraudHeaders = buildFraudPreventionHeaders(data.fraudMetadata);
  const accessToken = await getValidAccessToken(data.clientId);
  const cfg = getHmrcConfig();
  const now = new Date().toISOString();
  const demo = isDemoMode() || !accessToken || !cfg.clientId;
  const correlationId = demo
    ? `demo-sa100-${Date.now()}`
    : `sa100-${Date.now()}`;

  // HMRC path: MTD Individual Calculations final declaration (and legacy SA Online XML).
  // We always persist the SA302 computation and issue SA100/SA302 PDFs for the practice.
  void fraudHeaders;

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
      note: demo
        ? "Demo / sandbox accept — connect HMRC agent OAuth for live final declaration"
        : "Submitted — confirm final declaration in HMRC Individual Calculations when live",
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
  const list = returns();
  const idx = list.findIndex(
    (r) =>
      r.clientId === input.clientId &&
      r.taxYear === input.taxYear &&
      allowed.has(r.status) &&
      sameTaxpayer(r, input.taxpayerId),
  );
  let removed: Sa100Stored | undefined;
  if (idx >= 0) {
    [removed] = list.splice(idx, 1);
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
    for (const d of yearDocs) {
      await updateClientDocumentCategory({
        clientId: input.clientId,
        documentId: d.id,
        category: "self_assessment",
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
