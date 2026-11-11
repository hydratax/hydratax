"use server";

import { desc, eq } from "drizzle-orm";
import { requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  auditEvents,
  clients,
  supportTickets,
} from "@/server/db/schema";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";

export type PracticeLogRow = {
  id: string;
  at: string;
  source: string;
  actor: string | null;
  summary: string;
  detail?: string | null;
  clientName?: string | null;
};

function assertPracticeAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only practice owners and admins can view logs.");
  }
}

function summariseAction(action: string, entityType: string, detail: unknown) {
  const d =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : null;
  const name = typeof d?.name === "string" ? d.name : null;
  const subject = typeof d?.subject === "string" ? d.subject : null;
  if (action === "client.create") {
    return name ? `Client created: ${name}` : "Client created";
  }
  if (action.includes("email") || entityType === "email") {
    return subject ? `Email: ${subject}` : `Email · ${action}`;
  }
  if (action.includes("letter") || entityType === "letter") {
    return subject ? `Letter: ${subject}` : `Letter · ${action}`;
  }
  if (name) return `${action} · ${name}`;
  return `${action} (${entityType})`;
}

/** Unified admin activity feed — audit trail + support tickets. */
export async function listPracticeLogs(limit = 250): Promise<PracticeLogRow[]> {
  const session = await requireSession();
  assertPracticeAdmin(session.role);

  const rows: PracticeLogRow[] = [];
  const clientNames = new Map<string, string>();

  if (isDemoMode()) {
    const { demoStore } = await import("@/server/demo/store");
    for (const c of demoStore.clients) {
      if (c.practiceId === session.practiceId) clientNames.set(c.id, c.name);
    }
    for (const e of [...demoStore.auditEvents].reverse()) {
      if (e.practiceId !== session.practiceId) continue;
      const clientId = typeof e.clientId === "string" ? e.clientId : null;
      rows.push({
        id: `audit-${String(e.id)}`,
        at: String(e.createdAt ?? new Date().toISOString()),
        source: String(e.entityType ?? "activity"),
        actor: typeof e.actorId === "string" ? e.actorId : null,
        summary: summariseAction(
          String(e.action ?? "event"),
          String(e.entityType ?? "unknown"),
          e.detail,
        ),
        detail: String(e.action ?? ""),
        clientName: clientId ? clientNames.get(clientId) ?? null : null,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, name")
      .eq("practice_id", session.practiceId);
    for (const c of clientRows ?? []) {
      clientNames.set(c.id as string, c.name as string);
    }
    const { data: events } = await supabase
      .from("audit_events")
      .select(
        "id, created_at, actor_id, action, entity_type, client_id, detail",
      )
      .eq("practice_id", session.practiceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const e of events ?? []) {
      const clientId = e.client_id as string | null;
      rows.push({
        id: `audit-${e.id}`,
        at: String(e.created_at),
        source: String(e.entity_type ?? "activity"),
        actor: (e.actor_id as string) ?? null,
        summary: summariseAction(
          String(e.action),
          String(e.entity_type),
          e.detail,
        ),
        detail: String(e.action),
        clientName: clientId ? clientNames.get(clientId) ?? null : null,
      });
    }
    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id, ticket_ref, subject, status, created_at")
      .eq("practice_id", session.practiceId)
      .order("created_at", { ascending: false })
      .limit(80);
    for (const t of tickets ?? []) {
      rows.push({
        id: `ticket-${t.id}`,
        at: String(t.created_at),
        source: "ticket",
        actor: null,
        summary: `Ticket ${t.ticket_ref}: ${t.subject}`,
        detail: String(t.status),
      });
    }
    rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return rows.slice(0, limit);
  }

  const db = getDb();
  if (!db) return [];

  const named = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.practiceId, session.practiceId));
  for (const c of named) clientNames.set(c.id, c.name);

  const events = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.practiceId, session.practiceId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  for (const e of events) {
    rows.push({
      id: `audit-${e.id}`,
      at: e.createdAt.toISOString(),
      source: e.entityType,
      actor: e.actorId,
      summary: summariseAction(e.action, e.entityType, e.detail),
      detail: e.action,
      clientName: e.clientId ? clientNames.get(e.clientId) ?? null : null,
    });
  }

  try {
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.practiceId, session.practiceId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(80);
    for (const t of tickets) {
      rows.push({
        id: `ticket-${t.id}`,
        at: t.createdAt.toISOString(),
        source: "ticket",
        actor: null,
        summary: `Ticket ${t.ticketRef}: ${t.subject}`,
        detail: t.status,
      });
    }
  } catch {
    // Table may not exist until migration is applied.
  }

  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return rows.slice(0, limit);
}

export async function listSupportTickets() {
  const session = await requireSession();

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("practice_id", session.practiceId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []).map((t) => ({
      id: t.id as string,
      ticketRef: t.ticket_ref as string,
      subject: t.subject as string,
      message: t.message as string,
      helpTopic: (t.help_topic as string) ?? null,
      module: (t.module as string) ?? null,
      status: t.status as string,
      createdAt: new Date(t.created_at as string),
    }));
  }

  const db = getDb();
  if (!db) return [];
  try {
    return db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.practiceId, session.practiceId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(100);
  } catch {
    return [];
  }
}
