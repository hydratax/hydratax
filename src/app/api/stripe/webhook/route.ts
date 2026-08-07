import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";
import { recordCheckoutEvent } from "@/server/stripe/orders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = getStripe();
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    if (secret) {
      const sig = req.headers.get("stripe-signature");
      if (!sig) {
        return NextResponse.json({ error: "Missing signature" }, { status: 400 });
      }
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await recordCheckoutEvent(event);
  } catch (err) {
    console.error("[stripe webhook]", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
