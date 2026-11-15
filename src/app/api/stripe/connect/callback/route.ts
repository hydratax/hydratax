import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/server/auth/api-session";
import { resolveAuthOrigin } from "@/lib/auth-origin";
import { isProductionRuntime } from "@/lib/env";
import { appendAuditEvent } from "@/server/audit/log";
import { savePracticeStripeConnect } from "@/server/actions/payment-gateways";
import {
  exchangeStripeConnectCode,
  fetchConnectAccountFlags,
} from "@/server/stripe/connect";
import {
  STRIPE_CONNECT_STATE_COOKIE,
  verifyStripeConnectState,
} from "@/server/stripe/connect-oauth-state";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";

function clearStateCookie(res: NextResponse) {
  res.cookies.set(STRIPE_CONNECT_STATE_COOKIE, "", {
    httpOnly: true,
    secure: isProductionRuntime() || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/stripe/connect",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const origin = resolveAuthOrigin(req);
  const redirectTo = (path: string) =>
    clearStateCookie(NextResponse.redirect(new URL(path, origin)));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const auth = await getApiSession();
  if (!auth.ok) {
    if (auth.code === "mfa_required") {
      return redirectTo("/verify-2fa?next=%2Fsettings%2Fpayments");
    }
    return redirectTo("/sign-in?next=%2Fsettings%2Fpayments");
  }
  const { session } = auth;

  if (error) {
    const safe = /^[a-z_]{1,40}$/.test(error) ? error : "stripe_error";
    return redirectTo(`/settings/payments?error=${encodeURIComponent(safe)}`);
  }

  if (!code || !state) {
    await logSecurityEvent({
      type: "auth.stripe_connect_rejected",
      severity: "low",
      actorUserId: session.userId,
      practiceId: session.practiceId,
      ip: clientIpFromHeaders(req.headers),
      throttleKey: `stripe-connect:${session.userId}:missing`,
      details: { reason: "missing_code_or_state" },
    });
    return redirectTo("/settings/payments?error=missing_code");
  }

  const payload = verifyStripeConnectState(
    state,
    req.cookies.get(STRIPE_CONNECT_STATE_COOKIE)?.value,
    session.userId,
  );
  if (!payload || payload.practiceId !== session.practiceId) {
    await logSecurityEvent({
      type: "auth.stripe_connect_rejected",
      severity: "medium",
      actorUserId: session.userId,
      practiceId: session.practiceId,
      ip: clientIpFromHeaders(req.headers),
      throttleKey: `stripe-connect:${session.userId}:bad_state`,
      details: { reason: "bad_state" },
    });
    return redirectTo("/settings/payments?error=bad_state");
  }

  if (session.role !== "owner" && session.role !== "admin") {
    return redirectTo("/settings/payments?error=forbidden");
  }

  try {
    const { stripeUserId } = await exchangeStripeConnectCode(code);
    let chargesEnabled = false;
    let detailsSubmitted = false;
    try {
      const flags = await fetchConnectAccountFlags(stripeUserId);
      chargesEnabled = flags.chargesEnabled;
      detailsSubmitted = flags.detailsSubmitted;
    } catch {
      /* account may still be completing onboarding */
    }

    await savePracticeStripeConnect({
      accountId: stripeUserId,
      chargesEnabled,
      detailsSubmitted,
    });

    await appendAuditEvent({
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "stripe.connect_linked",
      entityType: "practice",
      entityId: session.practiceId,
      detail: { accountId: stripeUserId, chargesEnabled, detailsSubmitted },
    });

    return redirectTo("/settings/payments?connected=1");
  } catch (err) {
    console.error(
      "[stripe connect]",
      err instanceof Error ? err.message : "exchange failed",
    );
    return redirectTo("/settings/payments?error=exchange_failed");
  }
}
