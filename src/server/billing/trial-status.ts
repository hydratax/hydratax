import { isWithinTrialWindow, planKeyHasPracticeTrial } from "@/lib/trial";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";

export type PracticeTrialStatus = {
  onTrial: boolean;
  trialEndsAt: string | null;
  planKey: string | null;
};

/**
 * Whether this practice is inside a Practice-desk free trial window.
 * Used to waive Hydra filing fees and unlock the desk.
 */
export async function getPracticeTrialStatus(
  practiceId: string,
): Promise<PracticeTrialStatus> {
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: rows } = await supabase
        .from("practice_subscriptions")
        .select("plan_key, status, trial_ends_at")
        .eq("practice_id", practiceId)
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false })
        .limit(20);

      for (const row of rows ?? []) {
        if (!planKeyHasPracticeTrial(row.plan_key ?? "")) continue;
        const ends = (row.trial_ends_at as string | null) ?? null;
        // Legacy rows without trial_ends_at: treat trialing as on trial
        if (row.status === "trialing" && !ends) {
          return {
            onTrial: true,
            trialEndsAt: null,
            planKey: row.plan_key,
          };
        }
        if (isWithinTrialWindow(ends)) {
          return {
            onTrial: true,
            trialEndsAt: ends,
            planKey: row.plan_key,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (isMemoryStore()) {
    const subs = memoryStore.subscriptions
      .filter(
        (s) =>
          s.practiceId === practiceId &&
          (s.status === "active" || s.status === "trialing") &&
          planKeyHasPracticeTrial(s.planKey),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const s of subs) {
      if (s.status === "trialing" && !s.trialEndsAt) {
        return { onTrial: true, trialEndsAt: null, planKey: s.planKey };
      }
      if (isWithinTrialWindow(s.trialEndsAt ?? null)) {
        return {
          onTrial: true,
          trialEndsAt: s.trialEndsAt ?? null,
          planKey: s.planKey,
        };
      }
    }
    return { onTrial: false, trialEndsAt: null, planKey: null };
  }

  try {
    const { ensureTrialSchema } = await import("@/server/db/ensure-trial-schema");
    await ensureTrialSchema();

    const { getDb } = await import("@/server/db");
    const { practiceSubscriptions } = await import("@/server/db/schema");
    const { and, desc, eq, or } = await import("drizzle-orm");
    const rows = await getDb()
      .select()
      .from(practiceSubscriptions)
      .where(
        and(
          eq(practiceSubscriptions.practiceId, practiceId),
          or(
            eq(practiceSubscriptions.status, "active"),
            eq(practiceSubscriptions.status, "trialing"),
          ),
        ),
      )
      .orderBy(desc(practiceSubscriptions.createdAt))
      .limit(20);

    for (const row of rows) {
      if (!planKeyHasPracticeTrial(row.planKey)) continue;
      const ends =
        row.trialEndsAt?.toISOString?.() ??
        (typeof row.trialEndsAt === "string" ? row.trialEndsAt : null);
      if (row.status === "trialing" && !ends) {
        return { onTrial: true, trialEndsAt: null, planKey: row.planKey };
      }
      if (isWithinTrialWindow(ends)) {
        return {
          onTrial: true,
          trialEndsAt: ends,
          planKey: row.planKey,
        };
      }
    }
  } catch {
    /* schema may lag — treat as not on trial */
  }

  return { onTrial: false, trialEndsAt: null, planKey: null };
}
