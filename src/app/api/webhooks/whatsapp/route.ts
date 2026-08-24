import { NextResponse } from "next/server";
import { ingestInboundMessage } from "@/server/actions/correspondence";

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

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
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

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("[whatsapp webhook]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
