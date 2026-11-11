import { getDb } from "@/server/db";
import { practiceActivityLogs } from "@/server/db/schema";

export type ActivityLogInput = {
  practiceId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  summary: string;
  entityType?: string | null;
  entityId?: string | null;
  clientId?: string | null;
  meta?: Record<string, unknown>;
};

/** Fire-and-forget practice activity row (never throws to callers). */
export async function recordPracticeActivity(
  input: ActivityLogInput,
): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db.insert(practiceActivityLogs).values({
      practiceId: input.practiceId,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      summary: input.summary,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      meta: input.meta ?? {},
    });
  } catch {
    // Activity logging must not break the primary action.
  }
}
