import { createHash } from "crypto";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";

export type AuditInput = {
  practiceId?: string | null;
  clientId?: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  payloadHash?: string | null;
  hmrcStatusCode?: number | null;
  hmrcCorrelationId?: string | null;
  detail?: unknown;
};

let lastHash = "GENESIS";

function computeEventHash(input: AuditInput, prevHash: string, createdAt: string) {
  const material = JSON.stringify({
    practiceId: input.practiceId ?? null,
    clientId: input.clientId ?? null,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payloadHash: input.payloadHash ?? null,
    hmrcStatusCode: input.hmrcStatusCode ?? null,
    hmrcCorrelationId: input.hmrcCorrelationId ?? null,
    detail: input.detail ?? null,
    prevHash,
    createdAt,
  });
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Append-only audit logger. No update/delete APIs are exposed.
 */
export async function appendAuditEvent(input: AuditInput): Promise<{ id: string; eventHash: string }> {
  const createdAt = new Date().toISOString();
  const prevHash = lastHash;
  const eventHash = computeEventHash(input, prevHash, createdAt);
  const id = crypto.randomUUID();

  if (isDemoMode()) {
    demoStore.auditEvents.push({
      id,
      practiceId: input.practiceId ?? null,
      clientId: input.clientId ?? null,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      payloadHash: input.payloadHash ?? null,
      hmrcStatusCode: input.hmrcStatusCode ?? null,
      hmrcCorrelationId: input.hmrcCorrelationId ?? null,
      detail: input.detail ?? null,
      prevHash,
      eventHash,
      createdAt,
    });
    lastHash = eventHash;
    return { id, eventHash };
  }

  // Prefer Supabase when configured (production Netlify has no DATABASE_URL).
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { error } = await supabase.from("audit_events").insert({
        id,
        practice_id: input.practiceId ?? null,
        client_id: input.clientId ?? null,
        actor_id: input.actorId,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        payload_hash: input.payloadHash ?? null,
        hmrc_status_code: input.hmrcStatusCode ?? null,
        hmrc_correlation_id: input.hmrcCorrelationId ?? null,
        detail: input.detail ?? null,
        prev_hash: prevHash,
        event_hash: eventHash,
        created_at: createdAt,
      });
      if (error) {
        console.warn("[audit] supabase insert failed", error.message);
      } else {
        lastHash = eventHash;
      }
      return { id, eventHash };
    } catch (err) {
      console.warn("[audit] supabase insert error", err);
      return { id, eventHash };
    }
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) {
    console.warn("[audit] skipped — no database configured");
    return { id, eventHash };
  }

  const { auditEvents } = await import("@/server/db/schema");
  const db = getDb();
  await db.insert(auditEvents).values({
    id,
    practiceId: input.practiceId ?? null,
    clientId: input.clientId ?? null,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payloadHash: input.payloadHash ?? null,
    hmrcStatusCode: input.hmrcStatusCode ?? null,
    hmrcCorrelationId: input.hmrcCorrelationId ?? null,
    detail: input.detail ?? null,
    prevHash,
    eventHash,
  });
  lastHash = eventHash;
  return { id, eventHash };
}

export async function listAuditEvents(opts: {
  clientId?: string;
  practiceId?: string;
  limit?: number;
}) {
  if (isDemoMode()) {
    return demoStore.auditEvents
      .filter((e) => {
        if (opts.clientId && e.clientId !== opts.clientId) return false;
        if (opts.practiceId && e.practiceId !== opts.practiceId) return false;
        return true;
      })
      .slice()
      .reverse()
      .slice(0, opts.limit ?? 50);
  }

  const { getDb } = await import("@/server/db");
  const { auditEvents } = await import("@/server/db/schema");
  const { desc, eq, and } = await import("drizzle-orm");
  const db = getDb();
  const conditions = [];
  if (opts.clientId) conditions.push(eq(auditEvents.clientId, opts.clientId));
  if (opts.practiceId) conditions.push(eq(auditEvents.practiceId, opts.practiceId));

  return db
    .select()
    .from(auditEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(opts.limit ?? 50);
}
