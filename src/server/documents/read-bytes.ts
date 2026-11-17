import {
  isMemoryStore,
  isR2Configured,
  isSupabaseConfigured,
} from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";

/**
 * Load raw bytes for a client document (R2 key, public URL, or data: URI).
 */
export async function readClientDocumentBytes(input: {
  clientId: string;
  documentId: string;
}): Promise<{
  bytes: Buffer;
  filename: string;
  contentType: string;
}> {
  const session = await requireSession();
  await getClient(input.clientId);

  let r2Key: string | null = null;
  let filename = "document.pdf";
  let contentType = "application/pdf";

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_documents")
      .select("filename, content_type, r2_key")
      .eq("id", input.documentId)
      .eq("practice_id", session.practiceId)
      .eq("client_id", input.clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Document not found");
    filename = String(data.filename ?? filename);
    contentType = String(data.content_type ?? contentType);
    r2Key = String(data.r2_key ?? "");
  } else if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const doc = memoryStore.documents.find(
      (d) => d.id === input.documentId && d.clientId === input.clientId,
    );
    if (!doc) throw new Error("Document not found");
    filename = doc.filename;
    contentType = doc.contentType;
    r2Key = doc.blobUrl;
  } else {
    throw new Error("Document storage is not configured.");
  }

  if (!r2Key) throw new Error("Document storage key missing");

  if (r2Key.startsWith("data:")) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(r2Key);
    if (!m) throw new Error("Invalid embedded document");
    return {
      bytes: Buffer.from(m[2], "base64"),
      filename,
      contentType: m[1] || contentType,
    };
  }

  if (r2Key.startsWith("http://") || r2Key.startsWith("https://")) {
    const res = await fetch(r2Key);
    if (!res.ok) throw new Error("Could not download document");
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      filename,
      contentType: res.headers.get("content-type") || contentType,
    };
  }

  if (r2Key.startsWith("/api/documents/download")) {
    const u = new URL(r2Key, "http://local");
    const key = u.searchParams.get("key");
    if (!key) throw new Error("Document key missing");
    r2Key = key;
  }

  if (r2Key.startsWith("r2://")) {
    r2Key = r2Key.replace(/^r2:\/\/[^/]+\//, "");
  }

  if (!isR2Configured()) {
    throw new Error("Document storage is not configured.");
  }
  const { getR2Object } = await import("@/server/storage/r2");
  const obj = await getR2Object(r2Key);
  if (!obj.body) throw new Error("Document not found in storage");
  return {
    bytes: obj.body,
    filename,
    contentType: obj.contentType || contentType,
  };
}
