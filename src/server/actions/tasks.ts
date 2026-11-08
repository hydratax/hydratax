"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import type {
  PracticeTask,
  PracticeTaskComment,
  PracticeTaskKind,
} from "@/lib/practice-tasks";
import { ensurePracticeTaskInbox } from "@/server/tasks/inbox";
import { storeClientDocumentBytes } from "@/server/documents/store-bytes";

function mapTaskRow(row: Record<string, unknown>): PracticeTask {
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
    clientName: (row.client_name as string | null) ?? null,
    assigneeUserId: (row.assignee_user_id as string | null) ?? null,
    assigneeName: (row.assignee_name as string | null) ?? null,
    allocatedBy: (row.allocated_by as string | null) ?? null,
    allocatedAt: (row.allocated_at as string | null) ?? null,
    filename: (row.filename as string | null) ?? null,
    contentType: (row.content_type as string | null) ?? null,
    storageKey: (row.storage_key as string | null) ?? null,
    byteSize: (row.byte_size as number | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    commentCount: Number(row.comment_count ?? 0),
  };
}

export async function getPracticeTaskInbox(): Promise<{
  inboxEmail: string;
  inboxKey: string;
}> {
  const session = await requireSession();
  const inbox = await ensurePracticeTaskInbox({
    practiceId: session.practiceId,
    practiceName: session.practiceName,
  });
  return { inboxEmail: inbox.inboxEmail, inboxKey: inbox.inboxKey };
}

export async function listPracticeTasks(
  kind?: PracticeTaskKind,
): Promise<PracticeTask[]> {
  const session = await requireSession();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const clients = new Map(
      memoryStore.clients
        .filter((c) => c.practiceId === session.practiceId)
        .map((c) => [c.id, c.name]),
    );
    const members = new Map(
      memoryStore.teamMembers
        .filter((m) => m.practiceId === session.practiceId)
        .map((m) => [m.id, m.name]),
    );
    // Also allow assignee by user id string for memory
    return memoryStore.practiceTasks
      .filter(
        (t) =>
          t.practiceId === session.practiceId &&
          (!kind || t.kind === kind),
      )
      .map((t) => ({
        ...t,
        clientName: t.clientId ? clients.get(t.clientId) ?? null : null,
        assigneeName: t.assigneeUserId
          ? members.get(t.assigneeUserId) ?? t.assigneeUserId
          : null,
        commentCount: memoryStore.practiceTaskComments.filter(
          (c) => c.taskId === t.id,
        ).length,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  if (!isSupabaseConfigured()) return [];

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  let q = supabase
    .from("practice_tasks")
    .select(
      "*, clients(name), practice_task_comments(count)",
    )
    .eq("practice_id", session.practiceId)
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const assigneeIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.assignee_user_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];
  const nameByUser = new Map<string, string>();
  if (assigneeIds.length) {
    const { data: members } = await supabase
      .from("practice_members")
      .select("user_id, display_name, email")
      .eq("practice_id", session.practiceId)
      .in("user_id", assigneeIds);
    for (const m of members ?? []) {
      nameByUser.set(
        m.user_id as string,
        (m.display_name as string) ||
          (m.email as string) ||
          "Team member",
      );
    }
  }

  return (data ?? []).map((row) => {
    const clientRel = row.clients as
      | { name: string }
      | { name: string }[]
      | null;
    const clientName = Array.isArray(clientRel)
      ? clientRel[0]?.name
      : clientRel?.name;
    const comments = row.practice_task_comments as
      | { count: number }[]
      | null;
    const count = Array.isArray(comments) ? Number(comments[0]?.count ?? 0) : 0;
    return mapTaskRow({
      ...row,
      client_name: clientName ?? null,
      assignee_name: row.assignee_user_id
        ? nameByUser.get(row.assignee_user_id as string) ?? null
        : null,
      comment_count: count,
    });
  });
}

/** Team members available for query allocation (any desk user). */
export async function listTaskAssignees(): Promise<
  Array<{ userId: string; name: string; email: string }>
> {
  const session = await requireSession();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const members = memoryStore.teamMembers.filter(
      (m) => m.practiceId === session.practiceId && m.active,
    );
    const list = members.map((m) => ({
      userId: m.id,
      name: m.name,
      email: m.email,
    }));
    // Always include the current user
    if (!list.some((m) => m.userId === session.userId)) {
      list.unshift({
        userId: session.userId,
        name: session.email ?? "You",
        email: session.email ?? "",
      });
    }
    return list;
  }

  if (!isSupabaseConfigured()) return [];
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practice_members")
    .select("user_id, display_name, email")
    .eq("practice_id", session.practiceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    userId: m.user_id as string,
    name:
      (m.display_name as string) ||
      (m.email as string) ||
      "Team member",
    email: (m.email as string) ?? "",
  }));
}

const allocateDocumentSchema = z.object({
  taskId: z.string().min(1),
  clientId: z.string().min(1),
});

export async function allocateDocumentToClient(
  input: z.infer<typeof allocateDocumentSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    throw new Error("Read-only users cannot allocate tasks.");
  }
  const data = allocateDocumentSchema.parse(input);
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const task = memoryStore.practiceTasks.find(
      (t) =>
        t.id === data.taskId &&
        t.practiceId === session.practiceId &&
        t.kind === "document",
    );
    if (!task) throw new Error("Document task not found.");
    const client = memoryStore.clients.find(
      (c) => c.id === data.clientId && c.practiceId === session.practiceId,
    );
    if (!client) throw new Error("Client not found.");

    if (task.storageKey && task.filename) {
      let bytes: Uint8Array;
      if (task.storageKey.startsWith("data:")) {
        const b64 = task.storageKey.split(",")[1] ?? "";
        bytes = new Uint8Array(Buffer.from(b64, "base64"));
      } else {
        bytes = new TextEncoder().encode(task.body ?? task.title);
      }
      await storeClientDocumentBytes({
        practiceId: session.practiceId,
        clientId: data.clientId,
        filename: task.filename,
        contentType: task.contentType ?? "application/octet-stream",
        bytes,
        category: "tasks_inbox",
        uploadedBy: session.userId,
        folder: "tasks",
      });
    }

    task.clientId = data.clientId;
    task.status = "allocated";
    task.allocatedBy = session.userId;
    task.allocatedAt = now;
    task.updatedAt = now;
    revalidatePath("/tasks");
    return;
  }

  if (!isSupabaseConfigured()) throw new Error("Tasks require Supabase.");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: task, error: taskErr } = await supabase
    .from("practice_tasks")
    .select("*")
    .eq("id", data.taskId)
    .eq("practice_id", session.practiceId)
    .eq("kind", "document")
    .maybeSingle();
  if (taskErr) throw new Error(taskErr.message);
  if (!task) throw new Error("Document task not found.");

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("id", data.clientId)
    .eq("practice_id", session.practiceId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client) throw new Error("Client not found.");

  // Copy into the client's document store when we have a fetchable URL
  if (task.storage_key && task.filename) {
    try {
      const key = task.storage_key as string;
      let bytes: Uint8Array | null = null;
      if (key.startsWith("http://") || key.startsWith("https://")) {
        const res = await fetch(key);
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
      } else if (key.startsWith("r2://") || !key.includes("://")) {
        try {
          const { getR2Object } = await import("@/server/storage/r2");
          const objectKey = key.startsWith("r2://")
            ? key.replace(/^r2:\/\/[^/]+\//, "")
            : key;
          const obj = await getR2Object(objectKey);
          if (obj.body) bytes = new Uint8Array(obj.body);
        } catch {
          /* leave task linked without re-copy if download fails */
        }
      }
      if (bytes) {
        await storeClientDocumentBytes({
          practiceId: session.practiceId,
          clientId: data.clientId,
          filename: task.filename as string,
          contentType:
            (task.content_type as string) || "application/octet-stream",
          bytes,
          category: "tasks_inbox",
          uploadedBy: session.userId,
          folder: "tasks",
        });
      }
    } catch {
      /* allocation still proceeds with client link */
    }
  }

  const { error: updErr } = await supabase
    .from("practice_tasks")
    .update({
      client_id: data.clientId,
      status: "allocated",
      allocated_by: session.userId,
      allocated_at: now,
      updated_at: now,
    })
    .eq("id", data.taskId)
    .eq("practice_id", session.practiceId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/tasks");
  revalidatePath(`/clients/${data.clientId}/documents`);
}

const allocateQuerySchema = z.object({
  taskId: z.string().min(1),
  assigneeUserId: z.string().min(1),
});

export async function allocateQueryToMember(
  input: z.infer<typeof allocateQuerySchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    throw new Error("Read-only users cannot allocate tasks.");
  }
  const data = allocateQuerySchema.parse(input);
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const task = memoryStore.practiceTasks.find(
      (t) =>
        t.id === data.taskId &&
        t.practiceId === session.practiceId &&
        t.kind === "query",
    );
    if (!task) throw new Error("Query not found.");
    task.assigneeUserId = data.assigneeUserId;
    task.status = "allocated";
    task.allocatedBy = session.userId;
    task.allocatedAt = now;
    task.updatedAt = now;
    revalidatePath("/tasks");
    return;
  }

  if (!isSupabaseConfigured()) throw new Error("Tasks require Supabase.");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("practice_members")
    .select("user_id")
    .eq("practice_id", session.practiceId)
    .eq("user_id", data.assigneeUserId)
    .maybeSingle();
  if (!member) throw new Error("That person is not on your practice team.");

  const { error } = await supabase
    .from("practice_tasks")
    .update({
      assignee_user_id: data.assigneeUserId,
      status: "allocated",
      allocated_by: session.userId,
      allocated_at: now,
      updated_at: now,
    })
    .eq("id", data.taskId)
    .eq("practice_id", session.practiceId)
    .eq("kind", "query");
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

const commentSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1).max(8000),
});

export async function addTaskComment(input: z.infer<typeof commentSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") {
    throw new Error("Read-only users cannot comment.");
  }
  const data = commentSchema.parse(input);
  const body = data.body.trim();
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const task = memoryStore.practiceTasks.find(
      (t) => t.id === data.taskId && t.practiceId === session.practiceId,
    );
    if (!task) throw new Error("Task not found.");
    if (task.kind !== "query") {
      throw new Error("Comments are only on queries.");
    }
    memoryStore.practiceTaskComments.push({
      id: crypto.randomUUID(),
      practiceId: session.practiceId,
      taskId: data.taskId,
      authorUserId: session.userId,
      authorName: session.email ?? "You",
      body,
      createdAt: now,
    });
    revalidatePath("/tasks");
    return;
  }

  if (!isSupabaseConfigured()) throw new Error("Tasks require Supabase.");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("practice_tasks")
    .select("id, kind")
    .eq("id", data.taskId)
    .eq("practice_id", session.practiceId)
    .maybeSingle();
  if (!task) throw new Error("Task not found.");
  if (task.kind !== "query") throw new Error("Comments are only on queries.");

  const { error } = await supabase.from("practice_task_comments").insert({
    practice_id: session.practiceId,
    task_id: data.taskId,
    author_user_id: session.userId,
    body,
    created_at: now,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/tasks");
}

export async function listTaskComments(
  taskId: string,
): Promise<PracticeTaskComment[]> {
  const session = await requireSession();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    return memoryStore.practiceTaskComments
      .filter(
        (c) => c.taskId === taskId && c.practiceId === session.practiceId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  if (!isSupabaseConfigured()) return [];
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("practice_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("practice_id", session.practiceId)
    .maybeSingle();
  if (!task) return [];

  const { data, error } = await supabase
    .from("practice_task_comments")
    .select("id, practice_id, task_id, author_user_id, body, created_at")
    .eq("task_id", taskId)
    .eq("practice_id", session.practiceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const authorIds = [
    ...new Set((data ?? []).map((c) => c.author_user_id as string)),
  ];
  const nameByUser = new Map<string, string>();
  if (authorIds.length) {
    const { data: members } = await supabase
      .from("practice_members")
      .select("user_id, display_name, email")
      .eq("practice_id", session.practiceId)
      .in("user_id", authorIds);
    for (const m of members ?? []) {
      nameByUser.set(
        m.user_id as string,
        (m.display_name as string) ||
          (m.email as string) ||
          "Team member",
      );
    }
  }

  return (data ?? []).map((c) => ({
    id: c.id as string,
    practiceId: c.practice_id as string,
    taskId: c.task_id as string,
    authorUserId: c.author_user_id as string,
    authorName: nameByUser.get(c.author_user_id as string) ?? "Team member",
    body: c.body as string,
    createdAt: c.created_at as string,
  }));
}

const markDoneSchema = z.object({
  taskId: z.string().min(1),
});

export async function markTaskDone(input: z.infer<typeof markDoneSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") {
    throw new Error("Read-only users cannot update tasks.");
  }
  const data = markDoneSchema.parse(input);
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const task = memoryStore.practiceTasks.find(
      (t) => t.id === data.taskId && t.practiceId === session.practiceId,
    );
    if (!task) throw new Error("Task not found.");
    task.status = "done";
    task.updatedAt = now;
    revalidatePath("/tasks");
    return;
  }

  if (!isSupabaseConfigured()) throw new Error("Tasks require Supabase.");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("practice_tasks")
    .update({ status: "done", updated_at: now })
    .eq("id", data.taskId)
    .eq("practice_id", session.practiceId);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}
