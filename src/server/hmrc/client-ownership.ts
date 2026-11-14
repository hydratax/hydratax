import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * True only when `clientId` is a client of `practiceId`. HMRC tokens are keyed
 * by client id alone, so every token read/write must prove practice ownership
 * first — otherwise a user could connect/refresh/read another practice's link.
 */
export async function clientBelongsToPractice(
  clientId: string,
  practiceId: string,
): Promise<boolean> {
  if (!isUuid(clientId) || !practiceId) return false;

  if (isDemoMode()) {
    return demoStore.clients.some(
      (c) =>
        c.id === clientId &&
        (c.practiceId === practiceId || c.practiceId === demoStore.practice.id),
    );
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("practice_id", practiceId)
        .maybeSingle();
      if (data?.id) return true;
    } catch {
      /* fall through to Drizzle */
    }
  }

  try {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) return false;
    const { clients } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const rows = await getDb()
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.practiceId, practiceId)))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function assertClientInPractice(
  clientId: string,
  practiceId: string,
): Promise<void> {
  if (!(await clientBelongsToPractice(clientId, practiceId))) {
    throw new Error("Client not found");
  }
}
