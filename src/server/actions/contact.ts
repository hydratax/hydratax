"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { LEGAL_CONTACT_EMAIL, LEGAL_COMPANY } from "@/lib/legal";
import { sendTransactionalEmail } from "@/server/email/transactional";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  subject: z.string().trim().min(3, "Enter a subject").max(160),
  message: z
    .string()
    .trim()
    .min(20, "Please write a bit more detail (at least 20 characters)")
    .max(4000),
  website: z.string().optional().default(""),
  formStartedAt: z.string().optional().default(""),
  challenge: z.string().trim().min(1, "Answer the anti-spam question"),
});

export type ContactFormState = {
  ok: boolean;
  message: string;
};

const recentByKey = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 3;
const MIN_FILL_MS = 4_000;

function prune(timestamps: number[], now: number) {
  return timestamps.filter((t) => now - t < RATE_WINDOW_MS);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const next = prune(recentByKey.get(key) ?? [], now);
  if (next.length >= RATE_MAX) {
    recentByKey.set(key, next);
    return true;
  }
  next.push(now);
  recentByKey.set(key, next);
  return false;
}

function looksLikeSpam(name: string, subject: string, message: string): boolean {
  const blob = `${name}\n${subject}\n${message}`.toLowerCase();
  const linkCount = (blob.match(/https?:\/\//g) ?? []).length;
  if (linkCount >= 3) return true;
  if (
    /\b(crypto|casino|viagra|cialis|seo\s*service|guest\s*post|backlink|onlyfans|telegram\s*@)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  const letters = blob.replace(/[^a-z]/g, "");
  if (letters.length > 40 && blob.split(/\s+/).length < 4) return true;
  return false;
}

function challengeOk(answer: string): boolean {
  const normalised = answer.trim().toLowerCase().replace(/\s+/g, "");
  return normalised === "7" || normalised === "seven";
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function submitContactForm(
  _prev: ContactFormState | null,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    website: formData.get("website") ?? "",
    formStartedAt: formData.get("formStartedAt") ?? "",
    challenge: formData.get("challenge"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const data = parsed.data;

  if (data.website.trim()) {
    return { ok: true, message: "Thanks — your message was received." };
  }

  if (!challengeOk(data.challenge)) {
    return {
      ok: false,
      message: "Anti-spam check failed. Please answer the question and try again.",
    };
  }

  const started = Number(data.formStartedAt);
  if (!Number.isFinite(started) || Date.now() - started < MIN_FILL_MS) {
    return {
      ok: false,
      message: "That was too quick — please take a moment and try again.",
    };
  }
  if (Date.now() - started > 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      message: "This form expired. Refresh the page and try again.",
    };
  }

  if (looksLikeSpam(data.name, data.subject, data.message)) {
    return { ok: true, message: "Thanks — your message was received." };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const rateKey = `${ip}|${data.email.toLowerCase()}`;
  if (isRateLimited(rateKey)) {
    return {
      ok: false,
      message:
        "Too many messages from this address. Please wait a while before trying again.",
    };
  }

  const { name, email, subject, message } = data;
  const text = `New contact form message from the HydraTax website

Name: ${name}
Email: ${email}
Subject: ${subject}
IP: ${ip}

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
    await sendTransactionalEmail({
      to: LEGAL_CONTACT_EMAIL,
      replyTo: email,
      subject: `[HydraTax contact] ${subject}`,
      text,
      html,
    });
    return {
      ok: true,
      message: `Thanks ${name.split(" ")[0]} — your message was sent. We’ll reply by email.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Could not send right now. Please try again shortly.",
    };
  }
}
