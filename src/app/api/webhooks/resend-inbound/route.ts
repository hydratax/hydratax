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
import { bearerMatches, verifySvixSignature } from "@/lib/webhook-auth";
import { logWebhookRejection } from "@/server/privacy/webhook-events";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024; // event JSON only (attachments are fetched)
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const RESEND_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Only follow download URLs on https (never file:/http:/internal schemes). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Read a response body but abort once it exceeds `max` bytes. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// Bounds: the body is already signature-verified and capped at 1 MiB, but keep
// every string / array bounded so a (compromised) sender cannot make us do
// unbounded address resolution or DB lookups.
const MAX_ADDRESSES = 50;
const addressSchema = z.string().max(320);
const addressListSchema = z.array(addressSchema).max(MAX_ADDRESSES);

const resendReceivedSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({
    email_id: z.string().min(1).max(128),
    from: z.string().min(1).max(998),
    to: addressListSchema.default([]),
    cc: addressListSchema.optional(),
    bcc: addressListSchema.optional(),
    received_for: addressListSchema.optional(),
    subject: z.string().max(998).optional(),
    attachments: z
      .array(
        z.object({
          id: z.string().max(128),
          filename: z.string().max(512).nullable().optional(),
          content_type: z.string().max(255).nullable().optional(),
        }),
      )
      .max(MAX_ATTACHMENTS * 2)
      .optional(),
  }),
});

async function fetchResendAttachments(
  emailId: string,
  resendKey: string,
): Promise<
  Array<{ filename: string; contentType: string; bytes: Uint8Array }>
> {
  if (!RESEND_ID.test(emailId)) throw new Error("Invalid email id");
  const listRes = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    { headers: { Authorization: `Bearer ${resendKey}` } },
  );
  if (!listRes.ok) {
    throw new Error(`Resend attachments list failed: ${listRes.status}`);
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

  let totalBytes = 0;
  for (const att of (listJson.data ?? []).slice(0, MAX_ATTACHMENTS)) {
    if (!att.download_url || !isHttpsUrl(att.download_url)) continue;
    const fileRes = await fetch(att.download_url).catch(() => null);
    if (!fileRes?.ok) continue;
    const buf = await readCapped(
      fileRes,
      Math.min(MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES - totalBytes),
    );
    if (!buf) continue;
    totalBytes += buf.byteLength;
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
    if (!RESEND_ID.test(emailId)) return null;
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
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
 * Webhook auth. Preferred: Svix signature (svix-id / svix-timestamp /
 * svix-signature, HMAC-SHA256, 5 min tolerance) verified with
 * RESEND_WEBHOOK_SECRET (`whsec_…`). Alternative for forwarders (Zapier etc.):
 * `Authorization: Bearer EMAIL_WEBHOOK_SECRET` (or a non-`whsec_`
 * RESEND_WEBHOOK_SECRET). All comparisons are constant-time; if nothing is
 * configured the endpoint answers 503 (fail closed).
 */
function authorizeResendWebhook(
  request: Request,
  rawBody: string,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const resendSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const emailSecret = process.env.EMAIL_WEBHOOK_SECRET?.trim();
  const svixSecret = resendSecret?.startsWith("whsec_") ? resendSecret : undefined;
  const bearerSecrets = [
    emailSecret,
    resendSecret && !svixSecret ? resendSecret : undefined,
  ].filter((s): s is string => Boolean(s));

  if (!svixSecret && bearerSecrets.length === 0) {
    return { ok: false, status: 503, error: "Webhook secret is not configured" };
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (svixId || svixTimestamp || svixSignature) {
    const ok = verifySvixSignature({
      secret: svixSecret,
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
      rawBody,
    });
    return ok ? { ok: true } : { ok: false, status: 401, error: "Invalid signature" };
  }

  const authz = request.headers.get("authorization");
  if (bearerSecrets.some((s) => bearerMatches(authz, s))) return { ok: true };
  return { ok: false, status: 401, error: "Unauthorized" };
}

/**
 * Resend inbound:
 * 1) Practice Tasks inbox (hydratax.tasks.*) → Documents / Queries
 * 2) Client document inbox (hydratax.uk.*) → client documents
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }
  // Signature verification needs the RAW body, so read text first.
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }

  const auth = authorizeResendWebhook(request, rawBody);
  if (!auth.ok) {
    await logWebhookRejection(
      request,
      "resend",
      auth.status === 503 ? "not_configured" : "invalid_signature",
    );
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  try {
    const raw = JSON.parse(rawBody) as unknown;
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
    // Log the failure class only — never bodies or addresses (PII).
    console.error(
      "[resend-inbound] failed:",
      err instanceof Error ? err.name : "error",
    );
    return NextResponse.json(
      { ok: false, error: "Failed" },
      { status: 400, headers: NO_STORE },
    );
  }
}
