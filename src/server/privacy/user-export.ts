/**
 * Build the signed-in user's own personal-data export (UK GDPR Art 15 / 20).
 *
 * SECURITY: `userId` / `email` MUST come from the verified server session.
 * Uses the service-role client (bypasses RLS) so every query is explicitly
 * scoped to that user id. Secrets are removed by `shapeUserExport`.
 */

import { LEGAL_ENTITY } from "@/lib/legal-entity";
import { privacyAdminClient } from "@/server/privacy/db";
import {
  shapeUserExport,
  type UserDataExport,
  type UserExportInput,
} from "@/server/privacy/export-shape";

type Row = Record<string, unknown>;

async function rows(
  fn: () => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Row[]> {
  try {
    const { data, error } = await fn();
    return error ? [] : ((data ?? []) as Row[]);
  } catch {
    return [];
  }
}

async function one(
  fn: () => PromiseLike<{ data: unknown | null; error: unknown }>,
): Promise<Row | null> {
  try {
    const { data, error } = await fn();
    return error ? null : ((data ?? null) as Row | null);
  } catch {
    return null;
  }
}

/** Escape LIKE wildcards so an email address is matched literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function buildUserDataExport(subject: {
  userId: string;
  email: string | null;
}): Promise<UserDataExport> {
  const { userId } = subject;
  const email = subject.email?.trim().toLowerCase() ?? null;
  const admin = privacyAdminClient();

  const empty: UserExportInput = {
    userId,
    authUser: null,
    profile: null,
    memberships: [],
    mfaSettings: null,
    emailPreferences: [],
    supportTickets: [],
    featureRequests: [],
    featureVotes: [],
    activityLogs: [],
    auditEvents: [],
    teamInvites: [],
    orders: [],
    securityEvents: [],
    deletionRequests: [],
    gatewayCredentialLinks: [],
  };

  if (!admin) {
    return shapeUserExport(
      { ...empty, authUser: { id: userId, email } },
      { legalName: LEGAL_ENTITY.legalName, contact: LEGAL_ENTITY.privacyEmail },
    );
  }

  let authUser: Row | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    authUser = (data?.user as unknown as Row) ?? null;
  } catch {
    authUser = { id: userId, email };
  }

  const [
    profile,
    memberships,
    mfaSettings,
    emailPreferences,
    supportTickets,
    featureRequests,
    featureVotes,
    activityLogs,
    auditEvents,
    invitedByMe,
    invitedMe,
    orders,
    securityEvents,
    deletionRequests,
    gatewayCredentialLinks,
  ] = await Promise.all([
    one(() =>
      admin
        .from("profiles")
        .select("id, email, first_name, surname, org_type, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle(),
    ),
    rows(() =>
      admin
        .from("practice_members")
        .select("practice_id, role, module_access, display_name, email, created_at, practices(name)")
        .eq("user_id", userId)
        .limit(500),
    ),
    one(() =>
      admin
        .from("user_mfa_settings")
        .select("enabled, channel, alt_email, phone_e164, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ),
    rows(() =>
      admin
        .from("email_preferences")
        .select("practice_id, filing_reminders, marketing_emails, unsubscribed_at, created_at, updated_at")
        .eq("user_id", userId)
        .limit(500),
    ),
    rows(() =>
      admin
        .from("support_tickets")
        .select("ticket_ref, subject, message, help_topic, module, status, page_url, created_at, updated_at")
        .eq("raised_by", userId)
        .order("created_at", { ascending: false })
        .limit(5000),
    ),
    rows(() =>
      admin
        .from("feature_requests")
        .select("id, title, body, author_name, author_email, status, vote_count, created_at")
        .eq("author_user_id", userId)
        .limit(5000),
    ),
    rows(() =>
      admin
        .from("feature_votes")
        .select("request_id, created_at")
        .eq("voter_key", `user:${userId}`)
        .limit(5000),
    ),
    rows(() =>
      admin
        .from("practice_activity_logs")
        .select("practice_id, action, summary, entity_type, entity_id, created_at")
        .eq("actor_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),
    ),
    rows(() =>
      admin
        .from("audit_events")
        .select("practice_id, client_id, action, entity_type, entity_id, hmrc_status_code, created_at")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(5000),
    ),
    rows(() =>
      admin
        .from("practice_team_invites")
        .select("practice_id, email, display_name, module_access, created_at, accepted_at")
        .eq("invited_by", userId)
        .limit(1000),
    ),
    email
      ? rows(() =>
          admin
            .from("practice_team_invites")
            .select("practice_id, email, display_name, module_access, created_at, accepted_at")
            .ilike("email", escapeLike(email))
            .limit(1000),
        )
      : Promise.resolve([] as Row[]),
    email
      ? rows(() =>
          admin
            .from("checkout_orders")
            .select("plan_key, amount_total, currency, status, mode, created_at, stripe_customer_id, stripe_subscription_id, customer_email")
            .ilike("customer_email", escapeLike(email))
            .limit(1000),
        )
      : Promise.resolve([] as Row[]),
    rows(() =>
      admin
        .from("security_events")
        .select("occurred_at, event_type, severity, practice_id")
        .or(`actor_user_id.eq.${userId},subject_user_id.eq.${userId}`)
        .order("occurred_at", { ascending: false })
        .limit(2000),
    ),
    rows(() =>
      admin
        .from("account_deletion_requests")
        .select("requested_at, scheduled_for, status, mode, completed_at, cancelled_at")
        .eq("user_id", userId)
        .limit(50),
    ),
    rows(() =>
      admin
        .from("user_gateway_credentials")
        .select("practice_id, client_id, created_at, updated_at")
        .eq("user_id", userId)
        .limit(1000),
    ),
  ]);

  // Feature requests may also live in the Drizzle/Neon database.
  const featureRows = [...featureRequests];
  try {
    const { hasDatabase, getDb } = await import("@/server/db");
    if (hasDatabase()) {
      const { featureRequests: fr } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      const extra = await getDb().select().from(fr).where(eq(fr.authorUserId, userId));
      const seen = new Set(featureRows.map((r) => String(r.id)));
      for (const r of extra) {
        if (!seen.has(r.id)) {
          featureRows.push({
            id: r.id,
            title: r.title,
            body: r.body,
            author_name: r.authorName,
            author_email: r.authorEmail,
            status: r.status,
            vote_count: r.voteCount,
            created_at: r.createdAt,
          });
        }
      }
    }
  } catch {
    /* Neon not configured */
  }

  const invites = [...invitedByMe];
  const seenInvite = new Set(invites.map((r) => `${r.practice_id}:${r.email}`));
  for (const r of invitedMe) {
    if (!seenInvite.has(`${r.practice_id}:${r.email}`)) invites.push(r);
  }

  return shapeUserExport(
    {
      userId,
      authUser,
      profile,
      memberships,
      mfaSettings,
      emailPreferences,
      supportTickets,
      featureRequests: featureRows,
      featureVotes,
      activityLogs,
      auditEvents,
      teamInvites: invites,
      orders,
      securityEvents,
      deletionRequests,
      gatewayCredentialLinks,
    },
    { legalName: LEGAL_ENTITY.legalName, contact: LEGAL_ENTITY.privacyEmail },
  );
}
