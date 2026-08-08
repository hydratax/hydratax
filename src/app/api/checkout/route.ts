import { NextResponse } from "next/server";
import { z } from "zod";
import { getCheckoutPlan } from "@/lib/checkout-plans";
import { getEnv, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";

const bodySchema = z.object({
  planKey: z.string().min(1),
  email: z.string().email().optional(),
});

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY to enable payments.",
      },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan = getCheckoutPlan(parsed.data.planKey);
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 404 });
  }

  let practiceId = "";
  let userId = "";
  let sessionEmail = parsed.data.email;
  const { getOptionalSession } = await import("@/server/auth/session");
  const session = await getOptionalSession();
  if (session) {
    practiceId = session.practiceId;
    userId = session.userId;
    sessionEmail = sessionEmail || session.email || undefined;
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const stripe = getStripe();

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: plan.interval === "month" ? "subscription" : "payment",
    customer_email: sessionEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: plan.amountPence,
          product_data: {
            name: plan.name,
            description: plan.description,
          },
          ...(plan.interval === "month"
            ? { recurring: { interval: "month" as const } }
            : {}),
        },
      },
    ],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?cancelled=1`,
    metadata: {
      planKey: plan.key,
      sectionId: plan.sectionId,
      interval: plan.interval,
      practiceId,
      userId,
      email: sessionEmail ?? "",
    },
    allow_promotion_codes: true,
  });

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: "Checkout session missing URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: checkoutSession.url,
    sessionId: checkoutSession.id,
  });
}
