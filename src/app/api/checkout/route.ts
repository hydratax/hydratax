import { NextResponse } from "next/server";
import { z } from "zod";
import { isStripeConfigured } from "@/lib/env";
import {
  clientIpFromHeaders,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { resolveDeskCheckoutAuth } from "@/lib/checkout-auth";
import { createStripeCheckoutSession } from "@/server/stripe/checkout-session";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const bodySchema = z.object({
  planKey: z.string().min(1),
  email: z.string().email().optional(),
  chRequestId: z.string().uuid().optional(),
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

  // Public endpoint that creates Stripe sessions: throttle per client IP.
  const limited = rateLimit({
    key: `checkout:${clientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait and try again." },
      { status: 429, headers: { ...NO_STORE, ...rateLimitHeaders(limited) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400, headers: NO_STORE });
  }

  // One-off CH filings must carry the request id so success/webhook can submit.
  if (
    parsed.data.planKey.startsWith("companies-house:") &&
    !parsed.data.chRequestId
  ) {
    return NextResponse.json(
      { error: "Filing request id is required before payment." },
      { status: 400 },
    );
  }

  // Session is optional here (one-off CH filings), but when one exists it must
  // satisfy desk expiry + MFA step-up like every other protected endpoint.
  const { getApiSession, apiSessionErrorResponse } = await import(
    "@/server/auth/api-session"
  );
  const auth = await getApiSession();
  // Expired / missing sessions are treated as anonymous; MFA-pending is refused.
  if (!auth.ok && auth.code === "mfa_required") {
    return apiSessionErrorResponse(auth);
  }
  // Local/demo memory sessions are not real accounts — never send those to Stripe
  // for desk plans (account creation must come first).
  const session =
    auth.ok && auth.session && !auth.session.local ? auth.session : null;

  let chOwnerPracticeId: string | null | undefined;
  if (parsed.data.chRequestId) {
    const { findChRequestPracticeId } = await import(
      "@/server/stripe/ch-request-owner"
    );
    chOwnerPracticeId = await findChRequestPracticeId(parsed.data.chRequestId);
  }

  const resolved = resolveDeskCheckoutAuth({
    session: session
      ? {
          local: session.local,
          practiceId: session.practiceId,
          userId: session.userId,
          email: session.email,
        }
      : null,
    planKey: parsed.data.planKey,
    chRequestId: parsed.data.chRequestId,
    chOwnerPracticeId,
  });

  if (!resolved.ok) {
    if ("needsAuth" in resolved) {
      return NextResponse.json(
        {
          error:
            "Create your HydraTax account first so we can unlock this plan after payment.",
          needsAuth: true,
          planKey: resolved.planKey,
        },
        { status: 401, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status, headers: NO_STORE },
    );
  }

  // Hard assert: never create Stripe Checkout with an empty practice binding.
  if (!resolved.practiceId.trim()) {
    return NextResponse.json(
      {
        error:
          "Create your HydraTax account first so we can unlock this plan after payment.",
        needsAuth: true,
        planKey: parsed.data.planKey,
      },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const result = await createStripeCheckoutSession({
      planKey: parsed.data.planKey,
      email: parsed.data.email || resolved.email || undefined,
      practiceId: resolved.practiceId,
      userId: resolved.userId,
      chRequestId: parsed.data.chRequestId,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    const status = message.includes("Unknown plan") ? 404 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
