/**
 * Account erasure (UK GDPR Art 17) for the controller-side account data.
 *
 * DESIGN
 * ------
 * 1. Request stage (`prepareAccountErasure`) — reversible:
 *      - classifies the user's practices (sole member / leave only / blocked)
 *      - sets Stripe subscriptions of practices that would be erased to
 *        cancel at period end (recorded so a cancellation can restore them)
 *      - writes `account_deletion_requests` (pending, with a hashed cancel token)
 * 2. Execution stage (`executeAccountErasure`) — irreversible, idempotent:
 *      - erases every sole-member practice (clients, desk tables, D1, R2)
 *      - detaches / anonymises the user's remaining personal data
 *      - deletes the auth user last (so a failure can be retried)
 *    Runs immediately when the user chose "immediate" (sole owner, explicit
 *    confirmation) or when the user only needs to LEAVE shared practices; for
 *    sole owners the default is a 14-day grace period after which the cron
 *    job `runRetentionJobs()` executes it.
 *
 * Statutory records are NOT silently deleted: billing records and the
 * pseudonymous submission audit trail are retained per retention-policy.ts.
 *
 * SECURITY: every function takes `userId` from the verified session only.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RETENTION_DAYS } from "@/lib/retention-policy";
import {
  classifyPracticeForUserErasure,
  deletionDueAt,
  PrivacyAuthError,
  type MemberRow,
  type PracticeErasureClass,
} from "@/server/privacy/authz";
import { purgeClientStores } from "@/server/privacy/client-purge";
import {
  failedSteps,
  privacyAdminClient,
  runStep,
  type StepResult,
} from "@/server/privacy/db";
import { deleteR2Objects } from "@/server/privacy/r2-delete";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function subjectRef(email: string | null | undefined): string {
  return sha256((email ?? "").trim().toLowerCase());
}

/** Cancel token format: `<requestId>.<random>`; only the hash is stored. */
export function newCancelToken(requestId: string) {
  const secret = randomBytes(24).toString("hex");
  return { token: `${requestId}.${secret}`, hash: sha256(secret) };
}

export function verifyCancelToken(
  token: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false;
  const secret = token.split(".")[1] ?? "";
  if (!secret) return false;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PracticePlanEntry = {
  practiceId: string;
  practiceName: string;
  classification: PracticeErasureClass;
};

export type ErasurePlan = {
  practices: PracticePlanEntry[];
  /** Practices that would be erased entirely (user is the only member). */
  erasePracticeIds: string[];
  blocked: PracticePlanEntry[];
};

export async function buildErasurePlan(
  admin: SupabaseClient,
  userId: string,
): Promise<ErasurePlan> {
  const { data: mine, error } = await admin
    .from("practice_members")
    .select("practice_id, practices(name)")
    .eq("user_id", userId);
  if (error) throw new Error("Could not read your practice memberships.");

  const practices: PracticePlanEntry[] = [];
  for (const row of mine ?? []) {
    const practiceId = row.practice_id as string;
    const p = row.practices as { name?: string } | { name?: string }[] | null;
    const practiceName = (Array.isArray(p) ? p[0]?.name : p?.name) ?? "Practice";
    const { data: members } = await admin
      .from("practice_members")
      .select("user_id, role")
      .eq("practice_id", practiceId);
    const rows: MemberRow[] = (members ?? []).map((m) => ({
      userId: m.user_id as string,
      role: m.role as string,
    }));
    practices.push({
      practiceId,
      practiceName,
      classification: classifyPracticeForUserErasure(rows, userId),
    });
  }
  return {
    practices,
    erasePracticeIds: practices
      .filter((p) => p.classification === "sole_member")
      .map((p) => p.practiceId),
    blocked: practices.filter(
      (p) => p.classification === "blocked_transfer_ownership",
    ),
  };
}

// --- Stripe -----------------------------------------------------------------

export type StripeChange = {
  localId: string;
  stripeSubscriptionId: string;
  previousStatus: string;
};

/** Cancel at period end for practices that will be erased. Reversible. */
export async function cancelStripeAtPeriodEnd(
  admin: SupabaseClient,
  practiceIds: string[],
): Promise<{ changes: StripeChange[]; steps: StepResult[] }> {
  const changes: StripeChange[] = [];
  const steps: StepResult[] = [];
  if (practiceIds.length === 0) return { changes, steps };

  const { data: subs } = await admin
    .from("practice_subscriptions")
    .select("id, stripe_subscription_id, status")
    .in("practice_id", practiceIds)
    .in("status", ["active", "trialing"]);

  let stripe: import("stripe").default | null = null;
  try {
    const { getStripe } = await import("@/server/stripe/client");
    stripe = getStripe();
  } catch {
    stripe = null;
  }

  for (const sub of subs ?? []) {
    const stripeId = sub.stripe_subscription_id as string | null;
    if (stripe && stripeId) {
      try {
        await stripe.subscriptions.update(stripeId, { cancel_at_period_end: true });
        steps.push({ step: "stripe.cancel_at_period_end", ok: true });
      } catch (err) {
        steps.push({
          step: "stripe.cancel_at_period_end",
          ok: false,
          error: (err instanceof Error ? err.message : "stripe error").slice(0, 160),
        });
        continue;
      }
    }
    // Local status is left untouched: access continues to period end and the
    // Stripe webhook records the cancellation itself.
    changes.push({
      localId: sub.id as string,
      stripeSubscriptionId: stripeId ?? "",
      previousStatus: (sub.status as string) ?? "active",
    });
  }
  return { changes, steps };
}

export async function restoreStripeSubscriptions(
  _admin: SupabaseClient,
  changes: StripeChange[],
): Promise<void> {
  if (changes.length === 0) return;
  let stripe: import("stripe").default | null = null;
  try {
    const { getStripe } = await import("@/server/stripe/client");
    stripe = getStripe();
  } catch {
    stripe = null;
  }
  for (const c of changes) {
    if (stripe && c.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(c.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      } catch (err) {
        console.warn(
          "[privacy] stripe restore failed:",
          err instanceof Error ? err.message : "unknown",
        );
      }
    }
  }
}

// --- Practice erasure -------------------------------------------------------

/** Erase one practice and all of its clients. Caller proved sole membership. */
export async function erasePracticeData(
  admin: SupabaseClient,
  practiceId: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];

  const { data: clients } = await admin
    .from("clients")
    .select("id")
    .eq("practice_id", practiceId);
  for (const c of clients ?? []) {
    const steps = await purgeClientStores(c.id as string, practiceId);
    results.push(...steps.filter((s) => !s.ok));
  }

  // Practice-level files without a client (R2 keys on any remaining rows).
  try {
    const { data } = await admin
      .from("client_documents")
      .select("r2_key")
      .eq("practice_id", practiceId)
      .limit(100000);
    await deleteR2Objects((data ?? []).map((r) => r.r2_key));
    const { data: tasks } = await admin
      .from("practice_tasks")
      .select("storage_key")
      .eq("practice_id", practiceId);
    await deleteR2Objects((tasks ?? []).map((r) => r.storage_key));
    results.push({ step: "r2.practice", ok: true });
  } catch (err) {
    results.push({
      step: "r2.practice",
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }

  results.push(
    await runStep("client_documents(practice)", () =>
      admin
        .from("client_documents")
        .delete({ count: "exact" })
        .eq("practice_id", practiceId),
    ),
  );

  // Deleting the practice cascades members, clients, subscriptions, tasks,
  // activity logs, tickets, invites, invoices, templates, etc.
  results.push(
    await runStep("practices", () =>
      admin.from("practices").delete({ count: "exact" }).eq("id", practiceId),
    ),
  );
  return results;
}

// --- User-level erasure -----------------------------------------------------

async function anonymiseFeatureData(
  admin: SupabaseClient,
  userId: string,
): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  steps.push(
    await runStep("feature_requests.anonymise", () =>
      admin
        .from("feature_requests")
        .update({
          author_name: "Former user",
          author_email: null,
          author_user_id: null,
        })
        .eq("author_user_id", userId),
    ),
  );

  // Re-key votes so counts are unchanged but the vote is unlinkable.
  try {
    const { data } = await admin
      .from("feature_votes")
      .select("id")
      .eq("voter_key", `user:${userId}`);
    for (const v of data ?? []) {
      await admin
        .from("feature_votes")
        .update({ voter_key: `erased:${randomUUID()}` })
        .eq("id", v.id as string);
    }
    steps.push({ step: "feature_votes.rekey", ok: true, count: data?.length ?? 0 });
  } catch {
    steps.push({ step: "feature_votes.rekey", ok: true, skipped: true });
  }

  // Same for the Drizzle/Neon copy, when present.
  try {
    const { hasDatabase, getDb } = await import("@/server/db");
    if (hasDatabase()) {
      const { featureRequests, featureVotes } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      await db
        .update(featureRequests)
        .set({ authorName: "Former user", authorEmail: null, authorUserId: null })
        .where(eq(featureRequests.authorUserId, userId));
      const votes = await db
        .select({ id: featureVotes.id })
        .from(featureVotes)
        .where(eq(featureVotes.voterKey, `user:${userId}`));
      for (const v of votes) {
        await db
          .update(featureVotes)
          .set({ voterKey: `erased:${randomUUID()}` })
          .where(eq(featureVotes.id, v.id));
      }
      steps.push({ step: "neon.feature_data", ok: true });
    }
  } catch (err) {
    steps.push({
      step: "neon.feature_data",
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
  }
  return steps;
}

export type ErasureExecution = {
  steps: StepResult[];
  authDeleted: boolean;
  failed: StepResult[];
};

export async function executeAccountErasure(opts: {
  userId: string;
  email: string | null;
  /** Practices to erase entirely (re-verified here as sole-member). */
  erasePracticeIds: string[];
}): Promise<ErasureExecution> {
  const admin = privacyAdminClient();
  if (!admin) throw new Error("Account erasure needs Supabase service credentials.");
  const { userId } = opts;
  const email = opts.email?.trim().toLowerCase() ?? null;
  const steps: StepResult[] = [];

  // Re-verify at execution time (someone may have joined during the grace period).
  const plan = await buildErasurePlan(admin, userId);
  if (plan.blocked.length > 0) {
    throw new PrivacyAuthError(
      "A practice now has other members — transfer ownership or remove them before deleting your account.",
    );
  }
  const toErase = opts.erasePracticeIds.filter((id) =>
    plan.erasePracticeIds.includes(id),
  );
  for (const practiceId of toErase) {
    steps.push(...(await erasePracticeData(admin, practiceId)));
  }

  // Detach the user from columns whose FK has no ON DELETE action (would block
  // deletion of the auth user) and from free-text author fields.
  for (const [table, col] of [
    ["client_documents", "uploaded_by"],
    ["client_invoices", "created_by"],
    ["invoice_line_templates", "created_by"],
    ["practice_time_entries", "created_by"],
    ["practice_tasks", "created_by"],
    ["practice_tasks", "assignee_user_id"],
    ["practice_tasks", "allocated_by"],
    ["support_tickets", "raised_by"],
    ["practice_team_invites", "invited_by"],
    ["client_email_logs", "sent_by"],
  ] as const) {
    steps.push(
      await runStep(`${table}.${col}`, () =>
        admin.from(table).update({ [col]: null }).eq(col, userId),
      ),
    );
  }
  steps.push(
    await runStep("practice_activity_logs.anonymise", () =>
      admin
        .from("practice_activity_logs")
        .update({ actor_email: null, actor_user_id: null })
        .eq("actor_user_id", userId),
    ),
  );
  steps.push(...(await anonymiseFeatureData(admin, userId)));

  // Personal records keyed to the user.
  for (const [table, col] of [
    ["mfa_challenges", "user_id"],
    ["user_mfa_settings", "user_id"],
    ["email_preferences", "user_id"],
    ["user_gateway_credentials", "user_id"],
    ["practice_members", "user_id"],
    ["profiles", "id"],
  ] as const) {
    steps.push(
      await runStep(`${table}.delete`, () =>
        admin.from(table).delete({ count: "exact" }).eq(col, userId),
      ),
    );
  }
  if (email) {
    steps.push(
      await runStep("practice_team_invites.by_email", () =>
        admin
          .from("practice_team_invites")
          .delete({ count: "exact" })
          .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)),
      ),
    );
  }

  // Auth user last: if anything above failed hard we can safely retry.
  let authDeleted = false;
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr && !/not found/i.test(delErr.message)) {
    steps.push({
      step: "auth.users.delete",
      ok: false,
      error: delErr.message.slice(0, 200),
    });
  } else {
    authDeleted = true;
    steps.push({ step: "auth.users.delete", ok: true });
  }

  return { steps, authDeleted, failed: failedSteps(steps) };
}

export const DELETION_GRACE_DAYS = RETENTION_DAYS.accountDeletionGraceDays;

export function scheduledFor(now = new Date()): Date {
  return deletionDueAt(now, DELETION_GRACE_DAYS);
}

/** Compact, personal-data-free summary stored on the request row. */
export function summariseSteps(steps: StepResult[]) {
  return {
    total: steps.length,
    failed: steps.filter((s) => !s.ok).map((s) => ({ step: s.step, error: s.error })),
    skipped: steps.filter((s) => s.skipped).length,
  };
}
