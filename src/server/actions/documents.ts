"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  isBlobConfigured,
  isMemoryStore,
  isR2Configured,
  isSupabaseConfigured,
} from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { memoryStore, type MemoryDocument } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import { uploadToR2 } from "@/server/storage/r2";

const MAX_BYTES = 15 * 1024 * 1024;

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const categorySchema = z.enum([
  "general",
  "accounts",
  "vat",
  "payroll",
  "corporation_tax",
  "self_assessment",
  "companies_house",
]);

export async function listClientDocuments(clientId: string) {
  const session = await requireSession();
  await getClient(clientId);

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_documents")
      .select("*")
      .eq("practice_id", session.practiceId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      clientId: (row.client_id as string) ?? clientId,
      practiceId: row.practice_id as string,
      filename: row.filename as string,
      contentType: row.content_type as string,
      sizeBytes: row.size_bytes as number,
      blobUrl: (row.r2_key as string)?.startsWith("http")
        ? (row.r2_key as string)
        : `/api/documents/download?key=${encodeURIComponent(row.r2_key as string)}`,
      category: row.category as string,
      uploadedBy: row.uploaded_by as string,
      createdAt: row.created_at as string,
    }));
  }

  if (isMemoryStore()) {
    return memoryStore.documents.filter((d) => d.clientId === clientId);
  }

  const { getDb } = await import("@/server/db");
  const { clientDocuments } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(clientDocuments)
    .where(eq(clientDocuments.clientId, clientId))
    .orderBy(desc(clientDocuments.createdAt));
}

export async function uploadClientDocument(formData: FormData) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const clientId = String(formData.get("clientId") ?? "");
  const category = categorySchema.parse(
    String(formData.get("category") ?? "general"),
  );
  const file = formData.get("file");

  if (!clientId || !(file instanceof File)) {
    throw new Error("Missing file or client");
  }

  await getClient(clientId);

  if (file.size > MAX_BYTES) {
    throw new Error("File exceeds 15 MB limit");
  }
  if (file.type && !allowedTypes.has(file.type)) {
    throw new Error(
      "Unsupported file type. Use PDF, JPG, PNG, WebP, CSV, or Excel.",
    );
  }

  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
  const contentType = file.type || "application/octet-stream";
  let blobUrl: string;
  const objectKey = `practices/${session.practiceId}/clients/${clientId}/${Date.now()}-${filename}`;

  if (isR2Configured()) {
    const buf = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToR2({
      key: objectKey,
      body: buf,
      contentType,
    });
    blobUrl = uploaded.url;
  } else if (isBlobConfigured()) {
    const blob = await put(objectKey, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    blobUrl = blob.url;
  } else if (isMemoryStore()) {
    const buf = Buffer.from(await file.arrayBuffer());
    blobUrl = `data:${contentType};base64,${buf.toString("base64")}`;
  } else {
    throw new Error(
      "Document storage is not configured. Set Cloudflare R2 keys (preferred) or BLOB_READ_WRITE_TOKEN.",
    );
  }

  const now = new Date().toISOString();
  const r2Key = isR2Configured() ? objectKey : blobUrl;

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_documents")
      .insert({
        practice_id: session.practiceId,
        client_id: clientId,
        filename,
        content_type: contentType,
        size_bytes: file.size,
        r2_key: r2Key,
        category,
        uploaded_by: session.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "document.upload",
      entityType: "document",
      entityId: data.id as string,
      detail: { filename, category, sizeBytes: file.size },
    });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/documents`);
    return {
      id: data.id as string,
      clientId,
      practiceId: session.practiceId,
      filename,
      contentType,
      sizeBytes: file.size,
      blobUrl: isR2Configured()
        ? `/api/documents/download?key=${encodeURIComponent(objectKey)}`
        : blobUrl,
      category,
      uploadedBy: session.userId,
      createdAt: (data.created_at as string) ?? now,
    };
  }

  if (isMemoryStore()) {
    const doc: MemoryDocument = {
      id: crypto.randomUUID(),
      clientId,
      practiceId: session.practiceId,
      filename,
      contentType,
      sizeBytes: file.size,
      blobUrl: isR2Configured()
        ? `/api/documents/download?key=${encodeURIComponent(objectKey)}`
        : blobUrl,
      category,
      uploadedBy: session.userId,
      createdAt: now,
    };
    memoryStore.documents.push(doc);
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "document.upload",
      entityType: "document",
      entityId: doc.id,
      detail: { filename, category, sizeBytes: file.size },
    });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/documents`);
    return doc;
  }

  const { getDb } = await import("@/server/db");
  const { clientDocuments } = await import("@/server/db/schema");
  const [doc] = await getDb()
    .insert(clientDocuments)
    .values({
      practiceId: session.practiceId,
      clientId,
      filename,
      contentType,
      sizeBytes: file.size,
      blobUrl,
      category,
      uploadedBy: session.userId,
    })
    .returning();

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "document.upload",
    entityType: "document",
    entityId: doc.id,
    detail: { filename, category, sizeBytes: file.size },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/documents`);
  return doc;
}
