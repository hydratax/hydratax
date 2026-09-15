"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cancelPracticeSubscriptions,
  openBillingPortal,
  type AccountBillingSummary,
} from "@/server/actions/billing";
import { statusLabel } from "@/lib/subscription-features";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function AccountSubscriptionPanel({
  billing,
}: {
  billing: AccountBillingSummary;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!billing.isOwner) return null;

  const hasPlans = billing.subscriptions.length > 0;

  function manageInStripe() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await openBillingPortal();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.assign(res.url);
    });
  }

  function confirmUnsubscribe() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await cancelPracticeSubscriptions();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmCancel(false);
      setMessage(res.message);
      router.refresh();
    });
  }

  return (
    <div className="panel space-y-4 p-5">
      <div>
        <h2 className="display text-2xl text-ink">Subscription</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Plan features for this practice. Only the main account holder can
          change or cancel billing.
        </p>
      </div>

      {!hasPlans ? (
        <div className="rounded-xl border border-line bg-sand/30 px-4 py-3 text-sm text-ink-soft">
          No active subscription yet.{" "}
          <Link href="/pricing" className="font-semibold text-sea hover:underline">
            View plans
          </Link>{" "}
          to start a trial or subscribe.
        </div>
      ) : (
        <ul className="space-y-4">
          {billing.subscriptions.map((sub) => (
            <li
              key={`${sub.planKey}:${sub.status}`}
              className="rounded-xl border border-line bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-ink">{sub.label}</h3>
                <span className="text-xs font-semibold uppercase tracking-wider text-sea">
                  {statusLabel(sub.status, sub.trialEndsAt)}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {sub.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 text-sm text-ink-soft before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-sea before:content-['']"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <FormErrorBanner error={error} />
      {message ? (
        <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {billing.stripeConfigured ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={manageInStripe}
          >
            {pending ? "Opening…" : "Manage billing"}
          </button>
        ) : null}

        {hasPlans ? (
          confirmCancel ? (
            <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:w-auto">
              <p className="text-sm text-ink">
                Cancel at the end of the current period? You keep access until
                then.
              </p>
              <button
                type="button"
                className="btn bg-red-700 text-white hover:bg-red-800"
                disabled={pending}
                onClick={confirmUnsubscribe}
              >
                {pending ? "Cancelling…" : "Confirm unsubscribe"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => setConfirmCancel(false)}
              >
                Keep plan
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn border border-line bg-white text-ink hover:bg-sand"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMessage(null);
                setConfirmCancel(true);
              }}
            >
              Unsubscribe
            </button>
          )
        ) : null}

        <Link href="/pricing" className="btn btn-ghost">
          Change plan
        </Link>
      </div>
    </div>
  );
}
