import { isSupabaseConfigured, getEnv } from "@/lib/env";
import { buildPracticeFilings, type PracticeClientLite } from "@/lib/practice-filings";
import {
  sendTransactionalEmail,
} from "@/server/email/transactional";
import {
  filingReminderEmailContent,
  filingRowToEmailItem,
} from "@/server/email/filing-reminder-template";
import {
  generateUnsubscribeToken,
  isSubscribedToFilingReminders,
  unsubscribeUrl,
  type EmailPreferenceRow,
} from "@/server/email/unsubscribe";

export type FilingReminderResult = {
  practicesChecked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

type PracticeMember = {
  userId: string;
  practiceId: string;
  practiceName: string;
  email: string;
  displayName: string;
  preferences: EmailPreferenceRow | null;
};

const DAY_MS = 86_400_000;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function minDaysUntilDeadline(
  filings: ReturnType<typeof buildPracticeFilings>,
): number | null {
  let min: number | null = null;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  for (const row of filings) {
    if (!row.deadlineIso) continue;
    const due = new Date(row.deadlineIso);
    if (Number.isNaN(due.getTime())) continue;
    const dueMs = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const diff = Math.round((dueMs - todayMs) / DAY_MS);
    if (min == null || diff < min) min = diff;
  }
  return min;
}

function shouldSendReminder(
  filings: ReturnType<typeof buildPracticeFilings>,
  lastSentAt: string | null,
): boolean {
  const actionable = filings.filter(
    (f) => f.urgency === "overdue" || f.urgency === "due_soon",
  );
  if (!actionable.length) return false;

  const daysSinceSent = daysSince(lastSentAt);
  const minDays = minDaysUntilDeadline(actionable);

  if (minDays != null && minDays <= 7) {
    return daysSinceSent == null || daysSinceSent >= 2;
  }
  return daysSinceSent == null || daysSinceSent >= 28;
}

async function ensurePreference(
  userId: string,
  practiceId: string,
): Promise<EmailPreferenceRow> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (existing) return existing as EmailPreferenceRow;

  const token = generateUnsubscribeToken();
  const { data: created, error } = await supabase
    .from("email_preferences")
    .insert({
      user_id: userId,
      practice_id: practiceId,
      unsubscribe_token: token,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created as EmailPreferenceRow;
}

async function listPracticeMembers(): Promise<PracticeMember[]> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();

  const { data: members, error } = await supabase
    .from("practice_members")
    .select(
      "user_id, practice_id, email, role, practices(name), profiles(first_name, surname)",
    )
    .in("role", ["owner", "admin", "practitioner"]);

  if (error) throw new Error(error.message);

  const out: PracticeMember[] = [];
  for (const row of members ?? []) {
    const email = (row.email as string | null)?.trim();
    if (!email) continue;
    const practice = row.practices as
      | { name?: string }
      | { name?: string }[]
      | null;
    const practiceRow = Array.isArray(practice) ? practice[0] : practice;
    const profile = row.profiles as
      | { first_name?: string; surname?: string }
      | { first_name?: string; surname?: string }[]
      | null;
    const profileRow = Array.isArray(profile) ? profile[0] : profile;
    const practiceId = row.practice_id as string;
    const userId = row.user_id as string;
    const preferences = await ensurePreference(userId, practiceId);
    const firstName = profileRow?.first_name?.trim();
    out.push({
      userId,
      practiceId,
      practiceName: practiceRow?.name ?? "Your practice",
      email,
      displayName: firstName || "there",
      preferences,
    });
  }
  return out;
}

async function listPracticeClients(practiceId: string): Promise<PracticeClientLite[]> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, type, company_number, companies_house")
    .eq("practice_id", practiceId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    companyNumber: (row.company_number as string | null) ?? null,
    companiesHouse: row.companies_house as PracticeClientLite["companiesHouse"],
  }));
}

async function markFilingReminderSent(userId: string, practiceId: string) {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  await supabase
    .from("email_preferences")
    .update({
      filing_reminder_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("practice_id", practiceId);
}

/** Send filing reminder summaries to subscribed practice members. */
export async function sendFilingReminders(): Promise<FilingReminderResult> {
  const result: FilingReminderResult = {
    practicesChecked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const members = await listPracticeMembers();
  const byPractice = new Map<string, PracticeMember[]>();
  for (const m of members) {
    const list = byPractice.get(m.practiceId) ?? [];
    list.push(m);
    byPractice.set(m.practiceId, list);
  }

  for (const [practiceId, team] of byPractice) {
    result.practicesChecked += 1;
    try {
      const clients = await listPracticeClients(practiceId);
      const allFilings = buildPracticeFilings(clients);
      const actionable = allFilings.filter(
        (f) => f.urgency === "overdue" || f.urgency === "due_soon",
      );

      for (const member of team) {
        if (!isSubscribedToFilingReminders(member.preferences)) {
          result.skipped += 1;
          continue;
        }
        if (
          !shouldSendReminder(
            actionable,
            member.preferences?.filing_reminder_sent_at ?? null,
          )
        ) {
          result.skipped += 1;
          continue;
        }
        if (!actionable.length) {
          result.skipped += 1;
          continue;
        }

        const token =
          member.preferences?.unsubscribe_token ?? generateUnsubscribeToken();
        const content = filingReminderEmailContent({
          recipientName: member.displayName,
          practiceName: member.practiceName,
          items: actionable.map((row) => filingRowToEmailItem(row, appUrl)),
          appUrl,
          unsubscribeUrl: unsubscribeUrl(token, appUrl),
        });

        await sendTransactionalEmail({
          to: member.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          listUnsubscribeUrl: unsubscribeUrl(token, appUrl),
        });
        await markFilingReminderSent(member.userId, practiceId);
        result.sent += 1;
      }
    } catch (err) {
      result.errors.push(
        `${practiceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
