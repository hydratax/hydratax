import { createHmac, randomBytes } from "crypto";

const TOKEN_BYTES = 24;

export function generateUnsubscribeToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function unsubscribeUrl(token: string, appUrl: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Sign one-off tokens for admin preview links (optional). */
export function signUnsubscribePayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

export type EmailPreferenceRow = {
  id: string;
  user_id: string;
  practice_id: string | null;
  filing_reminders: boolean;
  marketing_emails: boolean;
  unsubscribe_token: string;
  filing_reminder_sent_at: string | null;
  unsubscribed_at: string | null;
};

export function isSubscribedToFilingReminders(pref: EmailPreferenceRow | null): boolean {
  if (!pref) return true;
  if (pref.unsubscribed_at) return false;
  return pref.filing_reminders !== false;
}

export function isSubscribedToMarketing(pref: EmailPreferenceRow | null): boolean {
  if (!pref) return true;
  if (pref.unsubscribed_at) return false;
  return pref.marketing_emails !== false;
}
