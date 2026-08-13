import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";
import {
  attachCheckoutToPractice,
  fulfillCheckoutSession,
} from "@/server/stripe/orders";

export const metadata = {
  title: "Payment successful — HydraTax",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let planLabel = "your plan";
  let email: string | null = null;
  let activated = false;

  if (sessionId && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      planLabel = session.metadata?.planKey?.replace(":", " · ") ?? planLabel;
      email = session.customer_details?.email ?? session.customer_email;
      await fulfillCheckoutSession(sessionId);
      activated = true;

      const { getOptionalSession } = await import("@/server/auth/session");
      const auth = await getOptionalSession();
      if (auth) {
        await attachCheckoutToPractice(sessionId, auth.practiceId);
      }
    } catch {
      /* show generic success */
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 text-center md:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Checkout complete
        </p>
        <h1 className="display mt-3 text-3xl text-ink sm:text-4xl md:text-5xl">
          You&apos;re in
        </h1>
        <p className="mt-4 text-ink-soft">
          Payment received for{" "}
          <span className="font-semibold text-ink">{planLabel}</span>
          {email ? (
            <>
              . We&apos;ll send a receipt to{" "}
              <span className="font-semibold text-ink">{email}</span>.
            </>
          ) : (
            "."
          )}
        </p>
        {activated && (
          <p className="mt-2 text-sm text-sea">
            Your plan is active on this practice desk.
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="btn btn-primary">
            Open desk
          </Link>
          <Link href="/clients" className="btn btn-secondary">
            Go to clients
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
