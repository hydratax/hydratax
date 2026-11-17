import type { SessionContext } from "@/server/auth/session";
import { formatDueShort } from "@/lib/filing-due";
import {
  formatFromHeader,
  parseEmailFromHeader,
} from "@/lib/email/from-header";
import type { MailboxSendMode } from "@/lib/email/mailbox-oauth";

export type ClientEmailTemplateVars = {
  client_name: string;
  accounts_due: string;
  company_number: string;
  tax_year: string;
  filing_due: string;
  practice_name: string;
  sender_name: string;
};

export type ClientEmailSender = {
  /** Resend / SMTP From header (display name + verified address until OAuth). */
  from: string;
  replyTo: string;
  senderEmail: string;
  senderName: string;
  mode: MailboxSendMode;
  /** Connected mailbox address when mode is connected_mailbox. */
  connectedAddress?: string;
};

/**
 * Verified HydraTax envelope address (Resend domain). Display name is replaced
 * with the practice name on client mail (middle option).
 */
export function resolveHydraOutboundFrom(): string {
  const configured = (process.env.EMAIL_FROM ?? "").trim();
  if (configured) return configured;
  return "HydraTax <info@hydratax.uk>";
}

export function hydraOutboundAddress(): string {
  return parseEmailFromHeader(resolveHydraOutboundFrom()).address;
}

/**
 * Middle option (default): From shows the practice name, mail is delivered via
 * HydraTax’s verified domain; Reply-To is the practice / user email.
 * When a Gmail/Outlook mailbox is connected, mode becomes connected_mailbox
 * and From uses that address (send path switches later).
 */
export function resolveClientEmailSender(
  session: SessionContext,
  opts?: {
    practiceEmail?: string | null;
    practiceName?: string | null;
    /** Connected OAuth mailbox address, if any. */
    connectedMailbox?: {
      address: string;
      displayName?: string | null;
    } | null;
  },
): ClientEmailSender {
  const practiceEmail = opts?.practiceEmail?.trim() || null;
  const sessionEmail = session.email?.trim() || null;
  const replyTo = practiceEmail || sessionEmail;
  if (!replyTo) {
    throw new Error(
      "Your account has no email address. Sign in with email, or add a practice email under Settings → Practice branding, before sending client messages.",
    );
  }

  const senderName = (
    opts?.practiceName?.trim() ||
    session.practiceName ||
    "HydraTax"
  ).trim();

  const connected = opts?.connectedMailbox?.address?.trim().toLowerCase();
  if (connected) {
    const name =
      opts?.connectedMailbox?.displayName?.trim() || senderName;
    return {
      from: formatFromHeader(name, connected),
      replyTo: connected,
      senderEmail: connected,
      senderName: name,
      mode: "connected_mailbox",
      connectedAddress: connected,
    };
  }

  return {
    from: formatFromHeader(senderName, hydraOutboundAddress()),
    replyTo,
    senderEmail: replyTo,
    senderName,
    mode: "hydra_branded",
  };
}

export function applyClientEmailTemplate(
  template: string,
  vars: ClientEmailTemplateVars,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const normalized = key.toLowerCase() as keyof ClientEmailTemplateVars;
    return vars[normalized] ?? "";
  });
}

export function defaultAccountsReminderTemplate(): string {
  return `Dear {{client_name}},

Our records show that your annual accounts at Companies House are due on {{accounts_due}}.

Please reply if you have any questions or if there is anything you need from us before we prepare the accounts.

Kind regards,
{{sender_name}}
{{practice_name}}`;
}

export function defaultSaReminderTemplate(): string {
  return `Dear {{client_name}},

Your Self Assessment tax return for {{tax_year}} is due online by {{filing_due}}.

Please send us your records for the year (6 April to 5 April) so we can prepare your return. Reply to this email if you have any questions.

Kind regards,
{{sender_name}}
{{practice_name}}`;
}

export function defaultVatReminderTemplate(): string {
  return `Dear {{client_name}},

Your quarterly VAT return for the period ending {{accounts_due}} is due soon.

Please send us your sales and purchase figures (or confirm we may use the digital records we hold) so we can prepare and submit the return.

Kind regards,
{{sender_name}}
{{practice_name}}`;
}

export function buildTemplateVars(input: {
  clientName: string;
  accountsDueIso?: string | null;
  companyNumber?: string | null;
  taxYear?: string | null;
  filingDueIso?: string | null;
  practiceName: string;
  senderName: string;
}): ClientEmailTemplateVars {
  return {
    client_name: input.clientName,
    accounts_due:
      formatDueShort(input.accountsDueIso) ??
      "the deadline shown on Companies House",
    company_number: input.companyNumber ?? "",
    tax_year: input.taxYear ?? "",
    filing_due: formatDueShort(input.filingDueIso) ?? "31 January",
    practice_name: input.practiceName,
    sender_name: input.senderName,
  };
}

export function messagePreview(body: string, max = 240): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
