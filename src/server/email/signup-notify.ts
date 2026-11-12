import { getEnv } from "@/lib/env";
import { platformAdminEmails } from "@/server/auth/admin";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { sendAccountWelcomeEmail } from "@/server/email/account-welcome";

/**
 * Welcome the new user and notify platform admins of the signup.
 * Safe to call when email confirmation is still pending (user may not have a session).
 */
export async function sendSignupEmails(input: {
  to: string;
  firstName?: string | null;
  surname?: string | null;
  practiceName?: string | null;
  orgType?: string | null;
  userId?: string | null;
}): Promise<{
  welcome: "resend" | "logged" | "skipped";
  admin: "resend" | "logged" | "skipped";
}> {
  const welcome = await sendAccountWelcomeEmail({
    to: input.to,
    firstName: input.firstName,
    practiceName: input.practiceName,
  });

  const admins = platformAdminEmails();
  if (!admins.length) {
    console.warn(
      "[email] ADMIN_EMAIL unset — signup admin notify skipped. Set ADMIN_EMAIL in env.",
    );
    return { welcome, admin: "skipped" };
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");

  const name = [input.firstName, input.surname]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const org = (input.orgType ?? "").trim() || "unknown";
  const practice = (input.practiceName ?? "").trim() || "—";

  const subject = `New HydraTax signup — ${input.to}`;
  const text = `New account signup

Email: ${input.to}
Name: ${name || "—"}
Org type: ${org}
Practice: ${practice}
User id: ${input.userId ?? "—"}

Admin: ${appUrl}/admin
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:24px;margin:8px 0 16px;">New account signup</h1>
  <ul style="padding-left:18px;color:#3a4248;">
    <li><strong>Email:</strong> ${escapeHtml(input.to)}</li>
    <li><strong>Name:</strong> ${escapeHtml(name || "—")}</li>
    <li><strong>Org type:</strong> ${escapeHtml(org)}</li>
    <li><strong>Practice:</strong> ${escapeHtml(practice)}</li>
    <li><strong>User id:</strong> ${escapeHtml(input.userId ?? "—")}</li>
  </ul>
  <p style="margin-top:24px;"><a href="${appUrl}/admin" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open admin</a></p>
</body></html>`;

  try {
    const admin = await sendTransactionalEmail({
      to: admins,
      subject,
      text,
      html,
    });
    return { welcome, admin };
  } catch (err) {
    console.error("[email] signup admin notify failed", err);
    return { welcome, admin: "skipped" };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
