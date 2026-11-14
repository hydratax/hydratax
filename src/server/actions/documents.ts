"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inspectUpload } from "@/lib/file-types";
import {
  isMemoryStore,
  isR2Configured,
  isSupabaseConfigured,
} from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { memoryStore, type MemoryDocument } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import { uploadToR2 } from "@/server/storage/r2";
import { tryGetDb } from "@/server/db";

const MAX_BYTES = 15 * 1024 * 1024;

const categorySchema = z
  .string()
  .min(1)
  .refine(
    (v) =>
      [
        "general",
        "accounts",
        "vat",
        "payroll",
        "corporation_tax",
        "self_assessment",
        "companies_house",
      ].includes(v) ||
      /^sa:[^:]+:(invoice|receipt|p60|bank_statement|books|other)$/.test(v) ||
      // Prior-year filed SA100 / SA302: sa_filed:2024-25:return[:taxpayerId]
      /^sa_filed:\d{4}-\d{2}:(return|sa302)(?::[^:]+)?$/.test(v),
    { message: "Invalid document category" },
  );

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

  const db = tryGetDb();
  if (!db) return [];
  const { clientDocuments } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
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
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectUpload({
    filename: file.name,
    declaredType: file.type,
    bytes: fileBytes,
  });
  if (!inspected.allowed) {
    throw new Error(
      "Unsupported file type. Use PDF, JPG, PNG, WebP, CSV, Excel, Word or text.",
    );
  }

  const filename = inspected.filename;
  const contentType = inspected.contentType;
  let blobUrl: string;
  const objectKey = `practices/${session.practiceId}/clients/${clientId}/${Date.now()}-${filename}`;

  if (isR2Configured()) {
    const uploaded = await uploadToR2({
      key: objectKey,
      body: Buffer.from(fileBytes),
      contentType,
    });
    blobUrl = uploaded.url;
  } else if (isMemoryStore()) {
    blobUrl = `data:${contentType};base64,${Buffer.from(fileBytes).toString("base64")}`;
  } else {
    // The former public Vercel Blob fallback exposed client documents to
    // anyone with the URL and has been removed.
    throw new Error(
      "Document storage is not configured. Set Cloudflare R2 keys.",
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
    revalidatePath(`/clients/${clientId}/self-assessment`);
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
    revalidatePath(`/clients/${clientId}/self-assessment`);
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
  revalidatePath(`/clients/${clientId}/self-assessment`);
  return doc;
}

export async function updateClientDocumentCategory(input: {
  clientId: string;
  documentId: string;
  category: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  await getClient(input.clientId);
  const category = categorySchema.parse(input.category);

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_documents")
      .update({ category })
      .eq("id", input.documentId)
      .eq("practice_id", session.practiceId)
      .eq("client_id", input.clientId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath(`/clients/${input.clientId}/self-assessment`);
    revalidatePath(`/clients/${input.clientId}/documents`);
    return {
      id: data.id as string,
      category: data.category as string,
      filename: data.filename as string,
      blobUrl: (data.r2_key as string)?.startsWith("http")
        ? (data.r2_key as string)
        : `/api/documents/download?key=${encodeURIComponent(data.r2_key as string)}`,
    };
  }

  if (isMemoryStore()) {
    const doc = memoryStore.documents.find(
      (d) => d.id === input.documentId && d.clientId === input.clientId,
    );
    if (!doc) throw new Error("Document not found");
    doc.category = category;
    revalidatePath(`/clients/${input.clientId}/self-assessment`);
    return {
      id: doc.id,
      category: doc.category,
      filename: doc.filename,
      blobUrl: doc.blobUrl,
    };
  }

  throw new Error("Could not update document category");
}
