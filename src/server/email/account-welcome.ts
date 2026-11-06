import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/server/email/transactional";

/**
 * Welcome email after a new HydraTax account is created (not Stripe checkout).
 */
export async function sendAccountWelcomeEmail(input: {
  to: string;
  firstName?: string | null;
  practiceName?: string | null;
}): Promise<"resend" | "logged" | "skipped"> {
  const to = input.to?.trim();
  if (!to?.includes("@")) return "skipped";

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");

  const name = (input.firstName ?? "").trim() || "there";
  const practice = (input.practiceName ?? "").trim();

  const subject = "Welcome to HydraTax";
  const text = `Hi ${name},

Your HydraTax account is ready${practice ? ` for ${practice}` : ""}.

Open your practice desk: ${appUrl}/dashboard

From there you can add clients, connect HMRC, and file CT600, VAT, PAYE, Self Assessment and Companies House returns.

If you did not create this account, reply to this email and we will help.

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">Welcome to HydraTax</h1>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your HydraTax account is ready${practice ? ` for <strong>${escapeHtml(practice)}</strong>` : ""}.</p>
  <p style="margin-top:28px;"><a href="${appUrl}/dashboard" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open practice desk</a></p>
  <p style="margin-top:24px;color:#3a4248;font-size:14px;">If you did not create this account, reply to this email and we will help.</p>
</body></html>`;

  return sendTransactionalEmail({ to, subject, text, html });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
