import {
  isMemoryStore,
  isR2Configured,
  isSupabaseConfigured,
} from "@/lib/env";
import {
  isRasterImageType,
  pdfFilenameFromImage,
  rasterImageToPdf,
} from "@/lib/image-to-pdf";
import { inspectUpload } from "@/lib/file-types";

export type StoredClientDocument = {
  documentId: string;
  blobUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * Persist raw bytes into client_documents (R2 / Blob / memory / drizzle).
 * When `asPdfIfImage` is true, JPEG/PNG are wrapped into a single-page PDF.
 */
export async function storeClientDocumentBytes(input: {
  practiceId: string;
  clientId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  category: string;
  uploadedBy: string;
  folder?: string;
  asPdfIfImage?: boolean;
}): Promise<StoredClientDocument> {
  // Never trust the sender's declared type/extension: allow-list + sniff magic
  // bytes; anything else is stored as opaque application/octet-stream (.bin).
  const inspected = inspectUpload({
    filename: input.filename,
    declaredType: input.contentType,
    bytes: input.bytes,
  });
  if (!inspected.allowed && inspected.reason === "magic_mismatch") {
    throw new Error(
      "File content does not match its declared type and was rejected.",
    );
  }
  if (!inspected.allowed && inspected.reason === "empty") {
    throw new Error("File is empty.");
  }
  let filename = inspected.filename;
  let contentType: string = inspected.contentType;
  let bytes = input.bytes;

  if (input.asPdfIfImage && isRasterImageType(contentType)) {
    const pdf = await rasterImageToPdf({ bytes, contentType });
    if (pdf) {
      bytes = pdf;
      contentType = "application/pdf";
      filename = pdfFilenameFromImage(filename);
    }
  }

  const folder = input.folder ?? "docs";
  const objectKey = `practices/${input.practiceId}/clients/${input.clientId}/${folder}/${Date.now()}-${filename}`;

  let blobUrl: string;
  if (isR2Configured()) {
    const { uploadToR2 } = await import("@/server/storage/r2");
    const uploaded = await uploadToR2({
      key: objectKey,
      body: Buffer.from(bytes),
      contentType,
    });
    blobUrl = uploaded.url;
  } else if (isMemoryStore()) {
    // Dev/demo only. The former `access: "public"` Vercel Blob fallback made
    // client documents world-readable and has been removed.
    blobUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } else {
    throw new Error("Document storage is not configured.");
  }

  const r2Key = isR2Configured() ? objectKey : blobUrl;
  const sizeBytes = bytes.byteLength;
  let documentId = "";

  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("client_documents")
      .insert({
        practice_id: input.practiceId,
        client_id: input.clientId,
        filename,
        content_type: contentType,
        size_bytes: sizeBytes,
        r2_key: r2Key,
        category: input.category,
        uploaded_by: input.uploadedBy,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    documentId = String(data.id);
  } else if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    documentId = crypto.randomUUID();
    memoryStore.documents.push({
      id: documentId,
      clientId: input.clientId,
      practiceId: input.practiceId,
      filename,
      contentType,
      sizeBytes,
      blobUrl,
      category: input.category,
      uploadedBy: input.uploadedBy,
      createdAt: new Date().toISOString(),
    });
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) throw new Error("Document storage is not configured.");
    const { clientDocuments } = await import("@/server/db/schema");
    const [doc] = await getDb()
      .insert(clientDocuments)
      .values({
        practiceId: input.practiceId,
        clientId: input.clientId,
        filename,
        contentType,
        sizeBytes,
        blobUrl,
        category: input.category,
        uploadedBy: input.uploadedBy,
      })
      .returning();
    documentId = doc.id;
  }

  return { documentId, blobUrl, filename, contentType, sizeBytes };
}
