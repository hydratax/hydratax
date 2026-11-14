/**
 * Retention / clean-up job (UK GDPR Art 5(1)(e) storage limitation).
 *
 * CRON WIRING (one line, in the cron route that already exists — owned by
 * another worker, so NOT edited here):
 *
 *   import { runRetentionJobs } from "@/server/privacy/retention";
 *   // inside the authenticated cron handler:
 *   const retention = await runRetentionJobs();   // returns a summary, never throws
 *
 * Run it at least daily. Every step is best-effort and idempotent; a missing
 * table (migration not applied) is reported as skipped, not as a failure.
 *
 * Periods come from `RETENTION_DAYS` in `src/lib/retention-policy.ts` (the
 * single source of truth that also feeds the public Privacy Notice).
 */

import { RETENTION_DAYS } from "@/lib/retention-policy";
import { processDueAccountDeletions } from "@/server/privacy/account-deletion";
import {
  failedSteps,
  isMissingRelation,
  privacyAdminClient,
  runStep,
  type StepResult,
} from "@/server/privacy/db";
import { logSecurityEvent } from "@/server/privacy/security-events";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function cutoffIso(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

/**
 * Tables that only exist to de-duplicate provider webhook deliveries. The
 * webhook owner can append their table name here; unknown tables are skipped.
 * Each must have a `created_at timestamptz` column.
 */
export const WEBHOOK_DEDUPE_TABLES: readonly string[] = [
  "stripe_webhook_events",
  "webhook_events",
  "processed_webhook_events",
];

export type RetentionSummary = {
  ranAt: string;
  steps: StepResult[];
  failed: number;
  accountDeletions: { processed: number; failed: number };
};

export async function runRetentionJobs(
  now: Date = new Date(),
): Promise<RetentionSummary> {
  const admin = privacyAdminClient();
  const steps: StepResult[] = [];

  if (!admin) {
    return {
      ranAt: now.toISOString(),
      steps: [{ step: "retention", ok: true, skipped: true }],
      failed: 0,
      accountDeletions: { processed: 0, failed: 0 },
    };
  }

  // 1. MFA challenges / one-time codes: 24h after expiry at most.
  steps.push(
    await runStep("mfa_challenges", () =>
      admin
        .from("mfa_challenges")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso(now, RETENTION_DAYS.mfaChallengesHours * HOUR_MS)),
    ),
  );

  // 2. Client e-mail log (message previews) and admin broadcast log.
  steps.push(
    await runStep("client_email_logs", () =>
      admin
        .from("client_email_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso(now, RETENTION_DAYS.emailLogsDays * DAY_MS)),
    ),
  );
  steps.push(
    await runStep("admin_email_logs", () =>
      admin
        .from("admin_email_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso(now, RETENTION_DAYS.adminEmailLogsDays * DAY_MS)),
    ),
  );

  // 3. Practice activity log.
  steps.push(
    await runStep("practice_activity_logs", () =>
      admin
        .from("practice_activity_logs")
        .delete({ count: "exact" })
        .lt("created_at", cutoffIso(now, RETENTION_DAYS.activityLogsDays * DAY_MS)),
    ),
  );

  // 4. Support tickets: only after resolution + period (updated_at is the
  //    resolution time for resolved/closed tickets).
  steps.push(
    await runStep("support_tickets", () =>
      admin
        .from("support_tickets")
        .delete({ count: "exact" })
        .in("status", ["resolved", "closed"])
        .lt(
          "updated_at",
          cutoffIso(now, RETENTION_DAYS.supportTicketsAfterResolutionDays * DAY_MS),
        ),
    ),
  );

  // 5. Team invites: accepted ones are no longer needed; pending ones lapse.
  steps.push(
    await runStep("practice_team_invites.accepted", () =>
      admin
        .from("practice_team_invites")
        .delete({ count: "exact" })
        .not("accepted_at", "is", null)
        .lt("accepted_at", cutoffIso(now, RETENTION_DAYS.teamInviteAcceptedDays * DAY_MS)),
    ),
  );
  steps.push(
    await runStep("practice_team_invites.pending", () =>
      admin
        .from("practice_team_invites")
        .delete({ count: "exact" })
        .is("accepted_at", null)
        .lt("created_at", cutoffIso(now, RETENTION_DAYS.teamInvitePendingDays * DAY_MS)),
    ),
  );

  // 6. Idle WhatsApp / bot sessions (phone numbers) and stale PIN counters.
  steps.push(
    await runStep("bot_sessions", () =>
      admin
        .from("bot_sessions")
        .delete({ count: "exact" })
        .lt("updated_at", cutoffIso(now, RETENTION_DAYS.botSessionsIdleDays * DAY_MS)),
    ),
  );
  steps.push(
    await runStep("bot_pin_attempts", () =>
      admin
        .from("bot_pin_attempts")
        .delete({ count: "exact" })
        .lt("updated_at", cutoffIso(now, RETENTION_DAYS.botSessionsIdleDays * DAY_MS))
        .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`),
    ),
  );

  // 7. Webhook de-duplication tables.
  for (const table of WEBHOOK_DEDUPE_TABLES) {
    steps.push(
      await runStep(table, () =>
        admin
          .from(table)
          .delete({ count: "exact" })
          .lt("created_at", cutoffIso(now, RETENTION_DAYS.webhookDedupeDays * DAY_MS)),
      ),
    );
  }

  // 8. Feature-request author e-mail: blank after a year (keeps the idea).
  steps.push(
    await runStep("feature_requests.author_email", () =>
      admin
        .from("feature_requests")
        .update({ author_email: null })
        .not("author_email", "is", null)
        .lt(
          "created_at",
          cutoffIso(now, RETENTION_DAYS.featureRequestAuthorEmailDays * DAY_MS),
        ),
    ),
  );

  // 9. Security events (append-only; deletion only via the definer function).
  try {
    const { error } = await admin.rpc("purge_expired_security_events", {
      retain_days: RETENTION_DAYS.securityEventsDays,
    });
    if (error && !isMissingRelation(error) && error.code !== "PGRST202") {
      steps.push({ step: "security_events", ok: false, error: error.message.slice(0, 200) });
    } else {
      steps.push({ step: "security_events", ok: true, skipped: Boolean(error) });
    }
  } catch (err) {
    steps.push({
      step: "security_events",
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }

  // 10. DSAR register + completed deletion proofs.
  steps.push(
    await runStep("data_subject_requests", () =>
      admin
        .from("data_subject_requests")
        .delete({ count: "exact" })
        .neq("status", "open")
        .lt("received_at", cutoffIso(now, RETENTION_DAYS.dataSubjectRequestLogDays * DAY_MS)),
    ),
  );
  steps.push(
    await runStep("account_deletion_requests", () =>
      admin
        .from("account_deletion_requests")
        .delete({ count: "exact" })
        .in("status", ["completed", "cancelled"])
        .lt("requested_at", cutoffIso(now, RETENTION_DAYS.accountDeletionRecordDays * DAY_MS)),
    ),
  );

  // 11. Execute scheduled account deletions whose grace period has ended.
  let accountDeletions = { processed: 0, failed: 0 };
  try {
    accountDeletions = await processDueAccountDeletions(now);
  } catch (err) {
    steps.push({
      step: "account_deletions",
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }

  const failed = failedSteps(steps).length + accountDeletions.failed;
  await logSecurityEvent({
    type: "privacy.retention_run",
    severity: failed > 0 ? "low" : "info",
    details: {
      steps: steps.length,
      failed,
      deleted: steps.reduce((n, s) => n + (s.count ?? 0), 0),
      accountDeletions,
    },
  });

  return { ranAt: now.toISOString(), steps, failed, accountDeletions };
}

/** PII-free summary safe to return from a cron HTTP response. */
export type RetentionCronSummary = {
  ran: boolean;
  ranAt?: string;
  steps?: number;
  failed?: number;
  failedSteps?: string[];
  accountDeletions?: { processed: number; failed: number };
};

/**
 * Cron wrapper: runs the retention jobs and NEVER throws, so a retention
 * problem cannot fail the filing-reminder cron it rides along with. The
 * returned object contains counts and step names only (no personal data).
 */
export async function runRetentionJobsBestEffort(): Promise<RetentionCronSummary> {
  try {
    const summary = await runRetentionJobs();
    return {
      ran: true,
      ranAt: summary.ranAt,
      steps: summary.steps.length,
      failed: summary.failed,
      failedSteps: failedSteps(summary.steps).map((s) => s.step),
      accountDeletions: summary.accountDeletions,
    };
  } catch (err) {
    console.error(
      "[retention] cron run failed:",
      err instanceof Error ? err.name : "error",
    );
    return { ran: false };
  }
}
