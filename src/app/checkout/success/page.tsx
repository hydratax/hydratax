import { safeErr } from "@/lib/redact";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PendingLink } from "@/components/pending-link";
import { ClearCs01DraftOnSuccess } from "@/components/checkout/clear-cs01-draft";
import { isStripeConfigured } from "@/lib/env";
import { getChService } from "@/lib/ch-services";
import { describeCheckoutPlan } from "@/lib/checkout-plan-copy";
import { getStripe } from "@/server/stripe/client";
import {
  attachCheckoutToPractice,
  fulfillCheckoutSession,
} from "@/server/stripe/orders";
import type { ChFulfillmentResult } from "@/server/companies-house/fulfill-ch-request";

export const metadata = {
  title: "Payment successful — HydraTax",
};

function filingLabel(serviceId: string | null | undefined, planKey: string) {
  const fromService = serviceId ? getChService(serviceId)?.title : null;
  if (fromService) return fromService;
  if (planKey.startsWith("companies-house:")) {
    const id = planKey.slice("companies-house:".length);
    return getChService(id)?.title ?? "Companies House filing";
  }
  return "Companies House filing";
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    filing?: string;
    free?: string;
    service?: string;
    ref?: string;
  }>;
}) {
  const {
    session_id: sessionId,
    filing: filingFlag,
    free: freeFlag,
    service: freeService,
    ref: freeRef,
  } = await searchParams;
  let planKey = "";
  let email: string | null = null;
  let emailDelivery: "resend" | "logged" | "skipped" | null = null;
  let trialEndsAt: string | null = null;
  let chFulfillment: ChFulfillmentResult | null = null;
  const isFilingCheckout = filingFlag === "1";
  const isFreeFiling = freeFlag === "1" && isFilingCheckout;

  let fulfillError: string | null = null;

  if (isFreeFiling) {
    planKey = `companies-house:${freeService || "accounts-ixbrl"}`;
    chFulfillment = {
      ok: true,
      requestId: "",
      serviceId: freeService || "accounts-ixbrl",
      companyNumber: null,
      companyName: null,
      paymentMarked: true,
      submitted: true,
      submissionNumber: freeRef || null,
      emailDelivery: "skipped",
    };
  } else if (sessionId && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      planKey = session.metadata?.planKey ?? "";
      email = session.customer_details?.email ?? session.customer_email;

      const order = await fulfillCheckoutSession(sessionId);

      if (
        order &&
        "trialEndsAt" in order &&
        typeof (order as { trialEndsAt?: string | null }).trialEndsAt === "string"
      ) {
        trialEndsAt = (order as { trialEndsAt: string }).trialEndsAt;
      } else if (Number(session.metadata?.trialDays ?? 0) > 0) {
        const { practiceTrialEndsAt } = await import("@/lib/trial");
        trialEndsAt = practiceTrialEndsAt().toISOString();
      }

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
      } else if (planKey.startsWith("companies-house:") && !chRequestId) {
        fulfillError =
          "Payment received but filing link was missing — contact support with your receipt.";
      } else if (email && !planKey.startsWith("companies-house:")) {
        const { sendSubscriptionWelcomeEmail } = await import(
          "@/server/email/subscription-welcome"
        );
        emailDelivery = await sendSubscriptionWelcomeEmail({
          to: email,
          planKey,
          stripeSessionId: sessionId,
          trialEndsAt,
        });
      }

      const { getOptionalSession } = await import("@/server/auth/session");
      const auth = await getOptionalSession();
      if (auth) {
        await attachCheckoutToPractice(sessionId, auth.practiceId);
      }
    } catch (err) {
      fulfillError = "fulfillment_failed";
      console.error("[checkout.success] fulfillment failed", safeErr(err));
    }
  }

  const { getOptionalSession } = await import("@/server/auth/session");
  const signedIn = Boolean(await getOptionalSession());

  const serviceId =
    chFulfillment?.serviceId ||
    (planKey.startsWith("companies-house:")
      ? planKey.slice("companies-house:".length)
      : "");
  const isCs01 = serviceId === "confirmation-statement";
  const isAccounts = serviceId === "accounts-ixbrl";
  const serviceTitle = filingLabel(serviceId, planKey);
  const submitted = chFulfillment?.submitted ?? false;
  const submitFailed =
    Boolean(fulfillError) ||
    (chFulfillment != null && !chFulfillment.submitted);
  const chEmailSent = chFulfillment?.emailDelivery === "resend";
  const deskEmailSent = emailDelivery === "resend";
  const fileAnotherHref = isAccounts
    ? "/companies-house/accounts-ixbrl"
    : isCs01
      ? "/companies-house/confirmation-statement"
      : "/companies-house";

  const planCopy = describeCheckoutPlan(planKey);
  const trialEndsLabel = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {isCs01 && submitted && <ClearCs01DraftOnSuccess />}

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 text-center md:py-20">
        {planKey.startsWith("companies-house:") || isFilingCheckout ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
              {submitted ? "Submitted to Companies House" : "Payment received"}
            </p>
            <h1 className="display mt-3 text-3xl text-ink sm:text-4xl md:text-5xl">
              {submitted
                ? `${serviceTitle} submitted`
                : submitFailed
                  ? "Payment received"
                  : "Processing your filing"}
            </h1>
            <p className="mt-4 text-ink-soft">
              {submitted ? (
                <>
                  Your {serviceTitle.toLowerCase()}
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
                  <span className="font-semibold text-ink">
                    {serviceTitle.toLowerCase()}
                  </span>
                  {chFulfillment?.companyName ? (
                    <>
                      {" "}
                      for{" "}
                      <span className="font-semibold text-ink">
                        {chFulfillment.companyName}
                      </span>
                    </>
                  ) : null}
                  . Your filing could not be completed automatically
                  {fulfillError && fulfillError !== "fulfillment_failed"
                    ? ` (${fulfillError})`
                    : ""}
                  {email && chEmailSent ? (
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
                    {serviceTitle.toLowerCase()}
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
            {chEmailSent && email && (
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
              <Link href={fileAnotherHref} className="btn btn-secondary">
                File another
              </Link>
              <PendingLink
                href="/dashboard"
                className="btn btn-primary"
                pendingLabel="Opening desk…"
              >
                Open desk
              </PendingLink>
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
              Payment received for your{" "}
              <span className="font-semibold text-ink">{planCopy.title}</span>
              {planCopy.priceLabel ? (
                <>
                  {" "}
                  ({planCopy.priceLabel})
                </>
              ) : null}
              .
            </p>

            {planCopy.lines.length > 0 && (
              <ul className="mt-6 w-full max-w-md space-y-2 rounded-xl border border-line bg-panel/60 px-5 py-4 text-left text-sm text-ink">
                {planCopy.lines.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sea" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}

            {trialEndsLabel && (
              <p className="mt-4 text-sm text-ink-soft">
                Free trial until{" "}
                <span className="font-semibold text-ink">{trialEndsLabel}</span>
                — no Hydra fees while you trial. Billing starts after that.
              </p>
            )}

            {email && (
              <p className="mt-3 text-sm text-ink-soft">
                {deskEmailSent ? (
                  <>
                    Confirmation emailed to{" "}
                    <span className="font-semibold text-ink">{email}</span>.
                  </>
                ) : emailDelivery === "logged" ? (
                  <>
                    We&apos;ll send confirmation to{" "}
                    <span className="font-semibold text-ink">{email}</span>{" "}
                    once email delivery is configured.
                  </>
                ) : (
                  <>
                    Receipt available for{" "}
                    <span className="font-semibold text-ink">{email}</span>.
                  </>
                )}
              </p>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {signedIn ? (
                <>
                  <PendingLink
                    href="/dashboard"
                    className="btn btn-primary"
                    pendingLabel="Opening desk…"
                  >
                    Open desk
                  </PendingLink>
                  <Link href="/settings/account" className="btn btn-secondary">
                    Manage billing
                  </Link>
                </>
              ) : (
                <>
                  <PendingLink
                    href={`/create-account?${new URLSearchParams({
                      ...(email ? { email } : {}),
                      ...(sessionId ? { checkout: sessionId } : {}),
                      next: "/dashboard",
                    }).toString()}`}
                    className="btn btn-primary"
                    pendingLabel="Opening…"
                  >
                    Create login to open desk
                  </PendingLink>
                  <Link
                    href={`/sign-in?${new URLSearchParams({
                      ...(email ? { email } : {}),
                      next: "/dashboard",
                    }).toString()}`}
                    className="btn btn-secondary"
                  >
                    Already have an account? Sign in
                  </Link>
                </>
              )}
            </div>
            {!signedIn ? (
              <p className="mt-4 text-sm text-ink-soft">
                Use the same email
                {email ? (
                  <>
                    {" "}
                    (<span className="font-semibold text-ink">{email}</span>)
                  </>
                ) : null}{" "}
                so we can attach this payment to your practice.
              </p>
            ) : null}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
