import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";
import { recordCheckoutEvent } from "@/server/stripe/orders";
import { logWebhookRejection } from "@/server/privacy/webhook-events";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Stripe signatures are small; refuse oversized bodies before reading them. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Fails CLOSED: an event is only processed when it carries a valid
 * `Stripe-Signature` for STRIPE_WEBHOOK_SECRET. Missing secret => 503 (so
 * Stripe retries once ops configure it), missing/invalid signature => 400.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set; refusing event");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    await logWebhookRejection(req, "stripe", "missing_signature");
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400, headers: NO_STORE },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: NO_STORE },
    );
  }

  let event: Stripe.Event;
  try {
    // Verifies HMAC + timestamp tolerance over the RAW body.
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    await logWebhookRejection(req, "stripe", "invalid_signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    await recordCheckoutEvent(event);
  } catch (err) {
    console.error("[stripe webhook]", event.id, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Handler failed" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ received: true }, { headers: NO_STORE });
}
