import { NextResponse } from "next/server";
import { z } from "zod";
import { isStripeConfigured } from "@/lib/env";
import { createStripeCheckoutSession } from "@/server/stripe/checkout-session";

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

  try {
    const result = await createStripeCheckoutSession({
      planKey: parsed.data.planKey,
      email: sessionEmail,
      practiceId,
      userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    const status = message.includes("Unknown plan") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
