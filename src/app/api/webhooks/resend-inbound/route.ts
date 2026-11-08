import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveClientFromInboundAddresses,
  storeInboundEmailAttachments,
} from "@/server/documents/inbound-email";
import {
  resolvePracticeFromTaskAddresses,
  storeInboundTaskEmail,
} from "@/server/tasks/inbox";

const resendReceivedSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().min(1),
    to: z.array(z.string()).default([]),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    received_for: z.array(z.string()).optional(),
    subject: z.string().optional(),
    attachments: z
      .array(
        z.object({
          id: z.string(),
          filename: z.string().nullable().optional(),
          content_type: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
});

async function fetchResendAttachments(
  emailId: string,
  resendKey: string,
): Promise<
  Array<{ filename: string; contentType: string; bytes: Uint8Array }>
> {
  const listRes = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments`,
    { headers: { Authorization: `Bearer ${resendKey}` } },
  );
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Resend attachments list failed: ${listRes.status} ${text}`);
  }
  const listJson = (await listRes.json()) as {
    data?: Array<{
      filename?: string | null;
      content_type?: string | null;
      download_url?: string | null;
    }>;
  };

  const attachments: Array<{
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }> = [];

  for (const att of listJson.data ?? []) {
    if (!att.download_url) continue;
    const fileRes = await fetch(att.download_url);
    if (!fileRes.ok) continue;
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    attachments.push({
      filename: att.filename || "attachment.bin",
      contentType:
        att.content_type ||
        fileRes.headers.get("content-type") ||
        "application/octet-stream",
      bytes: buf,
    });
  }
  return attachments;
}

async function fetchResendBodyText(
  emailId: string,
  resendKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}`,
      { headers: { Authorization: `Bearer ${resendKey}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      text?: string | null;
      html?: string | null;
      data?: { text?: string | null; html?: string | null };
    };
    const text = json.text ?? json.data?.text ?? null;
    if (text?.trim()) return text.trim();
    const html = json.html ?? json.data?.html ?? null;
    if (!html) return null;
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12000);
  } catch {
    return null;
  }
}

/**
 * Resend inbound:
 * 1) Practice Tasks inbox (hydratax.tasks.*) → Documents / Queries
 * 2) Client document inbox (hydratax.uk.*) → client documents
 *
 * Auth: Authorization: Bearer EMAIL_WEBHOOK_SECRET (or RESEND_WEBHOOK_SECRET).
 */
export async function POST(request: Request) {
  const secret =
    process.env.RESEND_WEBHOOK_SECRET ?? process.env.EMAIL_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const event = resendReceivedSchema.parse(raw);
    const toCandidates = [
      ...event.data.to,
      ...(event.data.cc ?? []),
      ...(event.data.bcc ?? []),
      ...(event.data.received_for ?? []),
    ];

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY is not configured." },
        { status: 500 },
      );
    }

    // Prefer practice Tasks inbox when the To address matches.
    const practice = await resolvePracticeFromTaskAddresses(toCandidates);
    if (practice) {
      const attachments = await fetchResendAttachments(
        event.data.email_id,
        resendKey,
      );
      const bodyText = await fetchResendBodyText(event.data.email_id, resendKey);
      const stored = await storeInboundTaskEmail({
        practice,
        fromAddress: event.data.from,
        subject: event.data.subject,
        bodyText,
        sourceEmailId: event.data.email_id,
        attachments,
      });
      return NextResponse.json({
        ok: true,
        matched: true,
        route: "practice_tasks",
        practiceId: practice.practiceId,
        inboxEmail: practice.inboxEmail,
        documents: stored.documents.length,
        queries: stored.queries.length,
      });
    }

    const client = await resolveClientFromInboundAddresses(toCandidates);
    if (!client) {
      return NextResponse.json({
        ok: true,
        matched: false,
        reason: "No practice Tasks or client document inbox matched the To address.",
        to: toCandidates,
      });
    }

    const attachments = await fetchResendAttachments(
      event.data.email_id,
      resendKey,
    );

    if (attachments.length === 0) {
      return NextResponse.json({
        ok: true,
        matched: true,
        route: "client_documents",
        clientId: client.clientId,
        clientName: client.clientName,
        inboxEmail: client.inboxEmail,
        stored: 0,
        note: "No downloadable attachments on this email.",
      });
    }

    const { stored } = await storeInboundEmailAttachments({
      client,
      fromAddress: event.data.from,
      subject: event.data.subject,
      attachments,
    });

    return NextResponse.json({
      ok: true,
      matched: true,
      route: "client_documents",
      clientId: client.clientId,
      clientName: client.clientName,
      inboxEmail: client.inboxEmail,
      stored: stored.length,
      files: stored.map((s) => s.filename),
    });
  } catch (err) {
    console.error("[resend-inbound]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
