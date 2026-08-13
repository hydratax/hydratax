import { practiceTrialEndsAt } from "@/lib/trial";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";

const DEFAULT_TRIAL_PLAN = "practice:Practice";

/**
 * Seed a Practice desk trialing subscription if this practice has never had one.
 * Idempotent — safe to call on signup / first session.
 * When Supabase is configured, always persist there (even if MEMORY_STORE is on).
 */
export async function startPracticeTrial(
  practiceId: string,
  planKey: string = DEFAULT_TRIAL_PLAN,
): Promise<{ trialEndsAt: string; created: boolean }> {
  const ends = practiceTrialEndsAt().toISOString();

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: rows } = await supabase
        .from("practice_subscriptions")
        .select("id, trial_ends_at, status, plan_key")
        .eq("practice_id", practiceId)
        .in("status", ["active", "trialing"])
        .like("plan_key", "practice:%")
        .limit(1);

      if (rows?.[0]) {
        if (isMemoryStore()) {
          mirrorMemoryTrial(
            practiceId,
            rows[0].plan_key ?? planKey,
            (rows[0].trial_ends_at as string | null) ?? ends,
          );
        }
        return {
          trialEndsAt: (rows[0].trial_ends_at as string | null) ?? ends,
          created: false,
        };
      }

      let error = (
        await supabase.from("practice_subscriptions").insert({
          practice_id: practiceId,
          plan_key: planKey,
          status: "trialing",
          trial_ends_at: ends,
        })
      ).error;

      // Column may be missing before migration — retry without it
      if (error && /trial_ends_at/i.test(error.message)) {
        error = (
          await supabase.from("practice_subscriptions").insert({
            practice_id: practiceId,
            plan_key: planKey,
            status: "trialing",
          })
        ).error;
      }

      if (error) {
        console.error("[trial] supabase insert failed", error.message);
      } else {
        if (isMemoryStore()) {
          mirrorMemoryTrial(practiceId, planKey, ends);
        }
        return { trialEndsAt: ends, created: true };
      }
    } catch (err) {
      console.error("[trial] supabase path failed", err);
    }
  }

  if (isMemoryStore()) {
    const existing = memoryStore.subscriptions.find(
      (s) =>
        s.practiceId === practiceId &&
        (s.status === "trialing" || s.status === "active") &&
        s.planKey.startsWith("practice:"),
    );
    if (existing) {
      return {
        trialEndsAt: existing.trialEndsAt ?? ends,
        created: false,
      };
    }
    mirrorMemoryTrial(practiceId, planKey, ends);
    return { trialEndsAt: ends, created: true };
  }

  try {
    const { ensureTrialSchema } = await import("@/server/db/ensure-trial-schema");
    await ensureTrialSchema();

    const { getDb } = await import("@/server/db");
    const { practiceSubscriptions } = await import("@/server/db/schema");
    const { and, eq, or, like } = await import("drizzle-orm");

    const existing = await getDb()
      .select()
      .from(practiceSubscriptions)
      .where(
        and(
          eq(practiceSubscriptions.practiceId, practiceId),
          or(
            eq(practiceSubscriptions.status, "active"),
            eq(practiceSubscriptions.status, "trialing"),
          ),
          like(practiceSubscriptions.planKey, "practice:%"),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const endsExisting =
        existing[0].trialEndsAt?.toISOString?.() ??
        (typeof existing[0].trialEndsAt === "string"
          ? existing[0].trialEndsAt
          : ends);
      return { trialEndsAt: endsExisting, created: false };
    }

    await getDb().insert(practiceSubscriptions).values({
      practiceId,
      planKey,
      status: "trialing",
      trialEndsAt: new Date(ends),
    });
    return { trialEndsAt: ends, created: true };
  } catch (err) {
    console.error("[trial] drizzle startPracticeTrial failed", err);
    return { trialEndsAt: ends, created: false };
  }
}

function mirrorMemoryTrial(
  practiceId: string,
  planKey: string,
  trialEndsAt: string,
) {
  if (
    memoryStore.subscriptions.some(
      (s) =>
        s.practiceId === practiceId &&
        (s.status === "trialing" || s.status === "active") &&
        s.planKey.startsWith("practice:"),
    )
  ) {
    return;
  }
  memoryStore.subscriptions.push({
    id: crypto.randomUUID(),
    practiceId,
    planKey,
    status: "trialing",
    stripeSessionId: null,
    trialEndsAt,
    createdAt: new Date().toISOString(),
  });
}
