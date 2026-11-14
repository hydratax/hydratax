import {
  isDemoMode,
  isMemoryStore,
  isSupabaseConfigured,
} from "@/lib/env";

/**
 * Look up which practice owns a Companies House filing request.
 * Returns `null` when no such request exists. Used by /api/checkout so a
 * caller cannot start (or attach) payment for a request that is not real or
 * not theirs.
 */
export async function findChRequestPracticeId(
  requestId: string,
): Promise<string | null> {
  if (isDemoMode() || isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    const row = memoryStore.chRequests.find((r) => r.id === requestId);
    return row ? String(row.practiceId) : null;
  }

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data, error } = await getSupabaseAdmin()
      .from("companies_house_requests")
      .select("practice_id")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !data) return null;
    return String(data.practice_id);
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return null;
  const { companiesHouseRequests } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select({ practiceId: companiesHouseRequests.practiceId })
    .from(companiesHouseRequests)
    .where(eq(companiesHouseRequests.id, requestId))
    .limit(1);
  return rows[0]?.practiceId ? String(rows[0].practiceId) : null;
}
