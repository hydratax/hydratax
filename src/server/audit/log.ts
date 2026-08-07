import { createHash } from "crypto";
import { isDemoMode } from "@/lib/env";
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

  const { getDb } = await import("@/server/db");
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
