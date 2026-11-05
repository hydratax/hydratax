import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveClientFromInboundAddresses,
  storeInboundEmailAttachments,
} from "@/server/documents/inbound-email";

const inboundSchema = z.object({
  fromEmail: z.string().email(),
  toEmail: z.string().email().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  externalId: z.string().min(3),
  sentAt: z.string().optional(),
  /** Optional base64 attachments (Zapier / forwarder). */
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string().optional(),
        contentBase64: z.string().min(1),
      }),
    )
    .optional(),
});

/**
 * Ingest an inbound email (Zapier, forwarder, or sync worker).
 * When To matches a client document inbox (hydratax.uk.{client}@…),
 * attachments are saved onto that client's documents.
 * Auth: Authorization: Bearer EMAIL_WEBHOOK_SECRET
 */
export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = inboundSchema.parse(await request.json());
    const client = await resolveClientFromInboundAddresses([body.toEmail]);

    let storedFiles: string[] = [];
    if (client && body.attachments?.length) {
      const { stored } = await storeInboundEmailAttachments({
        client,
        fromAddress: body.fromEmail,
        subject: body.subject,
        attachments: body.attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType || "application/octet-stream",
          bytes: Uint8Array.from(Buffer.from(a.contentBase64, "base64")),
        })),
      });
      storedFiles = stored.map((s) => s.filename);
    }

    // Best-effort communications log (session-backed path may be unavailable).
    let messageId: string | null = null;
    let matchedClientId = client?.clientId ?? null;
    let matchedClientName = client?.clientName ?? null;
    try {
      const { ingestInboundMessage } = await import(
        "@/server/actions/correspondence"
      );
      const res = await ingestInboundMessage({
        channel: "email",
        fromAddress: body.fromEmail,
        toAddress: body.toEmail,
        subject: body.subject,
        bodyText: body.bodyText,
        externalId: body.externalId,
        sentAt: body.sentAt,
      });
      messageId = res.id;
      matchedClientId = res.matchedClientId ?? matchedClientId;
      matchedClientName = res.matchedClientName ?? matchedClientName;
    } catch {
      /* document filing above is the primary outcome */
    }

    return NextResponse.json({
      ok: true,
      id: messageId,
      matchedClientId,
      matchedClientName,
      inboxEmail: client?.inboxEmail ?? null,
      storedFiles,
    });
  } catch (err) {
    console.error("[email webhook]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
