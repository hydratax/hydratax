import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ClearCs01DraftOnSuccess } from "@/components/checkout/clear-cs01-draft";
import { isStripeConfigured } from "@/lib/env";
import { getStripe } from "@/server/stripe/client";
import {
  attachCheckoutToPractice,
  fulfillCheckoutSession,
} from "@/server/stripe/orders";
import type { ChFulfillmentResult } from "@/server/companies-house/fulfill-ch-request";

export const metadata = {
  title: "Payment successful — HydraTax",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; filing?: string }>;
}) {
  const { session_id: sessionId, filing: filingFlag } = await searchParams;
  let planLabel = "your plan";
  let planKey = "";
  let email: string | null = null;
  let activated = false;
  let chFulfillment: ChFulfillmentResult | null = null;
  const isFilingCheckout = filingFlag === "1";

  let fulfillError: string | null = null;

  if (sessionId && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      planKey = session.metadata?.planKey ?? "";
      planLabel = planKey.replace(":", " · ") || planLabel;
      email = session.customer_details?.email ?? session.customer_email;
      await fulfillCheckoutSession(sessionId);
      activated = true;

      const chRequestId = session.metadata?.chRequestId?.trim();
      if (chRequestId && planKey.startsWith("companies-house:")) {
        const { fulfillPaidChRequest } = await import(
          "@/server/companies-house/fulfill-ch-request"
        );
        chFulfillment = await fulfillPaidChRequest({
          requestId: chRequestId,
          customerEmail: email,
          stripeSessionId: sessionId,
        });
        if (!chFulfillment.submitted && chFulfillment.error) {
          fulfillError = chFulfillment.error;
        }
      } else if (
        planKey.startsWith("companies-house:") &&
        !chRequestId
      ) {
        fulfillError =
          "Payment received but filing link was missing — contact support with your receipt.";
      }

      const { getOptionalSession } = await import("@/server/auth/session");
      const auth = await getOptionalSession();
      if (auth) {
        await attachCheckoutToPractice(sessionId, auth.practiceId);
      }
    } catch (err) {
      fulfillError = "fulfillment_failed";
      console.error("[checkout.success] fulfillment failed", err);
    }
  }

  const isCs01 =
    planKey === "companies-house:confirmation-statement" ||
    chFulfillment?.serviceId === "confirmation-statement";
  const submitted = chFulfillment?.submitted ?? false;
  const submitFailed =
    Boolean(fulfillError) ||
    (chFulfillment != null && !chFulfillment.submitted && isCs01);
  const emailSent = chFulfillment?.emailDelivery === "resend";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {isCs01 && submitted && <ClearCs01DraftOnSuccess />}

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 text-center md:py-20">
        {isCs01 || isFilingCheckout ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
              {submitted ? "Submitted to Companies House" : "Payment received"}
            </p>
            <h1 className="display mt-3 text-3xl text-ink sm:text-4xl md:text-5xl">
              {submitted
                ? "Confirmation statement submitted"
                : submitFailed
                  ? "Payment received"
                  : "Processing your filing"}
            </h1>
            <p className="mt-4 text-ink-soft">
              {submitted ? (
                <>
                  Your confirmation statement
                  {chFulfillment?.companyName ? (
                    <>
                      {" "}
                      for{" "}
                      <span className="font-semibold text-ink">
                        {chFulfillment.companyName}
                      </span>
                    </>
                  ) : null}{" "}
                  has been submitted to Companies House. Please allow a few
                  minutes for the register to update.
                </>
              ) : submitFailed ? (
                <>
                  We received your payment for{" "}
                  {chFulfillment?.companyName ? (
                    <span className="font-semibold text-ink">
                      {chFulfillment.companyName}
                    </span>
                  ) : (
                    "your confirmation statement"
                  )}
                  . Your filing is being submitted to Companies House
                  {email && emailSent ? (
                    <>
                      {" "}
                      — we&apos;ve emailed an update to{" "}
                      <span className="font-semibold text-ink">{email}</span>.
                    </>
                  ) : email ? (
                    <>
                      {" "}
                      — we&apos;ll email{" "}
                      <span className="font-semibold text-ink">{email}</span>{" "}
                      once Companies House accepts it.
                    </>
                  ) : (
                    "."
                  )}
                </>
              ) : (
                <>
                  Payment received for{" "}
                  <span className="font-semibold text-ink">
                    confirmation statement
                  </span>
                  . We are submitting to Companies House now.
                </>
              )}
            </p>
            {chFulfillment?.submissionNumber && (
              <p className="mt-2 text-sm text-sea">
                Reference: {chFulfillment.submissionNumber}
              </p>
            )}
            {emailSent && email && (
              <p className="mt-3 text-sm text-ink-soft">
                We emailed confirmation to{" "}
                <span className="font-semibold text-ink">{email}</span>.
              </p>
            )}
            {chFulfillment?.companyNumber && (
              <Link
                href={`https://find-and-update.company-information.service.gov.uk/company/${chFulfillment.companyNumber}`}
                className="mt-4 text-sm font-semibold text-sea underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View company on Companies House
              </Link>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/companies-house/confirmation-statement"
                className="btn btn-secondary"
              >
                File another
              </Link>
              <Link href="/dashboard" className="btn btn-primary">
                Open desk
              </Link>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
