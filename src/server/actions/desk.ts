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
  type PortalRecord,
  type PortalUpload,
} from "@/lib/desk-profile";
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
  if (typeof input.approveAccounts === "boolean") {
    portal.approveAccounts = input.approveAccounts;
  }
  if (typeof input.approveCt600 === "boolean") {
    portal.approveCt600 = input.approveCt600;
  }
  if (typeof input.approveVat === "boolean") {
    portal.approveVat = input.approveVat;
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

export async function uploadPortalPaper(formData: FormData) {
  const token = String(formData.get("token") ?? "");
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
        category: "general",
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
      category: "general",
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
        category: "general",
        uploadedBy: "client-portal",
      })
      .returning();
    documentId = doc.id;
  }

  const upload: PortalUpload = {
    filename,
    documentId,
    uploadedAt: new Date().toISOString(),
  };
  const portal: PortalRecord = {
    ...client.deskProfile.portal,
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
  return { ok: true as const, filename };
}
