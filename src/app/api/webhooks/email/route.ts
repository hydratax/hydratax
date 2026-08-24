import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestInboundMessage } from "@/server/actions/correspondence";

const inboundSchema = z.object({
  fromEmail: z.string().email(),
  toEmail: z.string().email().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  externalId: z.string().min(3),
  sentAt: z.string().optional(),
});

/**
 * Ingest an inbound email (from a sync worker, Zapier, or forwarding parser).
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
    const res = await ingestInboundMessage({
      channel: "email",
      fromAddress: body.fromEmail,
      toAddress: body.toEmail,
      subject: body.subject,
      bodyText: body.bodyText,
      externalId: body.externalId,
      sentAt: body.sentAt,
    });
    return NextResponse.json({
      ok: true,
      id: res.id,
      matchedClientId: res.matchedClientId,
      matchedClientName: res.matchedClientName,
    });
  } catch (err) {
    console.error("[email webhook]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
