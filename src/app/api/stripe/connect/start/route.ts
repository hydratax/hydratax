import { NextResponse } from "next/server";
import { getApiSession, apiSessionErrorResponse } from "@/server/auth/api-session";
import {
  appBaseUrl,
  isStripeConnectConfigured,
  stripeConnectAuthorizeUrl,
} from "@/server/stripe/connect";
import {
  createStripeConnectState,
  STRIPE_CONNECT_STATE_COOKIE,
  STRIPE_CONNECT_STATE_TTL_SECONDS,
} from "@/server/stripe/connect-oauth-state";
import { isProductionRuntime } from "@/lib/env";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Starts Stripe Connect Standard OAuth for the signed-in practice.
 * Redirects the browser to connect.stripe.com.
 */
export async function GET() {
  const auth = await getApiSession();
  if (!auth.ok) {
    return apiSessionErrorResponse(auth);
  }
  const { session } = auth;
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json(
      { error: "Only practice owners or admins can connect Stripe." },
      { status: 403, headers: NO_STORE },
    );
  }

  if (!isStripeConnectConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/settings/payments?error=connect_not_configured",
        appBaseUrl(),
      ),
    );
  }

  const { state, cookieValue } = createStripeConnectState({
    userId: session.userId,
    practiceId: session.practiceId,
  });
  const redirectUri = `${appBaseUrl()}/api/stripe/connect/callback`;
  const url = stripeConnectAuthorizeUrl({ state, redirectUri });

  const res = NextResponse.redirect(url);
  res.cookies.set(STRIPE_CONNECT_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: isProductionRuntime() || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/stripe/connect",
    maxAge: STRIPE_CONNECT_STATE_TTL_SECONDS,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
