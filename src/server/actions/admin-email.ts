"use server";

import { z } from "zod";
import { requireAdmin, platformAdminEmails } from "@/server/auth/admin";
import { isSupabaseConfigured, getEnv } from "@/lib/env";
import { sendTransactionalEmail, trialEndingEmailContent } from "@/server/email/transactional";
import {
  customAdminEmailContent,
  filingReminderEmailContent,
  filingRowToEmailItem,
} from "@/server/email/filing-reminder-template";
import { buildPracticeFilings, type PracticeClientLite } from "@/lib/practice-filings";
import {
  generateUnsubscribeToken,
  unsubscribeUrl,
  type EmailPreferenceRow,
} from "@/server/email/unsubscribe";
import { getR2StorageUsage } from "@/server/storage/r2-quota";

export type AdminEmailTemplate =
  | "filing_reminder"
  | "custom"
  | "trial_ending";

export type AdminEmailRecipientFilter =
  | "all_practices"
  | "overdue_filings"
  | "custom_list";

const sendSchema = z.object({
  template: z.enum(["filing_reminder", "custom", "trial_ending"]),
  recipientFilter: z.enum(["all_practices", "overdue_filings", "custom_list"]),
  customEmails: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  dryRun: z.boolean().optional(),
});

export type AdminEmailSendResult = {
  ok: boolean;
  recipientCount: number;
  sent: number;
  skipped: number;
  previewSubject?: string;
  errors: string[];
};

type Recipient = {
  email: string;
  name: string;
  practiceId?: string;
  practiceName?: string;
  unsubscribeToken?: string;
  clients?: PracticeClientLite[];
};

async function listRecipients(
  filter: AdminEmailRecipientFilter,
  customEmails?: string,
): Promise<Recipient[]> {
  if (filter === "custom_list") {
    const emails = (customEmails ?? "")
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    return emails.map((email) => ({ email, name: "there" }));
  }

  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data: members } = await supabase
    .from("practice_members")
    .select(
      "user_id, practice_id, email, practices(name), profiles(first_name, surname)",
    )
    .in("role", ["owner", "admin"]);

  const out: Recipient[] = [];
  for (const row of members ?? []) {
    const email = (row.email as string | null)?.trim();
    if (!email) continue;
    const practiceId = row.practice_id as string;
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

    const { data: pref } = await supabase
      .from("email_preferences")
      .select("*")
      .eq("user_id", row.user_id as string)
      .eq("practice_id", practiceId)
      .maybeSingle();

    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, type, company_number, companies_house")
      .eq("practice_id", practiceId);

    const clientRows: PracticeClientLite[] = (clients ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      type: c.type as string,
      companyNumber: (c.company_number as string | null) ?? null,
      companiesHouse: c.companies_house as PracticeClientLite["companiesHouse"],
    }));

    if (filter === "overdue_filings") {
      const filings = buildPracticeFilings(clientRows);
      const hasOverdue = filings.some((f) => f.urgency === "overdue");
      if (!hasOverdue) continue;
    }

    out.push({
      email,
      name: profileRow?.first_name?.trim() || "there",
      practiceId,
      practiceName: practiceRow?.name ?? "Your practice",
      unsubscribeToken: (pref as EmailPreferenceRow | null)?.unsubscribe_token,
      clients: clientRows,
    });
  }
  return out;
}

export async function getAdminEmailStats() {
  await requireAdmin();
  const usage = await getR2StorageUsage();
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  return {
    resendConfigured,
    r2Usage: usage,
    adminEmails: platformAdminEmails(),
  };
}

export async function sendAdminEmail(
  input: z.infer<typeof sendSchema>,
): Promise<AdminEmailSendResult> {
  const session = await requireAdmin();
  const data = sendSchema.parse(input);
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const result: AdminEmailSendResult = {
    ok: true,
    recipientCount: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const recipients = await listRecipients(
    data.recipientFilter,
    data.customEmails,
  );
  result.recipientCount = recipients.length;

  for (const recipient of recipients) {
    try {
      let content: { subject: string; text: string; html: string };
      const token = recipient.unsubscribeToken ?? generateUnsubscribeToken();
      const unsub = unsubscribeUrl(token, appUrl);

      if (data.template === "filing_reminder") {
        const filings = buildPracticeFilings(recipient.clients ?? []).filter(
          (f) => f.urgency === "overdue" || f.urgency === "due_soon",
        );
        if (!filings.length) {
          result.skipped += 1;
          continue;
        }
        content = filingReminderEmailContent({
          recipientName: recipient.name,
          practiceName: recipient.practiceName ?? "Your practice",
          items: filings.map((row) => filingRowToEmailItem(row, appUrl)),
          appUrl,
          unsubscribeUrl: unsub,
        });
      } else if (data.template === "trial_ending") {
        const ends = new Date(Date.now() + 24 * 60 * 60 * 1000);
        content = trialEndingEmailContent({
          practiceName: recipient.practiceName ?? "Your practice",
          trialEndsAt: ends,
          appUrl,
        });
      } else {
        const subject = (data.subject ?? "").trim();
        const bodyText = (data.bodyText ?? "").trim();
        if (!subject || !bodyText) {
          throw new Error("Subject and message body are required for custom emails.");
        }
        const bodyHtml = (data.bodyHtml ?? bodyText).replace(/\n/g, "<br/>");
        content = customAdminEmailContent({
          subject,
          bodyText,
          bodyHtml,
          unsubscribeUrl: unsub,
        });
      }

      result.previewSubject ??= content.subject;

      if (data.dryRun) {
        result.sent += 1;
        continue;
      }

      await sendTransactionalEmail({
        to: recipient.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
        listUnsubscribeUrl: unsub,
      });
      result.sent += 1;
    } catch (err) {
      result.errors.push(
        `${recipient.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!data.dryRun && result.sent > 0 && isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    await getSupabaseAdmin().from("admin_email_logs").insert({
      sent_by: session.email ?? "admin",
      template_key: data.template,
      subject: result.previewSubject ?? data.subject ?? data.template,
      recipient_count: result.sent,
      recipient_filter: data.recipientFilter,
    });
  }

  return result;
}

export async function unsubscribeByToken(token: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!token.trim()) {
    return { ok: false, message: "Invalid unsubscribe link." };
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Unsubscribe is not available right now." };
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("email_preferences")
    .select("id")
    .eq("unsubscribe_token", token.trim())
    .maybeSingle();
  if (error || !data) {
    return { ok: false, message: "This unsubscribe link is invalid or expired." };
  }
  await supabase
    .from("email_preferences")
    .update({
      filing_reminders: false,
      marketing_emails: false,
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);
  return {
    ok: true,
    message: "You have been unsubscribed from HydraTax filing reminders and marketing emails.",
  };
}
