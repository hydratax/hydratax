import { PRACTICE_TRIAL_DAYS } from "@/lib/trial";
import { PRACTICE_PLAN_PRICE_POUNDS } from "@/lib/pricing";

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<"resend" | "logged"> {
  const resendKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ?? "HydraTax <onboarding@resend.dev>";

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Email provider error: ${err.slice(0, 200)}`);
    }
    return "resend";
  }

  console.info("[email:logged]", {
    to: opts.to,
    subject: opts.subject,
    text: opts.text.slice(0, 200),
  });
  return "logged";
}

export function trialEndingEmailContent(opts: {
  practiceName: string;
  trialEndsAt: Date;
  appUrl: string;
}) {
  const endLabel = opts.trialEndsAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const price = `£${PRACTICE_PLAN_PRICE_POUNDS}`;
  const subject = `Your HydraTax free trial ends tomorrow`;
  const text = `Hi,

Your ${PRACTICE_TRIAL_DAYS}-day HydraTax Practice desk trial for ${opts.practiceName} ends on ${endLabel}.

Tomorrow (day 8) your saved card will be charged ${price}/month unless you cancel before then.

• Keep filing: do nothing — your plan continues automatically.
• Cancel: ${opts.appUrl}/pricing (Plans & billing) or reply to this email.

No Hydra fees applied during your trial. Companies House statutory fees still apply where charged.

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">Your free trial ends tomorrow</h1>
  <p>Your ${PRACTICE_TRIAL_DAYS}-day Practice desk trial for <strong>${opts.practiceName}</strong> ends on <strong>${endLabel}</strong>.</p>
  <p>Tomorrow (day 8) your saved card will be charged <strong>${price}/month</strong> unless you cancel before then.</p>
  <ul>
    <li><strong>Keep filing:</strong> do nothing — your plan continues automatically.</li>
    <li><strong>Cancel:</strong> open <a href="${opts.appUrl}/pricing">Plans &amp; billing</a> before the trial ends.</li>
  </ul>
  <p style="color:#3a4248;font-size:14px;">No Hydra fees applied during your trial. Companies House statutory fees still apply where charged.</p>
  <p style="margin-top:28px;"><a href="${opts.appUrl}/dashboard" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open practice desk</a></p>
</body></html>`;

  return { subject, text, html };
}
