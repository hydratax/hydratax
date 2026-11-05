import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveClientFromInboundAddresses,
  storeInboundEmailAttachments,
} from "@/server/documents/inbound-email";

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

/**
 * Resend inbound: email.received → match hydratax.uk.{client}@… → client documents.
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

    const client = await resolveClientFromInboundAddresses(toCandidates);
    if (!client) {
      return NextResponse.json({
        ok: true,
        matched: false,
        reason: "No client document inbox matched the To address.",
        to: toCandidates,
      });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json(
        { ok: false, error: "RESEND_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const listRes = await fetch(
      `https://api.resend.com/emails/receiving/${event.data.email_id}/attachments`,
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

    if (attachments.length === 0) {
      return NextResponse.json({
        ok: true,
        matched: true,
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
