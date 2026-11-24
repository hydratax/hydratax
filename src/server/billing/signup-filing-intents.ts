import { escapeHtml } from "@/lib/html-escape";
import { getEnv, isSupabaseConfigured } from "@/lib/env";
import {
  companyNumberFromResumePath,
  filingCtaLabel,
  inferFilingCtaId,
  isFilingCtaId,
  serviceIdFromResumePath,
  type FilingCtaId,
} from "@/lib/filing-cta";
import { isOneOffFilingPath, safeReturnPath } from "@/lib/auth-return";
import { sendTransactionalEmail } from "@/server/email/transactional";
import {
  generateUnsubscribeToken,
  unsubscribeUrl,
} from "@/server/email/unsubscribe";

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

export type SignupFilingIntentResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/** UK civil weekday (0=Sun) and hour (0–23) in Europe/London. */
export function ukWeekdayAndHour(now = new Date()): {
  weekday: number;
  hour: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: map[wd] ?? now.getUTCDay(),
    hour: Number.parseInt(hourRaw, 10) || 0,
  };
}

/** Daytime UK window for reminder sends (avoid late night). */
export function isUkDaytimeForReminders(now = new Date()): boolean {
  const { hour } = ukWeekdayAndHour(now);
  return hour >= 9 && hour <= 17;
}

function randomWeekday(): number {
  return Math.floor(Math.random() * 7);
}

/** Prefer mid-morning / afternoon UK hour (cron still gates by daytime). */
function randomDaytimeHourUk(): number {
  return 9 + Math.floor(Math.random() * 9); // 9–17
}

export async function recordSignupFilingIntent(input: {
  userId: string;
  practiceId?: string | null;
  resumePath: string;
  ctaId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const resumePath = safeReturnPath(input.resumePath, "");
  if (!resumePath || !isOneOffFilingPath(resumePath)) return;

  const ctaId: FilingCtaId | null = isFilingCtaId(input.ctaId)
    ? input.ctaId
    : inferFilingCtaId(resumePath);
  if (!ctaId) return;

  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const companyNumber = companyNumberFromResumePath(resumePath);
  const serviceId = serviceIdFromResumePath(resumePath);

  // One pending intent per user+button — refresh resume path if they click again.
  const { data: existing } = await supabase
    .from("signup_filing_intents")
    .select("id")
    .eq("user_id", input.userId)
    .eq("button_id", ctaId)
    .eq("status", "pending")
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing?.id) {
    await supabase
      .from("signup_filing_intents")
      .update({
        resume_path: resumePath,
        company_number: companyNumber,
        service_id: serviceId,
        practice_id: input.practiceId ?? null,
        button_label: filingCtaLabel(ctaId),
        updated_at: now,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("signup_filing_intents").insert({
    user_id: input.userId,
    practice_id: input.practiceId ?? null,
    button_id: ctaId,
    button_label: filingCtaLabel(ctaId),
    resume_path: resumePath,
    company_number: companyNumber,
    service_id: serviceId,
    status: "pending",
    reminder_weekday: randomWeekday(),
    reminder_hour_uk: randomDaytimeHourUk(),
    created_at: now,
    updated_at: now,
  });
}

export async function completeSignupFilingIntents(input: {
  userId?: string | null;
  practiceId?: string | null;
  serviceId?: string | null;
  companyNumber?: string | null;
}): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  if (!input.userId && !input.practiceId) return 0;

  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("signup_filing_intents")
    .select("id, service_id, company_number, button_id")
    .eq("status", "pending");

  if (input.userId) q = q.eq("user_id", input.userId);
  else if (input.practiceId) q = q.eq("practice_id", input.practiceId);

  const { data: rows } = await q;
  if (!rows?.length) return 0;

  const service = input.serviceId?.trim() || null;
  const company = input.companyNumber?.trim().toUpperCase() || null;
  const now = new Date().toISOString();
  let done = 0;

  for (const row of rows) {
    const serviceMatch =
      !service ||
      !row.service_id ||
      row.service_id === service ||
      (service === "accounts-ixbrl" &&
        (row.service_id === "year-end" ||
          row.button_id === "file-ct600-accounts" ||
          row.button_id === "accounts-only")) ||
      (service === "confirmation-statement" &&
        (row.button_id === "confirmation-statement" ||
          row.button_id === "file-cs01-deadline" ||
          row.button_id === "ch-service-confirmation-statement"));

    const companyMatch =
      !company ||
      !row.company_number ||
      String(row.company_number).toUpperCase() === company;

    if (!serviceMatch || !companyMatch) continue;

    const { error } = await supabase
      .from("signup_filing_intents")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "pending");
    if (!error) done += 1;
  }

  return done;
}

function reminderEmail(opts: {
  firstName: string;
  buttonLabel: string;
  resumeUrl: string;
  unsub: string;
}) {
  const name = opts.firstName || "there";
  const action = opts.buttonLabel;
  const text = `Hi ${name},

You started “${action}” on HydraTax but have not finished yet.

Continue here: ${opts.resumeUrl}

We will remind you about once a week until you complete this filing (or unsubscribe).

Stop reminders: ${opts.unsub}

— HydraTax
`;
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>You started <strong>${escapeHtml(action)}</strong> on HydraTax but have not finished yet.</p>
<p><a href="${escapeHtml(opts.resumeUrl)}">Continue where you left off</a></p>
<p style="color:#64748b;font-size:13px">We send this about once a week until you complete the filing. <a href="${escapeHtml(opts.unsub)}">Unsubscribe</a></p>
<p>— HydraTax</p>`;
  return { text, html };
}

/**
 * Daily cron (scheduled daytime UTC): pending signup CTAs whose random
 * weekday matches today (UK). Skips outside UK daytime hours.
 */
export async function sendSignupFilingIntentReminders(): Promise<SignupFilingIntentResult> {
  const result: SignupFilingIntentResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };
  if (!isSupabaseConfigured()) return result;
  if (!isUkDaytimeForReminders()) {
    result.skipped += 1;
    return result;
  }

  const { weekday } = ukWeekdayAndHour();
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const nowIso = new Date().toISOString();

  const { data: intents, error } = await supabase
    .from("signup_filing_intents")
    .select("*")
    .eq("status", "pending")
    .eq("reminder_weekday", weekday);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const intent of intents ?? []) {
    result.checked += 1;
    const last = intent.last_reminded_at
      ? new Date(intent.last_reminded_at).getTime()
      : 0;
    // Skip the first 3 days after signup so they have time to finish.
    const created = intent.created_at
      ? new Date(intent.created_at).getTime()
      : 0;
    if (created && Date.now() - created < 3 * 24 * 60 * 60 * 1000) {
      result.skipped += 1;
      continue;
    }
    if (last && Date.now() - last < WEEK_MS - 12 * 60 * 60 * 1000) {
      result.skipped += 1;
      continue;
    }

    const { data: userRow } = await supabase.auth.admin.getUserById(
      intent.user_id,
    );
    const email = userRow?.user?.email;
    if (!email) {
      result.skipped += 1;
      continue;
    }
    const meta = userRow?.user?.user_metadata ?? {};
    const firstName =
      typeof meta.first_name === "string" ? meta.first_name : "";

    let unsubToken: string | null = null;
    if (intent.practice_id) {
      const { data: pref } = await supabase
        .from("email_preferences")
        .select("unsubscribe_token, unsubscribed_at, company_filing_reminders")
        .eq("user_id", intent.user_id)
        .eq("practice_id", intent.practice_id)
        .maybeSingle();
      if (pref?.unsubscribed_at || pref?.company_filing_reminders === false) {
        result.skipped += 1;
        continue;
      }
      unsubToken = pref?.unsubscribe_token ?? null;
    }
    if (!unsubToken) unsubToken = generateUnsubscribeToken();
    const unsub = unsubscribeUrl(unsubToken, appUrl);
    const resumeUrl = `${appUrl}${intent.resume_path.startsWith("/") ? "" : "/"}${intent.resume_path}`;
    const content = reminderEmail({
      firstName,
      buttonLabel: intent.button_label || "your filing",
      resumeUrl,
      unsub,
    });

    try {
      await sendTransactionalEmail({
        to: email,
        subject: `Reminder: finish ${intent.button_label || "your filing"}`,
        text: content.text,
        html: content.html,
        listUnsubscribeUrl: unsub,
      });
      await supabase
        .from("signup_filing_intents")
        .update({
          last_reminded_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", intent.id);
      result.sent += 1;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : "send failed");
    }
  }

  return result;
}
