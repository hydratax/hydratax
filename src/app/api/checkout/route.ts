import { NextResponse } from "next/server";
import { z } from "zod";
import { isStripeConfigured } from "@/lib/env";
import {
  clientIpFromHeaders,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";
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

  let practiceId = "";
  let userId = "";
  let sessionEmail = parsed.data.email;
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
  if (session) {
    practiceId = session.practiceId;
    userId = session.userId;
    sessionEmail = sessionEmail || session.email || undefined;
  }

  // chRequestId must reference a real filing request; when signed in it must
  // belong to the caller's practice (prevents attaching payment to, or probing,
  // other practices' requests).
  if (parsed.data.chRequestId) {
    const { findChRequestPracticeId } = await import(
      "@/server/stripe/ch-request-owner"
    );
    const ownerPracticeId = await findChRequestPracticeId(
      parsed.data.chRequestId,
    );
    if (!ownerPracticeId) {
      return NextResponse.json(
        { error: "Filing request not found." },
        { status: 404, headers: NO_STORE },
      );
    }
    if (session && ownerPracticeId !== session.practiceId) {
      return NextResponse.json(
        { error: "Filing request not found." },
        { status: 404, headers: NO_STORE },
      );
    }
    // Anonymous one-off payment: bind to the request's own practice.
    if (!session) practiceId = ownerPracticeId;
  }

  // Desk / module subscriptions always bind to a practice — create account first.
  // Companies House one-offs already carry chRequestId from an authenticated wizard.
  const isChFiling =
    parsed.data.planKey.startsWith("companies-house:") &&
    Boolean(parsed.data.chRequestId);
  if (!session && !isChFiling) {
    return NextResponse.json(
      {
        error:
          "Create your HydraTax account first so we can unlock this plan after payment.",
        needsAuth: true,
        planKey: parsed.data.planKey,
      },
      { status: 401 },
    );
  }

  try {
    const result = await createStripeCheckoutSession({
      planKey: parsed.data.planKey,
      email: sessionEmail,
      practiceId,
      userId,
      chRequestId: parsed.data.chRequestId,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    const status = message.includes("Unknown plan") ? 404 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
