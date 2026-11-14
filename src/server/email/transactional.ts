import { PRACTICE_TRIAL_DAYS } from "@/lib/trial";
import { isProduction, maskEmails } from "@/lib/redact";
import { PRACTICE_PLAN_PRICE_POUNDS, formatGBP } from "@/lib/pricing";
import { describeCheckoutPlan } from "@/lib/checkout-plan-copy";
import { getCheckoutPlan } from "@/lib/checkout-plans";

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file contents */
  content: string;
  contentType?: string;
};

export async function sendTransactionalEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  listUnsubscribeUrl?: string;
  attachments?: EmailAttachment[];
}): Promise<"resend" | "logged"> {
  const resendKey = process.env.RESEND_API_KEY;
  const from =
    opts.from ??
    process.env.EMAIL_FROM ??
    "HydraTax <onboarding@resend.dev>";
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

  if (!process.env.EMAIL_FROM && !opts.from) {
    console.warn(
      "[email] EMAIL_FROM is unset — using onboarding@resend.dev (only delivers to the Resend account owner). Set EMAIL_FROM=HydraTax <info@hydratax.uk> after verifying the domain in Resend.",
    );
  }

  if (resendKey) {
    const headers: Record<string, string> = {};
    if (opts.listUnsubscribeUrl) {
      // RFC 8058 one-click needs a POST-capable endpoint: point the header at
      // /api/unsubscribe (the visible link keeps using the /unsubscribe page).
      const oneClick = opts.listUnsubscribeUrl.replace(
        /\/unsubscribe\?/,
        "/api/unsubscribe?",
      );
      headers["List-Unsubscribe"] = `<${oneClick}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Email provider error: ${err.slice(0, 200)}`);
    }
    return "resend";
  }

  console.warn(
    "[email:logged] RESEND_API_KEY is unset — email was not sent. Set RESEND_API_KEY (and EMAIL_FROM) in Netlify/production env.",
    {
      // Recipients masked; body preview only outside production (it can hold
      // magic links / personal data).
      to: maskEmails(opts.to),
      subject: opts.subject,
      ...(isProduction() ? {} : { text: opts.text.slice(0, 200) }),
      attachments: opts.attachments?.length ?? 0,
    },
  );
  return "logged";
}

export function trialEndingEmailContent(opts: {
  practiceName: string;
  trialEndsAt: Date;
  appUrl: string;
  /** Stored plan key so Enterprise is not billed as Small Firm £79 in copy. */
  planKey?: string | null;
}) {
  const endLabel = opts.trialEndsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const copy = describeCheckoutPlan(opts.planKey ?? "practice:Practice");
  const plan = opts.planKey ? getCheckoutPlan(opts.planKey) : null;
  const priceLabel =
    copy.priceLabel ||
    (plan && plan.amountPence > 0
      ? `${formatGBP(plan.amountPence / 100)}/${plan.interval === "year" ? "year" : "month"}`
      : `£${PRACTICE_PLAN_PRICE_POUNDS}/month`);
  const planTitle = copy.title || "your HydraTax plan";
  const subject = `Your HydraTax free trial ends tomorrow`;
  const text = `Hi,

Your ${PRACTICE_TRIAL_DAYS}-day HydraTax trial for ${opts.practiceName} (${planTitle}) ends on ${endLabel}.

Tomorrow (day 8) your saved card will be charged ${priceLabel} unless you cancel before then.

• Keep the plan: do nothing — billing starts tomorrow on the card saved at checkout.
• Cancel with no charge: ${opts.appUrl}/settings/account before the trial ends.
• Live HMRC / Companies House submit during trial ends the trial and charges now.

Prepare returns freely during the trial; live government submission is not included until billed.

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">Your free trial ends tomorrow</h1>
  <p>Your ${PRACTICE_TRIAL_DAYS}-day trial for <strong>${escapeHtml(opts.practiceName)}</strong> (<strong>${escapeHtml(planTitle)}</strong>) ends on <strong>${endLabel}</strong>.</p>
  <p>Tomorrow (day 8) your saved card will be charged <strong>${escapeHtml(priceLabel)}</strong> unless you cancel before then.</p>
  <ul>
    <li><strong>Keep the plan:</strong> do nothing — billing starts tomorrow on the card saved at checkout.</li>
    <li><strong>Cancel with no charge:</strong> open <a href="${opts.appUrl}/settings/account">Subscription settings</a> before the trial ends.</li>
    <li><strong>Live submit now:</strong> confirming an HMRC or Companies House filing ends the trial and charges your card.</li>
  </ul>
  <p style="color:#3a4248;font-size:14px;">You can prepare returns during the trial; live government submission is not included until billed.</p>
  <p style="margin-top:28px;"><a href="${opts.appUrl}/dashboard" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open practice desk</a></p>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Confirm cancellation while trial access continues until trialEndsAt. */
export function trialCancelledEmailContent(opts: {
  practiceName: string;
  trialEndsAt: Date;
  appUrl: string;
  planKey?: string | null;
}) {
  const endLabel = opts.trialEndsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const copy = describeCheckoutPlan(opts.planKey ?? "practice:Practice");
  const planTitle = copy.title || "your HydraTax plan";
  const subject = "Your HydraTax subscription is cancelled";
  const text = `Hi,

Your HydraTax subscription for ${opts.practiceName} (${planTitle}) has been cancelled. You will not be charged.

You can keep using HydraTax until your free trial ends on ${endLabel}. After that, the desk will lock until you choose a plan again.

Open your desk: ${opts.appUrl}/dashboard
Restart a plan anytime: ${opts.appUrl}/pricing

— HydraTax
`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">Subscription cancelled</h1>
  <p>Your subscription for <strong>${escapeHtml(opts.practiceName)}</strong> (<strong>${escapeHtml(planTitle)}</strong>) has been cancelled. <strong>You will not be charged.</strong></p>
  <p>You can keep using HydraTax until your free trial ends on <strong>${endLabel}</strong>. After that, the desk locks until you choose a plan again.</p>
  <p style="margin-top:28px;"><a href="${opts.appUrl}/dashboard" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open practice desk</a></p>
  <p style="margin-top:16px;"><a href="${opts.appUrl}/pricing" style="color:#0f766e;font-weight:600;">View plans</a></p>
</body></html>`;
  return { subject, text, html };
}
