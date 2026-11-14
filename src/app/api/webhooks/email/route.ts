import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveClientFromInboundAddresses,
  storeInboundEmailAttachments,
} from "@/server/documents/inbound-email";
import { authorizeBearer } from "@/lib/webhook-auth";
import { logWebhookRejection } from "@/server/privacy/webhook-events";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Hard limits: base64 attachments were previously unbounded. */
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** base64 inflates by 4/3; allow a little slack for padding. */
const MAX_ATTACHMENT_BASE64_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8;
const MAX_TOTAL_BODY_BYTES = 30 * 1024 * 1024;

const inboundSchema = z.object({
  fromEmail: z.string().email().max(320),
  toEmail: z.string().email().max(320).optional(),
  subject: z.string().max(998).optional(),
  bodyText: z.string().max(200_000).optional(),
  externalId: z.string().min(3).max(256),
  sentAt: z.string().max(64).optional(),
  /** Optional base64 attachments (Zapier / forwarder). */
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().max(200).optional(),
        contentBase64: z.string().min(1).max(MAX_ATTACHMENT_BASE64_CHARS),
      }),
    )
    .max(MAX_ATTACHMENTS)
    .optional(),
});

/**
 * Ingest an inbound email (Zapier, forwarder, or sync worker).
 * When To matches a client document inbox (hydratax.uk.{client}@…),
 * attachments are saved onto that client's documents.
 * Auth: Authorization: Bearer EMAIL_WEBHOOK_SECRET (constant-time compare,
 * fails closed with 503 when the secret is not configured).
 */
export async function POST(request: Request) {
  const auth = authorizeBearer(
    request,
    process.env.EMAIL_WEBHOOK_SECRET,
    "Email webhook",
  );
  if (!auth.ok) {
    await logWebhookRejection(
      request,
      "email",
      auth.status === 503 ? "not_configured" : "unauthorised",
    );
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_TOTAL_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }

  try {
    const rawText = await request.text();
    if (rawText.length > MAX_TOTAL_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: NO_STORE },
      );
    }
    const body = inboundSchema.parse(JSON.parse(rawText));
    const client = await resolveClientFromInboundAddresses([body.toEmail]);

    let storedFiles: string[] = [];
    let skippedFiles = 0;
    if (client && body.attachments?.length) {
      const { stored, skipped } = await storeInboundEmailAttachments({
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
      skippedFiles = skipped;
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

    return NextResponse.json(
      {
        ok: true,
        id: messageId,
        matchedClientId,
        matchedClientName,
        inboxEmail: client?.inboxEmail ?? null,
        storedFiles,
        skippedFiles,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    // Log the failure class only — never the request body (PII).
    console.error(
      "[email webhook] failed:",
      err instanceof z.ZodError ? "validation" : err instanceof Error ? err.name : "error",
    );
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof z.ZodError ? "Invalid payload" : "Failed",
      },
      { status: 400, headers: NO_STORE },
    );
  }
}
