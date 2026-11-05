import { describeCheckoutPlan } from "@/lib/checkout-plan-copy";
import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/server/email/transactional";

const emailedSessions = new Set<string>();

/**
 * Welcome / payment confirmation for desk subscriptions (not CH one-offs).
 * Idempotent per Stripe checkout session id within this process.
 */
export async function sendSubscriptionWelcomeEmail(input: {
  to: string;
  planKey: string;
  stripeSessionId: string;
  trialEndsAt?: string | null;
}): Promise<"resend" | "logged" | "skipped"> {
  if (!input.to?.includes("@")) return "skipped";
  if (input.planKey.startsWith("companies-house:")) return "skipped";
  if (emailedSessions.has(input.stripeSessionId)) return "skipped";

  const copy = describeCheckoutPlan(input.planKey);
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");

  const linesBlock =
    copy.lines.length > 0
      ? copy.lines.map((l) => `• ${l}`).join("\n")
      : "• Access your practice desk and selected HMRC modules";

  const trialNote = input.trialEndsAt
    ? `\nYour free trial runs until ${new Date(input.trialEndsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}. You can cancel anytime before then.\n`
    : "";

  const priceLine = copy.priceLabel
    ? `\nAmount: ${copy.priceLabel} (${copy.billing.toLowerCase()})\n`
    : `\nBilling: ${copy.billing}\n`;

  const subject = `You're in — ${copy.title}`;
  const text = `Hi,

Thanks for choosing HydraTax. Your payment is confirmed.

Plan: ${copy.title}
${priceLine}
What's included:
${linesBlock}
${trialNote}
Open your desk: ${appUrl}/dashboard

If you have any questions, reply to this email.

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">You're in</h1>
  <p>Thanks for choosing HydraTax. Your payment is confirmed.</p>
  <p style="margin:20px 0;padding:16px;background:#f6f8f9;border-radius:12px;">
    <strong style="display:block;font-size:18px;">${escapeHtml(copy.title)}</strong>
    ${copy.priceLabel ? `<span style="color:#3a4248;font-size:14px;">${escapeHtml(copy.priceLabel)} · ${escapeHtml(copy.billing)}</span>` : `<span style="color:#3a4248;font-size:14px;">${escapeHtml(copy.billing)}</span>`}
  </p>
  <p style="font-weight:600;margin-bottom:8px;">What's included</p>
  <ul style="margin:0;padding-left:1.2em;color:#3a4248;">
    ${copy.lines.map((l) => `<li style="margin-bottom:6px;">${escapeHtml(l)}</li>`).join("") || "<li>Practice desk access</li>"}
  </ul>
  ${
    input.trialEndsAt
      ? `<p style="margin-top:16px;color:#3a4248;font-size:14px;">Free trial until <strong>${escapeHtml(
          new Date(input.trialEndsAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        )}</strong>. Cancel anytime before then.</p>`
      : ""
  }
  <p style="margin-top:28px;"><a href="${appUrl}/dashboard" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open practice desk</a></p>
</body></html>`;

  const delivery = await sendTransactionalEmail({
    to: input.to,
    subject,
    text,
    html,
  });
  emailedSessions.add(input.stripeSessionId);
  return delivery;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
