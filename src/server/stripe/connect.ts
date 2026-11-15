import { getEnv, isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";

/** Platform Stripe Connect client id (ca_…) for Standard OAuth. */
export function getStripeConnectClientId(): string | null {
  return process.env.STRIPE_CONNECT_CLIENT_ID?.trim() || null;
}

export function isStripeConnectConfigured(): boolean {
  return isStripeConfigured() && Boolean(getStripeConnectClientId());
}

export function stripeConnectAuthorizeUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const clientId = getStripeConnectClientId();
  if (!clientId) {
    throw new Error(
      "STRIPE_CONNECT_CLIENT_ID is not set. Add your Stripe Connect platform client id.",
    );
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeStripeConnectCode(code: string): Promise<{
  stripeUserId: string;
  scope: string | null;
}> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured");
  }
  const stripe = getStripe();
  const result = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  const stripeUserId = result.stripe_user_id;
  if (!stripeUserId) {
    throw new Error("Stripe Connect did not return an account id");
  }
  return {
    stripeUserId,
    scope: result.scope ?? null,
  };
}

export async function fetchConnectAccountFlags(accountId: string): Promise<{
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
  };
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    getEnv().NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
