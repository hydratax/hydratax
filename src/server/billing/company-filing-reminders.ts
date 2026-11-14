import { escapeHtml } from "@/lib/html-escape";
import { getEnv, isSupabaseConfigured } from "@/lib/env";
import { sendTransactionalEmail } from "@/server/email/transactional";
import {
  generateUnsubscribeToken,
  unsubscribeUrl,
  type EmailPreferenceRow,
} from "@/server/email/unsubscribe";

const FOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 122; // ~4 months
const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export type CompanyFilingReminderResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

type PrefRow = EmailPreferenceRow & {
  company_filing_reminders?: boolean;
  company_filing_reminder_weekday?: number | null;
  company_filing_reminder_started_at?: string | null;
  company_filing_reminder_sent_at?: string | null;
  company_filing_reminder_ends_at?: string | null;
};

function randomWeekday(): number {
  return Math.floor(Math.random() * 7);
}

/** Enrol a solo / single-company practice owner into the 4-month weekly nudge. */
export async function enrolCompanyFilingReminders(input: {
  userId: string;
  practiceId: string;
  email: string;
  firstName?: string | null;
}) {
  if (!isSupabaseConfigured()) return;
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const ends = new Date(now.getTime() + FOUR_MONTHS_MS);
  const weekday = randomWeekday();
  const token = generateUnsubscribeToken();

  const { data: existing } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", input.userId)
    .eq("practice_id", input.practiceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("email_preferences")
      .update({
        company_filing_reminders: true,
        company_filing_reminder_weekday:
          existing.company_filing_reminder_weekday ?? weekday,
        company_filing_reminder_started_at:
          existing.company_filing_reminder_started_at ?? now.toISOString(),
        company_filing_reminder_ends_at:
          existing.company_filing_reminder_ends_at ?? ends.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("email_preferences").insert({
    user_id: input.userId,
    practice_id: input.practiceId,
    unsubscribe_token: token,
    company_filing_reminders: true,
    company_filing_reminder_weekday: weekday,
    company_filing_reminder_started_at: now.toISOString(),
    company_filing_reminder_ends_at: ends.toISOString(),
  });

  void input.email;
  void input.firstName;
}

function isSoloPracticePlan(planKey: string | null | undefined): boolean {
  if (!planKey) return true; // trial / just signed up — treat as single-company path
  const k = planKey.toLowerCase();
  return (
    k.includes("solo") ||
    k.includes("single") ||
    k.includes("starter") ||
    k.includes("per taxpayer") ||
    k.includes("per return")
  );
}

function emailBody(opts: {
  firstName: string;
  appUrl: string;
  unsub: string;
}) {
  const name = opts.firstName || "there";
  const text = `Hi ${name},

A quick weekly nudge from HydraTax for your limited company filings:

• Confirmation statement (CS01) — ${opts.appUrl}/companies-house/confirmation-statement
• Annual accounts (iXBRL) — ${opts.appUrl}/companies-house/accounts-ixbrl
• CT600 — open your desk: ${opts.appUrl}/dashboard
• Check due dates — ${opts.appUrl}/companies

Search your company, then file overdue CS01 or accounts from the links above. Reminder emails run about once a week for four months after you create your account.

Stop anytime: ${opts.unsub}

— HydraTax
`;
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>A quick weekly nudge for your limited company filings:</p>
<ul>
<li><strong>Confirmation statement (CS01)</strong> — <a href="${opts.appUrl}/companies-house/confirmation-statement">file CS01</a></li>
<li><strong>Annual accounts</strong> — <a href="${opts.appUrl}/companies-house/accounts-ixbrl">file iXBRL accounts</a></li>
<li><strong>CT600</strong> — <a href="${opts.appUrl}/dashboard">open your practice desk</a></li>
<li><strong>Due dates</strong> — <a href="${opts.appUrl}/companies">search your company</a></li>
</ul>
<p>If a filing is overdue, use the links above to submit. <a href="${opts.appUrl}/guides/companies-house">Companies House compliance FAQs</a></p>
<p style="color:#64748b;font-size:13px">These reminders run about once a week for four months after you create your account. <a href="${opts.unsub}">Unsubscribe</a></p>
<p>— HydraTax</p>`;
  return { text, html };
}

/** Daily cron: send to enrolled solo owners whose random weekday is today. */
export async function sendCompanyFilingReminders(): Promise<CompanyFilingReminderResult> {
  const result: CompanyFilingReminderResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };
  if (!isSupabaseConfigured()) return result;

  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const today = new Date();
  const weekday = today.getUTCDay();
  const nowIso = today.toISOString();

  const { data: prefs, error } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("company_filing_reminders", true)
    .is("unsubscribed_at", null)
    .eq("company_filing_reminder_weekday", weekday)
    .gt("company_filing_reminder_ends_at", nowIso);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const raw of prefs ?? []) {
    const pref = raw as PrefRow;
    result.checked += 1;

    const last = pref.company_filing_reminder_sent_at
      ? new Date(pref.company_filing_reminder_sent_at).getTime()
      : 0;
    if (last && Date.now() - last < WEEK_MS - 12 * 60 * 60 * 1000) {
      result.skipped += 1;
      continue;
    }

    if (!pref.practice_id || !pref.user_id) {
      result.skipped += 1;
      continue;
    }

    // Confirm practice still looks like a single-company desk
    const { data: sub } = await supabase
      .from("practice_subscriptions")
      .select("plan_key, status")
      .eq("practice_id", pref.practice_id)
      .maybeSingle();
    if (sub?.plan_key && !isSoloPracticePlan(String(sub.plan_key))) {
      result.skipped += 1;
      continue;
    }

    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("practice_id", pref.practice_id);
    if ((count ?? 0) > 1) {
      result.skipped += 1;
      continue;
    }

    const { data: userRow } = await supabase.auth.admin.getUserById(pref.user_id);
    const email = userRow?.user?.email;
    if (!email) {
      result.skipped += 1;
      continue;
    }
    const meta = userRow?.user?.user_metadata ?? {};
    const firstName =
      typeof meta.first_name === "string" ? meta.first_name : "";

    const token = pref.unsubscribe_token || generateUnsubscribeToken();
    const unsub = unsubscribeUrl(token, appUrl);
    const content = emailBody({ firstName, appUrl, unsub });

    try {
      await sendTransactionalEmail({
        to: email,
        subject: "Reminder: confirmation statement, accounts & CT600",
        text: content.text,
        html: content.html,
        listUnsubscribeUrl: unsub,
      });
      await supabase
        .from("email_preferences")
        .update({
          company_filing_reminder_sent_at: nowIso,
          unsubscribe_token: token,
          updated_at: nowIso,
        })
        .eq("id", pref.id);
      result.sent += 1;
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : "send failed",
      );
    }
  }

  return result;
}
