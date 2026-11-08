import {
  parseTaskInboxKeyFromAddresses,
  taskInboxEmail,
  taskInboxKeyFromPractice,
} from "@/lib/practice-task-email";
import type { PracticeTask } from "@/lib/practice-tasks";
import {
  isBlobConfigured,
  isDemoMode,
  isMemoryStore,
  isR2Configured,
  isSupabaseConfigured,
} from "@/lib/env";

export type ResolvedTaskInbox = {
  practiceId: string;
  practiceName: string;
  inboxKey: string;
  inboxEmail: string;
};

async function persistTaskInboxKey(
  practiceId: string,
  inboxKey: string,
): Promise<void> {
  if (isDemoMode() || isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    if (memoryStore.practice.id === practiceId) {
      memoryStore.practice.taskInboxKey = inboxKey;
    }
    return;
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin()
      .from("practices")
      .update({ task_inbox_key: inboxKey })
      .eq("id", practiceId);
    if (error) throw new Error(error.message);
  }
}

/** Ensure the practice has a dedicated Tasks email address. */
export async function ensurePracticeTaskInbox(input: {
  practiceId: string;
  practiceName: string;
}): Promise<ResolvedTaskInbox> {
  let existing: string | null = null;

  if (isDemoMode() || isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    if (memoryStore.practice.id === input.practiceId) {
      existing = memoryStore.practice.taskInboxKey ?? null;
    }
  } else if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data } = await getSupabaseAdmin()
      .from("practices")
      .select("task_inbox_key")
      .eq("id", input.practiceId)
      .maybeSingle();
    existing = (data?.task_inbox_key as string | null) ?? null;
  }

  const inboxKey =
    existing?.trim() ||
    taskInboxKeyFromPractice(input.practiceName, input.practiceId);

  if (!existing) {
    await persistTaskInboxKey(input.practiceId, inboxKey);
  }

  return {
    practiceId: input.practiceId,
    practiceName: input.practiceName,
    inboxKey,
    inboxEmail: taskInboxEmail(inboxKey),
  };
}

export async function resolvePracticeFromTaskAddresses(
  addresses: Array<string | null | undefined>,
): Promise<ResolvedTaskInbox | null> {
  const key = parseTaskInboxKeyFromAddresses(addresses);
  if (!key) return null;

  if (isDemoMode() || isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const storeKey = memoryStore.practice.taskInboxKey;
    if (storeKey && storeKey.toLowerCase() === key) {
      return {
        practiceId: memoryStore.practice.id,
        practiceName: memoryStore.practice.name,
        inboxKey: storeKey,
        inboxEmail: taskInboxEmail(storeKey),
      };
    }
    return null;
  }

  if (!isSupabaseConfigured()) return null;
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { data, error } = await getSupabaseAdmin()
    .from("practices")
    .select("id, name, task_inbox_key")
    .eq("task_inbox_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id || !data.task_inbox_key) return null;

  return {
    practiceId: data.id as string,
    practiceName: (data.name as string) ?? "Practice",
    inboxKey: data.task_inbox_key as string,
    inboxEmail: taskInboxEmail(data.task_inbox_key as string),
  };
}

async function storeTaskAttachmentBytes(input: {
  practiceId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<{ storageKey: string; byteSize: number }> {
  const filename = input.filename.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
  const objectKey = `practices/${input.practiceId}/tasks/${Date.now()}-${filename}`;

  if (isR2Configured()) {
    const { uploadToR2 } = await import("@/server/storage/r2");
    await uploadToR2({
      key: objectKey,
      body: Buffer.from(input.bytes),
      contentType: input.contentType,
    });
    return { storageKey: objectKey, byteSize: input.bytes.byteLength };
  }
  if (isBlobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(objectKey, Buffer.from(input.bytes), {
      access: "public",
      contentType: input.contentType,
      addRandomSuffix: true,
    });
    return { storageKey: blob.url, byteSize: input.bytes.byteLength };
  }
  if (isMemoryStore() || isDemoMode()) {
    const dataUrl = `data:${input.contentType};base64,${Buffer.from(input.bytes).toString("base64")}`;
    return { storageKey: dataUrl, byteSize: input.bytes.byteLength };
  }
  throw new Error("Document storage is not configured for Tasks.");
}

function rowToTask(row: Record<string, unknown>): PracticeTask {
  return {
    id: String(row.id),
    practiceId: String(row.practice_id),
    kind: row.kind as PracticeTask["kind"],
    status: row.status as PracticeTask["status"],
    title: String(row.title),
    body: (row.body as string | null) ?? null,
    fromAddress: (row.from_address as string | null) ?? null,
    source: (row.source as PracticeTask["source"]) ?? "email",
    sourceEmailId: (row.source_email_id as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    assigneeUserId: (row.assignee_user_id as string | null) ?? null,
    allocatedBy: (row.allocated_by as string | null) ?? null,
    allocatedAt: (row.allocated_at as string | null) ?? null,
    filename: (row.filename as string | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    storageKey: (row.storage_key as string | null) ?? null,
    byteSize: (row.byte_size as number | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Ingest a forwarded email into Documents and/or Queries. */
export async function storeInboundTaskEmail(input: {
  practice: ResolvedTaskInbox;
  fromAddress: string;
  subject?: string | null;
  bodyText?: string | null;
  sourceEmailId?: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }>;
}): Promise<{ documents: PracticeTask[]; queries: PracticeTask[] }> {
  const now = new Date().toISOString();
  const subject =
    input.subject?.trim() ||
    (input.attachments.length
      ? `Document from ${input.fromAddress}`
      : `Query from ${input.fromAddress}`);
  const body = input.bodyText?.trim() || null;
  const documents: PracticeTask[] = [];
  const queries: PracticeTask[] = [];

  const insertTask = async (
    partial: Omit<
      PracticeTask,
      "id" | "createdAt" | "updatedAt" | "commentCount" | "clientName" | "assigneeName"
    > & { id?: string },
  ): Promise<PracticeTask> => {
    const id = partial.id ?? crypto.randomUUID();
    const task: PracticeTask = {
      ...partial,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (isDemoMode() || isMemoryStore()) {
      const { memoryStore } = await import("@/server/demo/store");
      memoryStore.practiceTasks.push(task);
      return task;
    }

    if (!isSupabaseConfigured()) {
      throw new Error("Tasks require Supabase.");
    }
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("practice_tasks")
      .insert({
        id,
        practice_id: task.practiceId,
        kind: task.kind,
        status: task.status,
        title: task.title,
        body: task.body,
        from_address: task.fromAddress,
        source: task.source,
        source_email_id: task.sourceEmailId,
        client_id: task.clientId,
        assignee_user_id: task.assigneeUserId,
        filename: task.filename,
        content_type: task.contentType,
        storage_key: task.storageKey,
        byte_size: task.byteSize,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToTask(data as Record<string, unknown>);
  };

  for (const att of input.attachments) {
    const stored = await storeTaskAttachmentBytes({
      practiceId: input.practice.practiceId,
      filename: att.filename,
      contentType: att.contentType,
      bytes: att.bytes,
    });
    const doc = await insertTask({
      practiceId: input.practice.practiceId,
      kind: "document",
      status: "unallocated",
      title: att.filename || subject,
      body: body ?? subject,
      fromAddress: input.fromAddress,
      source: "email",
      sourceEmailId: input.sourceEmailId ?? null,
      clientId: null,
      assigneeUserId: null,
      allocatedBy: null,
      allocatedAt: null,
      filename: att.filename,
      contentType: att.contentType,
      storageKey: stored.storageKey,
      byteSize: stored.byteSize,
      createdBy: null,
    });
    documents.push(doc);
  }

  // Body-only (or subject-only) emails become Queries; also create a query when
  // there is meaningful body text alongside attachments.
  const shouldQuery =
    input.attachments.length === 0 ||
    Boolean(body && body.length >= 20 && body !== subject);

  if (shouldQuery) {
    const query = await insertTask({
      practiceId: input.practice.practiceId,
      kind: "query",
      status: "unallocated",
      title: subject.slice(0, 180),
      body: body ?? subject,
      fromAddress: input.fromAddress,
      source: "email",
      sourceEmailId: input.sourceEmailId ?? null,
      clientId: null,
      assigneeUserId: null,
      allocatedBy: null,
      allocatedAt: null,
      filename: null,
      contentType: null,
      storageKey: null,
      byteSize: null,
      createdBy: null,
    });
    queries.push(query);
  }

  return { documents, queries };
}
