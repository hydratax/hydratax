import Link from "next/link";
import Image from "next/image";
import { SiteFooter } from "@/components/site-footer";
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
      <header className="border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Checkout complete
        </p>
        <h1 className="display mt-3 text-4xl text-ink md:text-5xl">
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
