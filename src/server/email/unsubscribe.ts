import { createHmac, randomBytes } from "crypto";

const TOKEN_BYTES = 24;

export function generateUnsubscribeToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Cheap pre-DB sanity/entropy check. Real tokens are 24 random bytes as hex
 * (48 chars, 192 bits). Reject short, odd-charset or low-diversity values
 * (e.g. "aaaa…", "0000…") before touching the database.
 */
export function isPlausibleUnsubscribeToken(token: unknown): token is string {
  if (typeof token !== "string") return false;
  const t = token.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(t)) return false;
  return new Set(t).size >= 10;
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
  company_filing_reminders?: boolean;
  company_filing_reminder_weekday?: number | null;
  company_filing_reminder_started_at?: string | null;
  company_filing_reminder_sent_at?: string | null;
  company_filing_reminder_ends_at?: string | null;
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
