"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { LEGAL_CONTACT_EMAIL, LEGAL_COMPANY } from "@/lib/legal";
import { requireSession } from "@/server/auth/session";
import { sendTransactionalEmail } from "@/server/email/transactional";

const SCREENSHOT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024;

const ticketSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Describe the issue in a few words (at least 10 characters)")
    .max(4000),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

export type SupportTicketState = {
  ok: boolean;
  message: string;
  ticketId?: string;
};

const recentByUser = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 8;

function prune(timestamps: number[], now: number) {
  return timestamps.filter((t) => now - t < RATE_WINDOW_MS);
}

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const next = prune(recentByUser.get(userId) ?? [], now);
  if (next.length >= RATE_MAX) {
    recentByUser.set(userId, next);
    return true;
  }
  next.push(now);
  recentByUser.set(userId, next);
  return false;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeTicketId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HT-${stamp}-${rand}`;
}

function extensionForType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

/** Raise an in-app support ticket → info@hydratax.uk, Reply-To the raiser. */
export async function submitSupportTicket(
  _prev: SupportTicketState | null,
  formData: FormData,
): Promise<SupportTicketState> {
  const session = await requireSession();

  const replyTo = session.email?.trim() || null;
  if (!replyTo) {
    return {
      ok: false,
      message:
        "Your account has no email on file. Add one under Account settings, then try again.",
    };
  }

  if (isRateLimited(session.userId)) {
    return {
      ok: false,
      message: "Too many tickets from this account. Please wait a while and try again.",
    };
  }

  const parsed = ticketSchema.safeParse({
    description: formData.get("description"),
    pageUrl: formData.get("pageUrl") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const file = formData.get("screenshot");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      message: "Attach a screenshot of the issue screen.",
    };
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return {
      ok: false,
      message: "Screenshot must be 4 MB or smaller.",
    };
  }
  const contentType = file.type || "application/octet-stream";
  if (!SCREENSHOT_TYPES.has(contentType)) {
    return {
      ok: false,
      message: "Screenshot must be PNG, JPG, WebP or GIF.",
    };
  }

  const ticketId = makeTicketId();
  const { description, pageUrl } = parsed.data;
  const h = await headers();
  const pathHint =
    pageUrl?.trim() ||
    h.get("referer") ||
    "unknown page";

  const buf = Buffer.from(await file.arrayBuffer());
  const safeName =
    file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 80) ||
    `screenshot.${extensionForType(contentType)}`;

  const text = `HydraTax support ticket ${ticketId}

Raised by: ${replyTo}
Practice: ${session.practiceName} (${session.practiceId})
Role: ${session.role}
Page: ${pathHint}

Issue
-----
${description}

Reply to this email to respond directly to the team member who raised it.
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">${LEGAL_COMPANY.tradingName} · Support ticket</p>
  <h1 style="font-size:22px;margin:8px 0 16px;">${escapeHtml(ticketId)}</h1>
  <p><strong>Raised by:</strong> <a href="mailto:${escapeHtml(replyTo)}">${escapeHtml(replyTo)}</a><br/>
  <strong>Practice:</strong> ${escapeHtml(session.practiceName)}<br/>
  <strong>Role:</strong> ${escapeHtml(session.role)}<br/>
  <strong>Page:</strong> ${escapeHtml(pathHint)}</p>
  <div style="white-space:pre-wrap;border-top:1px solid #d0d7dd;padding-top:16px;margin-top:16px;">${escapeHtml(description)}</div>
  <p style="margin-top:24px;font-size:13px;color:#3a4248;">Reply to this email to respond directly to the team member who raised it. Screenshot attached.</p>
</body></html>`;

  try {
    await sendTransactionalEmail({
      to: LEGAL_CONTACT_EMAIL,
      replyTo,
      subject: `[HydraTax ticket ${ticketId}] Issue report`,
      text,
      html,
      attachments: [
        {
          filename: safeName,
          content: buf.toString("base64"),
          contentType,
        },
      ],
    });
    return {
      ok: true,
      ticketId,
      message: `Ticket ${ticketId} sent. We’ll reply to ${replyTo}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Could not send the ticket right now. Please try again shortly.",
    };
  }
}
