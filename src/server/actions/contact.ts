"use server";

import { z } from "zod";
import { LEGAL_CONTACT_EMAIL, LEGAL_COMPANY } from "@/lib/legal";
import { sendTransactionalEmail } from "@/server/email/transactional";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  subject: z.string().trim().min(1, "Enter a subject").max(160),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(4000),
  /** Honeypot — bots often fill this; humans leave it empty */
  company: z.string().optional().default(""),
});

export type ContactFormState = {
  ok: boolean;
  message: string;
  delivery?: "resend" | "logged" | "mailto";
};

export async function submitContactForm(
  _prev: ContactFormState | null,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    company: formData.get("company") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  // Bot filled the honeypot
  if (parsed.data.company.trim()) {
    return { ok: true, message: "Thanks — we’ll be in touch shortly.", delivery: "logged" };
  }

  const { name, email, subject, message } = parsed.data;
  const text = `New contact form message from the HydraTax website

Name: ${name}
Email: ${email}
Subject: ${subject}

${message}
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">${LEGAL_COMPANY.tradingName} · Contact</p>
  <h1 style="font-size:22px;margin:8px 0 16px;">Website enquiry</h1>
  <p><strong>Name:</strong> ${escapeHtml(name)}<br/>
  <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br/>
  <strong>Subject:</strong> ${escapeHtml(subject)}</p>
  <div style="white-space:pre-wrap;border-top:1px solid #d0d7dd;padding-top:16px;margin-top:16px;">${escapeHtml(message)}</div>
</body></html>`;

  try {
    const delivery = await sendTransactionalEmail({
      to: LEGAL_CONTACT_EMAIL,
      replyTo: email,
      subject: `[HydraTax contact] ${subject}`,
      text,
      html,
    });
    return {
      ok: true,
      message:
        delivery === "resend"
          ? `Thanks ${name.split(" ")[0]} — your message was sent to ${LEGAL_CONTACT_EMAIL}. We’ll reply soon.`
          : `Thanks ${name.split(" ")[0]} — your message was received. We’ll reply to ${email} soon.`,
      delivery,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : `Could not send right now. Email us directly at ${LEGAL_CONTACT_EMAIL}.`,
    };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
