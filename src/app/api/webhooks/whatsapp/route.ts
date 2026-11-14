import { NextResponse } from "next/server";
import { ingestInboundMessage } from "@/server/actions/correspondence";
import { safeEqual, verifyMetaSignature } from "@/lib/webhook-auth";
import { logWebhookRejection } from "@/server/privacy/webhook-events";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Meta WhatsApp Cloud API webhook.
 * Configure callback URL to this route and verify token via WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    expected &&
    token &&
    safeEqual(token, expected) &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  await logWebhookRejection(request, "whatsapp", "verify_token_mismatch");
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request) {
  // Verify Meta's X-Hub-Signature-256 over the RAW body before parsing.
  // Fails closed when the app secret is not configured.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[whatsapp webhook] WHATSAPP_APP_SECRET is not set; refusing event");
    return NextResponse.json(
      { ok: false, error: "Webhook not configured" },
      { status: 503, headers: NO_STORE },
    );
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }
  const rawBody = await request.text();
  if (
    rawBody.length > MAX_BODY_BYTES ||
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    await logWebhookRejection(
      request,
      "whatsapp",
      request.headers.get("x-hub-signature-256")
        ? "invalid_signature"
        : "missing_signature",
    );
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: rawBody.length > MAX_BODY_BYTES ? 413 : 401, headers: NO_STORE },
    );
  }

  try {
    const payload = JSON.parse(rawBody) as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
            messages?: Array<{
              id?: string;
              from?: string;
              timestamp?: string;
              text?: { body?: string };
              type?: string;
            }>;
          };
        }>;
      }>;
    };

    const results: Array<{ id: string; matchedClientName: string | null }> = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];
        for (const msg of messages) {
          if (!msg.from || !msg.id) continue;
          const body =
            msg.type === "text" ? (msg.text?.body ?? "") : `[${msg.type ?? "message"}]`;
          const res = await ingestInboundMessage({
            channel: "whatsapp",
            fromAddress: msg.from,
            bodyText: body,
            externalId: msg.id,
            sentAt: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : undefined,
          });
          results.push({
            id: res.id,
            matchedClientName: res.matchedClientName,
          });
        }
      }
    }

    return NextResponse.json(
      { ok: true, processed: results.length, results },
      { headers: NO_STORE },
    );
  } catch (err) {
    // Class only — message bodies / phone numbers are personal data.
    console.error(
      "[whatsapp webhook] failed:",
      err instanceof Error ? err.name : "error",
    );
    return NextResponse.json(
      { ok: false, error: "Failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
