import type { SessionContext } from "@/server/auth/session";
import { resolveClientEmailSender } from "@/lib/client-email";
import type { MailboxSendMode } from "@/lib/email/mailbox-oauth";
import {
  sendTransactionalEmail,
  type EmailAttachment,
} from "@/server/email/transactional";
import {
  loadConnectedMailbox,
  sendViaConnectedMailbox,
} from "@/server/email/mailbox-send";

export type PracticeOutboundMail = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export type PracticeOutboundResult = {
  delivery: "resend" | "logged" | "mailbox";
  from: string;
  replyTo: string;
  mode: MailboxSendMode;
};

/**
 * Load connected Gmail/Outlook mailbox for a practice, if OAuth completed.
 */
export async function getConnectedOutboundMailbox(
  practiceId: string,
): Promise<{
  address: string;
  displayName: string | null;
  provider: "gmail" | "outlook";
} | null> {
  const mailbox = await loadConnectedMailbox(practiceId);
  if (!mailbox) return null;
  return {
    address: mailbox.address,
    displayName: mailbox.displayName,
    provider: mailbox.provider,
  };
}

/**
 * Send client-facing mail from the connected Channels mailbox when present;
 * otherwise practice-branded HydraTax / Resend delivery.
 */
export async function sendPracticeClientEmail(input: {
  session: SessionContext;
  practiceEmail?: string | null;
  practiceName?: string | null;
  mail: PracticeOutboundMail;
}): Promise<PracticeOutboundResult> {
  const mailbox = await loadConnectedMailbox(input.session.practiceId);

  if (mailbox) {
    const sender = resolveClientEmailSender(input.session, {
      practiceEmail: input.practiceEmail,
      practiceName: input.practiceName ?? input.session.practiceName,
      connectedMailbox: {
        address: mailbox.address,
        displayName: mailbox.displayName,
      },
    });
    try {
      await sendViaConnectedMailbox({
        mailbox,
        fromHeader: sender.from,
        to: input.mail.to,
        subject: input.mail.subject,
        text: input.mail.text,
        html: input.mail.html,
        attachments: input.mail.attachments,
      });
      return {
        delivery: "mailbox",
        from: sender.from,
        replyTo: sender.replyTo,
        mode: "connected_mailbox",
      };
    } catch (err) {
      // Desk UI stays silent; log for operators and fall back to branded send.
      console.error("[email] connected mailbox send failed; falling back", {
        practiceId: input.session.practiceId,
        provider: mailbox.provider,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const branded = resolveClientEmailSender(input.session, {
    practiceEmail: input.practiceEmail,
    practiceName: input.practiceName ?? input.session.practiceName,
    connectedMailbox: null,
  });

  const delivery = await sendTransactionalEmail({
    to: input.mail.to,
    from: branded.from,
    replyTo: branded.replyTo,
    subject: input.mail.subject,
    text: input.mail.text,
    html: input.mail.html,
    attachments: input.mail.attachments,
  });

  return {
    delivery,
    from: branded.from,
    replyTo: branded.replyTo,
    mode: "hydra_branded",
  };
}
