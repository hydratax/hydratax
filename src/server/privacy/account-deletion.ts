/**
 * Orchestration for account deletion requests: schedule / execute / cancel,
 * plus the DSAR register. All inputs identify the subject by the verified
 * session user id (or, for the e-mailed cancel link, by an unguessable
 * single-purpose token whose hash is stored).
 */

import {
  buildErasurePlan,
  cancelStripeAtPeriodEnd,
  executeAccountErasure,
  newCancelToken,
  restoreStripeSubscriptions,
  scheduledFor,
  subjectRef,
  summariseSteps,
  verifyCancelToken,
  type ErasurePlan,
  type StripeChange,
} from "@/server/privacy/user-erasure";
import { PrivacyAuthError } from "@/server/privacy/authz";
import { privacyAdminClient } from "@/server/privacy/db";
import { logSecurityEvent } from "@/server/privacy/security-events";

export type DsrType =
  | "access"
  | "portability"
  | "erasure"
  | "rectification"
  | "restriction"
  | "objection"
  | "other";

/** Best-effort DSAR register entry (never throws). */
export async function logDataSubjectRequest(opts: {
  userId?: string | null;
  email?: string | null;
  type: DsrType;
  channel?: "self_service" | "email" | "post" | "other";
  completed?: boolean;
  notes?: string;
}): Promise<void> {
  try {
    const admin = privacyAdminClient();
    if (!admin) return;
    const now = new Date().toISOString();
    await admin.from("data_subject_requests").insert({
      user_id: opts.userId ?? null,
      subject_ref: opts.email ? subjectRef(opts.email) : null,
      request_type: opts.type,
      channel: opts.channel ?? "self_service",
      status: opts.completed ? "completed" : "open",
      completed_at: opts.completed ? now : null,
      notes: opts.notes ?? null,
    });
  } catch {
    /* register is evidence, not a dependency */
  }
}

export type PendingDeletion = {
  id: string;
  requestedAt: string;
  scheduledFor: string;
  mode: string;
};

export async function getPendingDeletion(
  userId: string,
): Promise<PendingDeletion | null> {
  const admin = privacyAdminClient();
  if (!admin) return null;
  try {
    const { data } = await admin
      .from("account_deletion_requests")
      .select("id, requested_at, scheduled_for, mode")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      requestedAt: data.requested_at as string,
      scheduledFor: data.scheduled_for as string,
      mode: data.mode as string,
    };
  } catch {
    return null;
  }
}

export type StartDeletionResult =
  | {
      mode: "scheduled";
      requestId: string;
      scheduledFor: string;
      cancelToken: string;
      plan: ErasurePlan;
    }
  | {
      mode: "immediate" | "member_only";
      requestId: string;
      authDeleted: boolean;
      failedSteps: number;
      plan: ErasurePlan;
    };

export async function startAccountDeletion(opts: {
  userId: string;
  email: string | null;
  /** How to treat sole-owner practices. Ignored when there are none. */
  practiceData: "schedule" | "immediate";
  ip?: string | null;
}): Promise<StartDeletionResult> {
  const admin = privacyAdminClient();
  if (!admin) {
    throw new Error("Account deletion is not available in this environment.");
  }
  const { userId, email } = opts;

  const existing = await getPendingDeletion(userId);
  if (existing) {
    throw new PrivacyAuthError(
      "A deletion is already scheduled for your account. Cancel it first to start over.",
    );
  }

  const plan = await buildErasurePlan(admin, userId);
  if (plan.blocked.length > 0) {
    throw new PrivacyAuthError(
      `You are the only owner of ${plan.blocked
        .map((b) => `"${b.practiceName}"`)
        .join(", ")} which still has other team members. Remove them or transfer ownership (contact support) before deleting your account.`,
    );
  }

  const soleOwner = plan.erasePracticeIds.length > 0;
  const mode: "scheduled" | "immediate" | "member_only" = !soleOwner
    ? "member_only"
    : opts.practiceData === "immediate"
      ? "immediate"
      : "scheduled";

  const due = mode === "scheduled" ? scheduledFor() : new Date();
  const requestId = crypto.randomUUID();
  const cancel = newCancelToken(requestId);

  // Cancel billing first (reversible) so we never keep charging an erased practice.
  const stripe = await cancelStripeAtPeriodEnd(admin, plan.erasePracticeIds);

  const { error: insertError } = await admin
    .from("account_deletion_requests")
    .insert({
      id: requestId,
      user_id: userId,
      subject_ref: subjectRef(email),
      practice_ids: plan.erasePracticeIds,
      mode,
      status: "pending",
      scheduled_for: due.toISOString(),
      cancel_token_hash: mode === "scheduled" ? cancel.hash : null,
      result: { stripeChanges: stripe.changes },
    });
  if (insertError) {
    await restoreStripeSubscriptions(admin, stripe.changes);
    throw new Error("Could not record your deletion request. Please try again.");
  }

  await logDataSubjectRequest({
    userId,
    email,
    type: "erasure",
    completed: mode !== "scheduled",
    notes: `mode=${mode}`,
  });
  await logSecurityEvent({
    type: "privacy.account_erasure_requested",
    severity: "medium",
    actorUserId: userId,
    subjectUserId: userId,
    ip: opts.ip,
    details: { mode, practices: plan.erasePracticeIds.length },
  });

  if (mode === "scheduled") {
    return {
      mode,
      requestId,
      scheduledFor: due.toISOString(),
      cancelToken: cancel.token,
      plan,
    };
  }

  const exec = await finishDeletion(requestId, userId, email, plan.erasePracticeIds);
  return {
    mode,
    requestId,
    authDeleted: exec.authDeleted,
    failedSteps: exec.failed,
    plan,
  };
}

async function finishDeletion(
  requestId: string,
  userId: string,
  email: string | null,
  practiceIds: string[],
): Promise<{ authDeleted: boolean; failed: number }> {
  const admin = privacyAdminClient()!;
  try {
    const exec = await executeAccountErasure({
      userId,
      email,
      erasePracticeIds: practiceIds,
    });
    const ok = exec.authDeleted && exec.failed.length === 0;
    await admin
      .from("account_deletion_requests")
      .update({
        status: ok ? "completed" : "failed",
        completed_at: ok ? new Date().toISOString() : null,
        result: summariseSteps(exec.steps),
      })
      .eq("id", requestId);
    await logSecurityEvent({
      type: "privacy.account_erased",
      severity: ok ? "info" : "high",
      subjectUserId: userId,
      details: { requestId, failed: exec.failed.length },
    });
    return { authDeleted: exec.authDeleted, failed: exec.failed.length };
  } catch (err) {
    await admin
      .from("account_deletion_requests")
      .update({
        status: "failed",
        result: {
          error: (err instanceof Error ? err.message : "unknown").slice(0, 200),
        },
      })
      .eq("id", requestId);
    throw err;
  }
}

async function restoreFromRow(
  admin: NonNullable<ReturnType<typeof privacyAdminClient>>,
  result: unknown,
) {
  const changes = (result as { stripeChanges?: StripeChange[] } | null)
    ?.stripeChanges;
  if (Array.isArray(changes)) {
    await restoreStripeSubscriptions(admin, changes);
  }
}

/** Signed-in user cancels their own pending deletion. */
export async function cancelAccountDeletionForUser(
  userId: string,
): Promise<boolean> {
  const admin = privacyAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("account_deletion_requests")
    .select("id, result")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("mode", "scheduled")
    .maybeSingle();
  if (!data) return false;
  await restoreFromRow(admin, data.result);
  await admin
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", data.id as string)
    .eq("status", "pending");
  await logSecurityEvent({
    type: "privacy.account_erasure_cancelled",
    actorUserId: userId,
    subjectUserId: userId,
  });
  return true;
}

/** E-mailed link cancel. Token is single-purpose and compared via hash. */
export async function cancelAccountDeletionByToken(
  token: string,
): Promise<boolean> {
  const admin = privacyAdminClient();
  if (!admin) return false;
  const requestId = token.split(".")[0] ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return false;
  const { data } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, cancel_token_hash, result")
    .eq("id", requestId)
    .eq("status", "pending")
    .maybeSingle();
  if (!data || !verifyCancelToken(token, data.cancel_token_hash as string)) {
    return false;
  }
  await restoreFromRow(admin, data.result);
  await admin
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending");
  await logSecurityEvent({
    type: "privacy.account_erasure_cancelled",
    subjectUserId: data.user_id as string,
    details: { via: "email_link" },
  });
  return true;
}

/** Cron entry: execute scheduled deletions whose grace period has ended. */
export async function processDueAccountDeletions(
  now = new Date(),
  limit = 10,
): Promise<{ processed: number; failed: number }> {
  const admin = privacyAdminClient();
  if (!admin) return { processed: 0, failed: 0 };
  const { data } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, practice_ids, subject_ref")
    .eq("status", "pending")
    .eq("mode", "scheduled")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  let processed = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      // Email is not stored on the request; fetch it for the invite cleanup only.
      let email: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(row.user_id as string);
        email = u?.user?.email ?? null;
      } catch {
        email = null;
      }
      const res = await finishDeletion(
        row.id as string,
        row.user_id as string,
        email,
        (row.practice_ids as string[]) ?? [],
      );
      processed += 1;
      if (!res.authDeleted || res.failed > 0) failed += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        "[privacy] scheduled deletion failed:",
        row.id,
        err instanceof Error ? err.message : "unknown",
      );
    }
  }
  return { processed, failed };
}
