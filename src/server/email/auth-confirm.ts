import { getEnv } from "@/lib/env";
import { safeErr } from "@/lib/redact";
import { sendTransactionalEmail } from "@/server/email/transactional";

/**
 * Send the Supabase signup confirmation link via Resend.
 * Supabase's built-in SMTP (or a misconfigured custom SMTP) often never
 * delivers to real users — this is the reliable path.
 *
 * When `password` is known (fresh signup), generate a true signup confirm link.
 * On resend we only have the email, so use a magic link (signs in + confirms).
 */
export async function sendSignupConfirmEmail(input: {
  email: string;
  firstName?: string | null;
  /** Required for type "signup"; omit on resend and we use magiclink. */
  password?: string;
}): Promise<"resend" | "logged" | "skipped" | "failed"> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return "skipped";

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const admin = getSupabaseAdmin();
    const redirectTo = `${appUrl}/auth/callback`;
    const password = input.password?.trim();

    const { data, error } = password
      ? await admin.auth.admin.generateLink({
          type: "signup",
          email,
          password,
          options: { redirectTo },
        })
      : await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });

    if (error || !data?.properties?.action_link) {
      console.error(
        "[email] generateLink for signup confirm failed",
        safeErr(error ?? new Error("missing action_link")),
      );
      return "failed";
    }

    const link = data.properties.action_link;
    const name = (input.firstName ?? "").trim() || "there";
    const subject = "Confirm your HydraTax account";
    const text = `Hi ${name},

Confirm your email to finish creating your HydraTax account:

${link}

If you did not create this account, you can ignore this email.

— HydraTax
`;
    const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:28px;margin:8px 0 16px;">Confirm your email</h1>
  <p>Hi ${escapeHtml(name)},</p>
  <p>Confirm your email to finish creating your HydraTax account.</p>
  <p style="margin-top:28px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Confirm email</a></p>
  <p style="margin-top:24px;color:#3a4248;font-size:14px;">If the button does not work, paste this link into your browser:<br>${escapeHtml(link)}</p>
  <p style="margin-top:24px;color:#3a4248;font-size:14px;">If you did not create this account, you can ignore this email.</p>
</body></html>`;

    return sendTransactionalEmail({ to: email, subject, text, html });
  } catch (err) {
    console.error("[email] sendSignupConfirmEmail failed", safeErr(err));
    return "failed";
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
