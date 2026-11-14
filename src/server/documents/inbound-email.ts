import {
  documentInboxEmail,
  documentInboxKeyFromName,
  parseDocumentInboxKeyFromAddresses,
} from "@/lib/client-document-email";
import type { DeskProfile } from "@/lib/desk-profile";
import {
  isDemoMode,
  isMemoryStore,
  isSupabaseConfigured,
} from "@/lib/env";
import { inspectUpload } from "@/lib/file-types";
import { storeClientDocumentBytes } from "@/server/documents/store-bytes";

const MAX_INBOUND_ATTACHMENTS = 10;

export type ResolvedDocumentInbox = {
  clientId: string;
  practiceId: string;
  clientName: string;
  inboxKey: string;
  inboxEmail: string;
};

type ClientRow = {
  id: string;
  practiceId: string;
  name: string;
  deskProfile: DeskProfile | null;
};

async function listAllClientsForInbox(): Promise<ClientRow[]> {
  if (isDemoMode() || isMemoryStore()) {
    const { demoStore } = await import("@/server/demo/store");
    return demoStore.clients.map((c) => ({
      id: c.id,
      practiceId: c.practiceId,
      name: c.name,
      deskProfile: (c.deskProfile as DeskProfile | null) ?? null,
    }));
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("clients")
      .select("id, practice_id, name, desk_profile");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      practiceId: row.practice_id as string,
      name: row.name as string,
      deskProfile: (row.desk_profile as DeskProfile | null) ?? null,
    }));
  }
  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return [];
  const { clients } = await import("@/server/db/schema");
  const rows = await getDb().select().from(clients);
  return rows.map((row) => ({
    id: row.id,
    practiceId: row.practiceId,
    name: row.name,
    deskProfile: (row.deskProfile as DeskProfile | null) ?? null,
  }));
}

async function persistInboxKey(
  client: ClientRow,
  inboxKey: string,
): Promise<void> {
  const profile: DeskProfile = {
    ...(client.deskProfile ?? {}),
    documentInboxKey: inboxKey,
  };
  const now = new Date().toISOString();

  if (isDemoMode() || isMemoryStore()) {
    const { demoStore } = await import("@/server/demo/store");
    const row = demoStore.clients.find((c) => c.id === client.id);
    if (row) {
      row.deskProfile = profile;
      row.updatedAt = now;
    }
    return;
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin()
      .from("clients")
      .update({ desk_profile: profile, updated_at: now })
      .eq("id", client.id)
      .eq("practice_id", client.practiceId);
    if (error) throw new Error(error.message);
    return;
  }
  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return;
  const { clients } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(eq(clients.id, client.id));
}

function uniqueInboxKey(base: string, taken: Set<string>, clientId: string): string {
  if (!taken.has(base)) return base;
  return `${base}-${clientId.slice(0, 6)}`;
}

/** Assign (or return) the stable document inbox address for a client. */
export async function ensureClientDocumentInbox(input: {
  clientId: string;
  practiceId: string;
  clientName: string;
  deskProfile?: DeskProfile | null;
}): Promise<ResolvedDocumentInbox> {
  const existing = input.deskProfile?.documentInboxKey?.trim().toLowerCase();
  if (existing) {
    return {
      clientId: input.clientId,
      practiceId: input.practiceId,
      clientName: input.clientName,
      inboxKey: existing,
      inboxEmail: documentInboxEmail(existing),
    };
  }

  const all = await listAllClientsForInbox();
  const taken = new Set(
    all
      .map((c) => c.deskProfile?.documentInboxKey?.trim().toLowerCase())
      .filter((k): k is string => Boolean(k)),
  );
  const base = documentInboxKeyFromName(input.clientName);
  const inboxKey = uniqueInboxKey(base, taken, input.clientId);
  const client: ClientRow = {
    id: input.clientId,
    practiceId: input.practiceId,
    name: input.clientName,
    deskProfile: input.deskProfile ?? null,
  };
  await persistInboxKey(client, inboxKey);
  return {
    clientId: input.clientId,
    practiceId: input.practiceId,
    clientName: input.clientName,
    inboxKey,
    inboxEmail: documentInboxEmail(inboxKey),
  };
}

export async function findClientByDocumentInboxKey(
  inboxKey: string,
): Promise<ResolvedDocumentInbox | null> {
  const key = inboxKey.trim().toLowerCase();
  if (!key) return null;
  const all = await listAllClientsForInbox();

  let match = all.find(
    (c) => c.deskProfile?.documentInboxKey?.trim().toLowerCase() === key,
  );

  if (!match) {
    // Lazy match by derived name for clients not yet assigned a key.
    match =
      all.find((c) => documentInboxKeyFromName(c.name) === key) ?? undefined;
    if (match) {
      await persistInboxKey(match, key);
    }
  }

  if (!match) return null;
  const resolvedKey =
    match.deskProfile?.documentInboxKey?.trim().toLowerCase() || key;
  return {
    clientId: match.id,
    practiceId: match.practiceId,
    clientName: match.name,
    inboxKey: resolvedKey,
    inboxEmail: documentInboxEmail(resolvedKey),
  };
}

export async function resolveClientFromInboundAddresses(
  addresses: Array<string | null | undefined>,
): Promise<ResolvedDocumentInbox | null> {
  const key = parseDocumentInboxKeyFromAddresses(addresses);
  if (!key) return null;
  return findClientByDocumentInboxKey(key);
}

export async function storeInboundEmailAttachments(input: {
  client: ResolvedDocumentInbox;
  fromAddress: string;
  subject?: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }>;
}): Promise<{ stored: StoredMeta[]; skipped: number }> {
  const stored: StoredMeta[] = [];
  let skipped = 0;
  for (const att of input.attachments.slice(0, MAX_INBOUND_ATTACHMENTS)) {
    if (!att.bytes.byteLength) continue;
    if (att.bytes.byteLength > 15 * 1024 * 1024) {
      skipped++;
      continue;
    }
    // Only allow-listed document types whose bytes match their declared type
    // are filed; html/svg/js/etc. from senders are dropped, never stored.
    const inspected = inspectUpload({
      filename: att.filename || "attachment.bin",
      declaredType: att.contentType,
      bytes: att.bytes,
    });
    if (!inspected.allowed) {
      skipped++;
      continue;
    }
    const result = await storeClientDocumentBytes({
      practiceId: input.client.practiceId,
      clientId: input.client.clientId,
      filename: inspected.filename,
      contentType: inspected.contentType,
      bytes: att.bytes,
      category: "general",
      uploadedBy: "email-inbound",
      folder: "email-inbound",
      asPdfIfImage: true,
    });
    stored.push({
      documentId: result.documentId,
      filename: result.filename,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
    });
  }

  try {
    const { appendAuditEvent } = await import("@/server/audit/log");
    await appendAuditEvent({
      practiceId: input.client.practiceId,
      clientId: input.client.clientId,
      actorId: "email-inbound",
      action: "document.email_inbound",
      entityType: "document",
      entityId: stored[0]?.documentId,
      detail: {
        from: input.fromAddress,
        subject: input.subject ?? null,
        inbox: input.client.inboxEmail,
        files: stored.map((s) => s.filename),
      },
    });
  } catch {
    /* audit is best-effort */
  }

  return { stored, skipped };
}

type StoredMeta = {
  documentId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};
