"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import {
  DEFAULT_PORTAL_REQUESTS,
  portalApprovalMissing,
  type AmlRisk,
  type DeskProfile,
  type EngagementRecord,
  type JobStatus,
  type PortalApprovalPack,
  type PortalRecord,
  type PortalSignRequest,
  type PortalUpload,
} from "@/lib/desk-profile";
import {
  normalizeWorkStage,
  WORK_STAGE_LABEL,
  type ClientWorkLogEntry,
  type ClientWorkStage,
} from "@/lib/client-work-stage";
import { requireSession } from "@/server/auth/session";
import { demoStore } from "@/server/demo/store";
import { getClient } from "@/server/actions/clients";

function mergeProfile(
  current: DeskProfile | null | undefined,
  patch: Partial<DeskProfile>,
): DeskProfile {
  return { ...(current ?? {}), ...patch };
}

async function writeProfile(clientId: string, profile: DeskProfile) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  if (session.role === "readonly") throw new Error("Forbidden");

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    row.deskProfile = profile;
    row.updatedAt = new Date().toISOString();
    return profile;
  }

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
    return profile;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Client storage is not configured");
  const { eq, and } = await import("drizzle-orm");
  const { clients } = await import("@/server/db/schema");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    );
  return profile;
}

function revalidateClient(clientId: string) {
  revalidatePath("/filings");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/aml`);
  revalidatePath(`/clients/${clientId}/engagement`);
  revalidatePath(`/clients/${clientId}/portal`);
  revalidatePath(`/clients/${clientId}/forms`);
  revalidatePath(`/clients/${clientId}/documents`);
}

export async function saveAmlRecord(input: {
  clientId: string;
  risk: AmlRisk;
  idVerifiedOn: string;
  nextReviewOn: string;
  reviewer: string;
  notes: string;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const profile = mergeProfile(client.deskProfile, {
    aml: {
      risk: input.risk,
      idVerifiedOn: input.idVerifiedOn,
      nextReviewOn: input.nextReviewOn,
      reviewer: input.reviewer.trim(),
      notes: input.notes.trim(),
      updatedAt: new Date().toISOString(),
    },
  });
  await writeProfile(input.clientId, profile);
  revalidateClient(input.clientId);
  return { ok: true as const };
}

export async function saveEngagement(input: {
  clientId: string;
  status: EngagementRecord["status"];
  feePounds: number;
  services: string[];
  issuedOn: string;
  signedOn: string;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const profile = mergeProfile(client.deskProfile, {
    engagement: {
      status: input.status,
      feePounds: Number.isFinite(input.feePounds) ? input.feePounds : 0,
      services: input.services.map((s) => s.trim()).filter(Boolean),
      issuedOn: input.issuedOn,
      signedOn: input.signedOn,
    },
  });
  await writeProfile(input.clientId, profile);
  revalidateClient(input.clientId);
  return { ok: true as const };
}

export async function portalApprovalError(
  clientId: string | null | undefined,
  kind: "accounts" | "ct600" | "vat",
) {
  if (!clientId) return null;
  try {
    const client = await getClient(clientId);
    if (!portalApprovalMissing(client.deskProfile?.portal, kind)) return null;
    const label =
      kind === "accounts"
        ? "annual accounts"
        : kind === "ct600"
          ? "Company Tax Return"
          : "VAT return";
    return `The client has not approved the ${label} on their client link. Ask them to approve it before you file.`;
  } catch {
    return null;
  }
}

export async function ensurePortal(clientId: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client) throw new Error("Client not found");
  if (client.deskProfile?.portal?.token) {
    return client.deskProfile.portal;
  }
  const portal: PortalRecord = {
    token: randomBytes(18).toString("hex"),
    requests: DEFAULT_PORTAL_REQUESTS.map((r) => ({ ...r })),
    approveAccounts: false,
    approveCt600: false,
    approveVat: false,
  };
  await writeProfile(clientId, mergeProfile(client.deskProfile, { portal }));
  const { appendAuditEvent } = await import("@/server/audit/log");
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "portal.link_created",
    entityType: "portal",
    entityId: clientId,
    detail: { tokenPrefix: portal.token.slice(0, 8) },
  }).catch(() => undefined);
  revalidateClient(clientId);
  return portal;
}

export async function setJobStatus(input: {
  clientId: string;
  filingId: string;
  status: JobStatus;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const jobs = { ...(client.deskProfile?.jobs ?? {}), [input.filingId]: input.status };
  await writeProfile(input.clientId, mergeProfile(client.deskProfile, { jobs }));
  revalidatePath("/filings");
  return { ok: true as const };
}

function pushWorkLog(
  profile: DeskProfile | null | undefined,
  entry: Omit<ClientWorkLogEntry, "id" | "at"> & { at?: string },
): ClientWorkLogEntry[] {
  const log = [...(profile?.workLog ?? [])];
  log.push({
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    kind: entry.kind,
    label: entry.label,
    detail: entry.detail,
    actorId: entry.actorId,
  });
  // Keep the last 200 entries
  return log.slice(-200);
}

/** Append a timestamped line to the client working log (no stage change). */
export async function appendClientWorkLog(input: {
  clientId: string;
  kind: ClientWorkLogEntry["kind"];
  label: string;
  detail?: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const workLog = pushWorkLog(client.deskProfile, {
    kind: input.kind,
    label: input.label,
    detail: input.detail,
    actorId: session.userId,
  });
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { workLog }),
  );
  revalidateClient(input.clientId);
  return { ok: true as const };
}

/** Move the client through the accounts / SA prep pipeline. */
export async function setClientWorkStage(input: {
  clientId: string;
  stage: ClientWorkStage;
  note?: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");

  const stage = normalizeWorkStage(input.stage);
  const label = WORK_STAGE_LABEL[stage];
  const workLog = pushWorkLog(client.deskProfile, {
    kind: "stage",
    label,
    detail: input.note?.trim() || undefined,
    actorId: session.userId,
  });

  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { workStage: stage, workLog }),
  );

  const { appendAuditEvent } = await import("@/server/audit/log");
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "client.work_stage",
    entityType: "client",
    entityId: input.clientId,
    detail: { stage, note: input.note?.trim() || null },
  }).catch(() => undefined);

  revalidateClient(input.clientId);
  revalidatePath("/clients");
  return { ok: true as const, stage, label };
}

export async function recordPortalOpened(token: string) {
  const client = await findClientByPortalToken(token);
  if (!client?.deskProfile?.portal) return { ok: false as const };
  const { appendAuditEvent } = await import("@/server/audit/log");
  await appendAuditEvent({
    practiceId:
      "practiceId" in client && client.practiceId
        ? String(client.practiceId)
        : null,
    clientId: client.id,
    actorId: "client-portal",
    action: "portal.opened",
    entityType: "portal",
    entityId: client.id,
  }).catch(() => undefined);
  return { ok: true as const };
}

export async function findClientByPortalToken(token: string) {
  if (!token || token.length < 16) return null;

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.deskProfile?.portal?.token === token);
    return row ?? null;
  }

  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("clients")
      .select("id,practice_id,name,type,desk_profile")
      .filter("desk_profile->portal->>token", "eq", token)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id as string,
      practiceId: data.practice_id as string,
      name: data.name as string,
      type: data.type as string,
      deskProfile: (data.desk_profile as DeskProfile) ?? null,
    };
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return null;
  const { clients } = await import("@/server/db/schema");
  const { sql } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(clients)
    .where(sql`${clients.deskProfile}->'portal'->>'token' = ${token}`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    practiceId: row.practiceId,
    name: row.name,
    type: row.type,
    deskProfile: (row.deskProfile as DeskProfile) ?? null,
  };
}

export async function updatePortalFromClient(input: {
  token: string;
  requestId?: string;
  done?: boolean;
  requests?: { id: string; done: boolean }[];
  approveAccounts?: boolean;
  approveCt600?: boolean;
  approveVat?: boolean;
}) {
  const client = await findClientByPortalToken(input.token);
  if (!client?.deskProfile?.portal) return { ok: false as const, error: "Link not found" };
  const portal = { ...client.deskProfile.portal };
  if (input.requests) {
    const doneById = new Map(input.requests.map((r) => [r.id, r.done]));
    portal.requests = portal.requests.map((r) =>
      doneById.has(r.id) ? { ...r, done: Boolean(doneById.get(r.id)) } : r,
    );
  }
  if (input.requestId) {
    portal.requests = portal.requests.map((r) =>
      r.id === input.requestId ? { ...r, done: Boolean(input.done) } : r,
    );
  }
  const now = new Date().toISOString();
  if (typeof input.approveAccounts === "boolean") {
    portal.approveAccounts = input.approveAccounts;
    portal.approveAccountsAt = input.approveAccounts ? now : undefined;
  }
  if (typeof input.approveCt600 === "boolean") {
    portal.approveCt600 = input.approveCt600;
    portal.approveCt600At = input.approveCt600 ? now : undefined;
  }
  if (typeof input.approveVat === "boolean") {
    portal.approveVat = input.approveVat;
    portal.approveVatAt = input.approveVat ? now : undefined;
  }

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === client.id);
    if (row) row.deskProfile = { ...(row.deskProfile ?? {}), portal };
    return { ok: true as const };
  }

  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    const next = { ...(client.deskProfile ?? {}), portal };
    const { error } = await supabase
      .from("clients")
      .update({ desk_profile: next, updated_at: new Date().toISOString() })
      .eq("id", client.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) {
    return { ok: false as const, error: "Portal storage is not configured" };
  }
  const { clients } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(clients)
    .set({
      deskProfile: { ...(client.deskProfile ?? {}), portal },
      updatedAt: new Date(),
    })
    .where(eq(clients.id, client.id));
  return { ok: true as const };
}

const PORTAL_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function categoryForPortalRequest(requestId: string): string {
  if (requestId === "bank") return "accounts";
  if (requestId === "payroll") return "payroll";
  if (requestId === "invoices") return "accounts";
  return "general";
}

export async function uploadPortalPaper(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const requestId = String(formData.get("requestId") ?? "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose a file to upload." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false as const, error: "File exceeds 15 MB." };
  }
  if (file.type && !PORTAL_FILE_TYPES.has(file.type)) {
    return {
      ok: false as const,
      error: "Use PDF, JPG, PNG, WebP, CSV, or Excel.",
    };
  }

  const client = await findClientByPortalToken(token);
  if (!client?.deskProfile?.portal) {
    return { ok: false as const, error: "Link not found" };
  }
  const practiceId =
    "practiceId" in client && client.practiceId
      ? String(client.practiceId)
      : null;
  if (!practiceId) return { ok: false as const, error: "Link not found" };

  const docCategory = requestId
    ? categoryForPortalRequest(requestId)
    : "general";
  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
  const contentType = file.type || "application/octet-stream";
  const objectKey = `practices/${practiceId}/clients/${client.id}/portal/${Date.now()}-${filename}`;

  const { isR2Configured, isBlobConfigured, isMemoryStore } = await import(
    "@/lib/env"
  );
  let blobUrl: string;
  if (isR2Configured()) {
    const { uploadToR2 } = await import("@/server/storage/r2");
    const uploaded = await uploadToR2({
      key: objectKey,
      body: Buffer.from(await file.arrayBuffer()),
      contentType,
    });
    blobUrl = uploaded.url;
  } else if (isBlobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(objectKey, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } else if (isMemoryStore()) {
    blobUrl = `data:${contentType};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  } else {
    return {
      ok: false as const,
      error: "Document storage is not configured.",
    };
  }

  const r2Key = isR2Configured() ? objectKey : blobUrl;
  let documentId = "";

  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("client_documents")
      .insert({
        practice_id: practiceId,
        client_id: client.id,
        filename,
        content_type: contentType,
        size_bytes: file.size,
        r2_key: r2Key,
        category: docCategory,
        uploaded_by: "client-portal",
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    documentId = String(data.id);
  } else if (isMemoryStore()) {
    documentId = randomBytes(16).toString("hex");
    const { memoryStore } = await import("@/server/demo/store");
    memoryStore.documents.push({
      id: documentId,
      clientId: client.id,
      practiceId,
      filename,
      contentType,
      sizeBytes: file.size,
      blobUrl,
      category: docCategory,
      uploadedBy: "client-portal",
      createdAt: new Date().toISOString(),
    });
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) {
      return { ok: false as const, error: "Document storage is not configured." };
    }
    const { clientDocuments } = await import("@/server/db/schema");
    const [doc] = await getDb()
      .insert(clientDocuments)
      .values({
        practiceId,
        clientId: client.id,
        filename,
        contentType,
        sizeBytes: file.size,
        blobUrl,
        category: docCategory,
        uploadedBy: "client-portal",
      })
      .returning();
    documentId = doc.id;
  }

  const upload: PortalUpload = {
    filename,
    documentId,
    uploadedAt: new Date().toISOString(),
    requestId: requestId || undefined,
  };
  const portal: PortalRecord = {
    ...client.deskProfile.portal,
    requests: client.deskProfile.portal.requests.map((r) =>
      requestId && r.id === requestId ? { ...r, done: true } : r,
    ),
    uploads: [...(client.deskProfile.portal.uploads ?? []), upload],
  };

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === client.id);
    if (row) row.deskProfile = { ...(row.deskProfile ?? {}), portal };
  } else if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin()
      .from("clients")
      .update({
        desk_profile: { ...(client.deskProfile ?? {}), portal },
        updated_at: new Date().toISOString(),
      })
      .eq("id", client.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (hasDatabase()) {
      const { clients } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      await getDb()
        .update(clients)
        .set({
          deskProfile: { ...(client.deskProfile ?? {}), portal },
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));
    }
  }

  revalidatePath(`/clients/${client.id}/documents`);
  revalidatePath(`/clients/${client.id}/portal`);
  revalidatePath(`/clients/${client.id}/bank`);
  return { ok: true as const, filename, documentId, requestId: requestId || null };
}

export async function sendPortalApprovalPack(input: {
  clientId: string;
  kind: "accounts" | "ct600" | "vat";
  documentId?: string;
  message?: string;
  title?: string;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  let portal = client.deskProfile?.portal;
  if (!portal?.token) {
    portal = await ensurePortal(input.clientId);
  }

  let documentUrl: string | undefined;
  let filename: string | undefined;
  if (input.documentId) {
    const { listClientDocuments } = await import("@/server/actions/documents");
    const docs = await listClientDocuments(input.clientId);
    const doc = docs.find((d) => d.id === input.documentId);
    if (!doc) throw new Error("Choose a document from this client’s file.");
    documentUrl = doc.blobUrl;
    filename = doc.filename;
  }

  const defaults = {
    accounts: "Annual accounts for your approval",
    ct600: "Company Tax Return for your approval",
    vat: "VAT return for your approval",
  } as const;

  const pack: PortalApprovalPack = {
    title: input.title?.trim() || defaults[input.kind],
    message:
      input.message?.trim() ||
      "Please review the attached draft, then tick approval on this page.",
    documentId: input.documentId,
    documentUrl,
    filename,
    sentAt: new Date().toISOString(),
  };

  const nextPortal: PortalRecord = {
    ...portal,
    approvalPacks: {
      ...(portal.approvalPacks ?? {}),
      [input.kind]: pack,
    },
    // Reset approval when a new pack is sent
    ...(input.kind === "accounts"
      ? { approveAccounts: false, approveAccountsAt: undefined }
      : input.kind === "ct600"
        ? { approveCt600: false, approveCt600At: undefined }
        : { approveVat: false, approveVatAt: undefined }),
  };

  const session = await requireSession();
  const accountsApproval =
    input.kind === "accounts"
      ? {
          workStage: "sent_for_approval" as const,
          workLog: pushWorkLog(client.deskProfile, {
            kind: "stage",
            label: WORK_STAGE_LABEL.sent_for_approval,
            detail: pack.title,
            actorId: session.userId,
          }),
        }
      : {};

  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, {
      portal: nextPortal,
      ...accountsApproval,
    }),
  );
  revalidateClient(input.clientId);
  revalidatePath(`/clients/${input.clientId}/accounts-pack`);
  revalidatePath(`/clients/${input.clientId}/corporation-tax`);
  revalidatePath(`/clients/${input.clientId}/vat`);
  return nextPortal;
}

export async function updatePortalRequests(input: {
  clientId: string;
  requests: { id: string; label: string; done: boolean }[];
}) {
  const client = await getClient(input.clientId);
  if (!client?.deskProfile?.portal) throw new Error("Create the client link first");
  const portal: PortalRecord = {
    ...client.deskProfile.portal,
    requests: input.requests.map((r) => ({
      id: r.id,
      label: r.label,
      done: r.done,
    })),
  };
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { portal }),
  );
  revalidateClient(input.clientId);
  return portal;
}

async function persistPortalOnly(
  client: { id: string; deskProfile?: DeskProfile | null; practiceId?: string },
  portal: PortalRecord,
) {
  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === client.id);
    if (row) row.deskProfile = { ...(row.deskProfile ?? {}), portal };
    return;
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    const next = { ...(client.deskProfile ?? {}), portal };
    const { error } = await supabase
      .from("clients")
      .update({ desk_profile: next, updated_at: new Date().toISOString() })
      .eq("id", client.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Portal storage is not configured");
  const { clients } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(clients)
    .set({
      deskProfile: { ...(client.deskProfile ?? {}), portal },
      updatedAt: new Date(),
    })
    .where(eq(clients.id, client.id));
}

/** Accountant: send a HydraSign request to the client portal. */
export async function createPortalSignRequest(input: {
  clientId: string;
  title: string;
  message?: string;
  documentId?: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  let portal = client.deskProfile?.portal;
  if (!portal?.token) portal = await ensurePortal(input.clientId);

  let documentUrl: string | undefined;
  let filename: string | undefined;
  if (input.documentId) {
    const { listClientDocuments } = await import("@/server/actions/documents");
    const docs = await listClientDocuments(input.clientId);
    const doc = docs.find((d) => d.id === input.documentId);
    if (!doc) throw new Error("Choose a document from this client’s file.");
    documentUrl = doc.blobUrl;
    filename = doc.filename;
  }

  const title = input.title.trim();
  if (title.length < 3) throw new Error("Enter a title for the signature request");

  const req: PortalSignRequest = {
    id: crypto.randomUUID(),
    title,
    message:
      input.message?.trim() ||
      "Please review and sign below. Your signature is recorded on this client link.",
    documentId: input.documentId,
    documentUrl,
    filename,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const nextPortal: PortalRecord = {
    ...portal,
    signRequests: [...(portal.signRequests ?? []), req],
  };

  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { portal: nextPortal }),
  );

  const { appendAuditEvent } = await import("@/server/audit/log");
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "portal.sign_request_created",
    entityType: "portal_sign",
    entityId: req.id,
    detail: { title: req.title, filename },
  }).catch(() => undefined);

  // Best-effort email to client contact
  const to = client.contactEmail?.trim();
  if (to) {
    try {
      const { sendTransactionalEmail } = await import(
        "@/server/email/transactional"
      );
      const { getEnv } = await import("@/lib/env");
      const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
      const link = `${appUrl}/portal/${nextPortal.token}`;
      await sendTransactionalEmail({
        to,
        subject: `Please sign: ${req.title}`,
        text: `Hi,\n\nYour accountant has asked you to sign “${req.title}” on HydraTax.\n\nOpen your client link to review and sign:\n${link}\n\n— HydraTax\n`,
        html: `<p>Your accountant has asked you to sign <strong>${req.title}</strong>.</p><p><a href="${link}">Open your client link to sign</a></p>`,
      });
    } catch {
      // non-fatal
    }
  }

  revalidateClient(input.clientId);
  return nextPortal;
}

/** Client: complete a HydraSign request from the public portal. */
export async function completePortalSignRequest(input: {
  token: string;
  signRequestId: string;
  typedName: string;
  signatureDataUrl?: string;
  decline?: boolean;
}) {
  const client = await findClientByPortalToken(input.token);
  if (!client?.deskProfile?.portal) {
    return { ok: false as const, error: "Link not found" };
  }
  const portal = { ...client.deskProfile.portal };
  const list = [...(portal.signRequests ?? [])];
  const idx = list.findIndex((r) => r.id === input.signRequestId);
  if (idx < 0) return { ok: false as const, error: "Signature request not found" };
  const current = list[idx]!;
  if (current.status !== "pending") {
    return { ok: false as const, error: "This request is already closed" };
  }

  const now = new Date().toISOString();
  if (input.decline) {
    list[idx] = {
      ...current,
      status: "declined",
      declinedAt: now,
      typedName: input.typedName.trim() || undefined,
    };
  } else {
    const typed = input.typedName.trim();
    if (typed.length < 2) {
      return { ok: false as const, error: "Type your full name to sign" };
    }
    const sig = input.signatureDataUrl?.trim();
    if (sig && !sig.startsWith("data:image/")) {
      return { ok: false as const, error: "Invalid signature image" };
    }
    if (sig && sig.length > 400_000) {
      return { ok: false as const, error: "Signature image is too large" };
    }
    const { headers } = await import("next/headers");
    const h = await headers();
    list[idx] = {
      ...current,
      status: "signed",
      signedAt: now,
      typedName: typed,
      signerName: typed,
      signatureDataUrl: sig || undefined,
      ip:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        undefined,
      userAgent: h.get("user-agent")?.slice(0, 300) || undefined,
    };
  }

  portal.signRequests = list;
  try {
    await persistPortalOnly(client, portal);
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not save signature",
    };
  }

  const { appendAuditEvent } = await import("@/server/audit/log");
  await appendAuditEvent({
    practiceId:
      "practiceId" in client && client.practiceId
        ? String(client.practiceId)
        : null,
    clientId: client.id,
    actorId: "client-portal",
    action: input.decline ? "portal.sign_declined" : "portal.sign_completed",
    entityType: "portal_sign",
    entityId: input.signRequestId,
    detail: { title: current.title },
  }).catch(() => undefined);

  return { ok: true as const, request: list[idx]! };
}
