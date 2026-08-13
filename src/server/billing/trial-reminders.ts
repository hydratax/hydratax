import type { SupabaseClient } from "@supabase/supabase-js";
import { isMemoryStore, isSupabaseConfigured, getEnv } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  sendTransactionalEmail,
  trialEndingEmailContent,
} from "@/server/email/transactional";

export type TrialReminderResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

type Candidate = {
  subscriptionId: string;
  practiceId: string;
  practiceName: string;
  email: string | null;
  trialEndsAt: Date;
};

/**
 * Day-7 funnel: email practices whose trial ends within the next 24 hours
 * and who have not already received the reminder.
 */
export async function sendTrialEndingReminders(): Promise<TrialReminderResult> {
  const result: TrialReminderResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = Date.now();
  const windowEnd = now + 24 * 60 * 60 * 1000;

  const candidates = await listTrialEndingSoon(windowEnd);
  result.checked = candidates.length;

  for (const c of candidates) {
    if (!c.email) {
      result.skipped += 1;
      continue;
    }
    const endsMs = c.trialEndsAt.getTime();
    if (endsMs <= now || endsMs > windowEnd) {
      result.skipped += 1;
      continue;
    }

    try {
      const content = trialEndingEmailContent({
        practiceName: c.practiceName,
        trialEndsAt: c.trialEndsAt,
        appUrl,
      });
      await sendTransactionalEmail({
        to: c.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      await markReminderSent(c.subscriptionId, c.practiceId);
      result.sent += 1;
    } catch (err) {
      result.errors.push(
        `${c.practiceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

async function listTrialEndingSoon(windowEndMs: number): Promise<Candidate[]> {
  const out: Candidate[] = [];

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const supabase = getSupabaseAdmin();
      const { data: subs, error } = await supabase
        .from("practice_subscriptions")
        .select(
          "id, practice_id, trial_ends_at, trial_reminder_sent_at, status, practices(name)",
        )
        .eq("status", "trialing")
        .is("trial_reminder_sent_at", null)
        .not("trial_ends_at", "is", null)
        .lte("trial_ends_at", new Date(windowEndMs).toISOString())
        .gt("trial_ends_at", new Date().toISOString());

      if (error) throw new Error(error.message);

      for (const row of subs ?? []) {
        const practice = row.practices as
          | { name?: string }
          | { name?: string }[]
          | null;
        const practiceRow = Array.isArray(practice) ? practice[0] : practice;
        const email = await resolvePracticeEmail(
          supabase,
          row.practice_id as string,
        );
        out.push({
          subscriptionId: row.id as string,
          practiceId: row.practice_id as string,
          practiceName: practiceRow?.name ?? "your practice",
          email,
          trialEndsAt: new Date(row.trial_ends_at as string),
        });
      }
      return out;
    } catch (err) {
      console.error("[trial-reminders] supabase list failed", err);
    }
  }

  if (isMemoryStore()) {
    for (const s of memoryStore.subscriptions) {
      if (s.status !== "trialing" || !s.trialEndsAt) continue;
      if ((s as { trialReminderSentAt?: string }).trialReminderSentAt) continue;
      const ends = new Date(s.trialEndsAt);
      if (ends.getTime() <= Date.now() || ends.getTime() > windowEndMs) continue;
      out.push({
        subscriptionId: s.id,
        practiceId: s.practiceId,
        practiceName: memoryStore.practice.name,
        email:
          (process.env.ADMIN_EMAIL ?? "").split(",")[0]?.trim() ||
          "trial@hydratax.local",
        trialEndsAt: ends,
      });
    }
  }

  return out;
}

async function resolvePracticeEmail(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<string | null> {
  try {
    const { data: members } = await supabase
      .from("practice_members")
      .select("user_id, email, role")
      .eq("practice_id", practiceId)
      .in("role", ["owner", "admin"]);

    const rows = (members ?? []) as {
      user_id?: string;
      email?: string | null;
      role?: string;
    }[];
    const owner = rows.find((r) => r.role === "owner") ?? rows[0];
    if (owner?.email) return owner.email;

    if (owner?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", owner.user_id)
        .maybeSingle();
      if (profile?.email && typeof profile.email === "string") {
        return profile.email;
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const { data: order } = await supabase
      .from("checkout_orders")
      .select("customer_email")
      .eq("practice_id", practiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (order?.customer_email && typeof order.customer_email === "string") {
      return order.customer_email;
    }
  } catch {
    /* ignore */
  }

  return null;
}

async function markReminderSent(subscriptionId: string, practiceId: string) {
  const sentAt = new Date().toISOString();

  if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const supabase = getSupabaseAdmin();
      await supabase
        .from("practice_subscriptions")
        .update({ trial_reminder_sent_at: sentAt })
        .eq("id", subscriptionId);
      return;
    } catch (err) {
      console.error("[trial-reminders] mark sent failed", err);
    }
  }

  if (isMemoryStore()) {
    for (const s of memoryStore.subscriptions) {
      if (s.id === subscriptionId || s.practiceId === practiceId) {
        (s as { trialReminderSentAt?: string }).trialReminderSentAt = sentAt;
      }
    }
  }
}
