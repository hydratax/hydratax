"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  disconnectPracticeStripeConnect,
  type PaymentGatewayStatus,
} from "@/server/actions/payment-gateways";
import { messageFromUnknown } from "@/lib/action-error";

type MethodId =
  | "card"
  | PaymentGatewayStatus["placeholders"][number]["id"];

export function PaymentGatewaysPanel({
  initial,
  queryConnected,
  queryError,
}: {
  initial: PaymentGatewayStatus;
  queryConnected?: boolean;
  queryError?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState<MethodId>("card");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(
    queryConnected ? "Stripe connected successfully." : null,
  );

  const stripe = initial.stripe;
  const connected = Boolean(stripe.accountId);

  return (
    <div className="space-y-4">
      {queryError ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Could not connect Stripe ({queryError.replace(/_/g, " ")}). Try again
          or check Connect env keys.
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ink">
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="display text-2xl text-ink">Configure payment options</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Connect gateways so clients can pay invoices online. Amounts are in
            £.
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
          <nav className="border-b border-line lg:border-b-0 lg:border-r lg:border-line">
            <button
              type="button"
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm ${
                method === "card"
                  ? "bg-sea/10 font-semibold text-sea"
                  : "text-ink-soft hover:bg-sand/60"
              }`}
              onClick={() => setMethod("card")}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-xs">
                £
              </span>
              <span className="flex-1">Credit / Debit Card</span>
              {connected ? (
                <span className="badge badge-ok text-[10px]">Active</span>
              ) : null}
            </button>
            {initial.placeholders.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm ${
                  method === p.id
                    ? "bg-sea/10 font-semibold text-sea"
                    : "text-ink-soft hover:bg-sand/60"
                }`}
                onClick={() => setMethod(p.id)}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-[10px] uppercase">
                  {p.label.slice(0, 2)}
                </span>
                <span className="flex-1">{p.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-soft">
                  Inactive
                </span>
              </button>
            ))}
          </nav>

          <div className="p-5">
            {method === "card" ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-ink">Credit / Debit Card</h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    Accept Visa and Mastercard through Stripe Connect. Funds go
                    to your connected Stripe account.
                  </p>
                </div>

                <div className="rounded-xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">Stripe</p>
                        <span className="rounded-md bg-sand px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          Preferred gateway
                        </span>
                      </div>
                      <p className="mt-2 max-w-xl text-sm text-ink-soft">
                        One-time invoice payments with automatic reconciliation
                        when Checkout completes. UK cards via Stripe.
                      </p>
                      <p className="mt-2 text-xs text-ink-soft">
                        Online transaction fees:{" "}
                        <a
                          href="https://stripe.com/gb/pricing"
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-sea hover:underline"
                        >
                          View Stripe’s transaction fees
                        </a>
                      </p>
                    </div>
                    {connected ? (
                      <div className="flex flex-col items-end gap-2">
                        <span className="badge badge-ok">Connected</span>
                        <p className="mono text-xs text-ink-soft">
                          {stripe.accountId}
                        </p>
                        {!stripe.chargesEnabled ? (
                          <p className="max-w-[14rem] text-right text-xs text-ink-soft">
                            Finish Stripe onboarding so charges can be enabled.
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-secondary text-sm"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              setError(null);
                              setOk(null);
                              try {
                                await disconnectPracticeStripeConnect();
                                setOk("Stripe disconnected.");
                                router.refresh();
                              } catch (err) {
                                setError(
                                  messageFromUnknown(
                                    err,
                                    "Could not disconnect.",
                                  ),
                                );
                              }
                            })
                          }
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        {initial.connectConfigured ? (
                          <a
                            href="/api/stripe/connect/start"
                            className="btn btn-primary"
                          >
                            Set up now
                          </a>
                        ) : (
                          <span className="btn btn-primary opacity-60" aria-disabled>
                            Set up now
                          </span>
                        )}
                        {!initial.connectConfigured ? (
                          <p className="max-w-[16rem] text-right text-xs text-ink-soft">
                            Add{" "}
                            <span className="mono">STRIPE_CONNECT_CLIENT_ID</span>{" "}
                            and{" "}
                            <span className="mono">STRIPE_SECRET_KEY</span> on
                            the server to enable Connect.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-ink-soft">
                  After connecting, enable “Online pay” on an invoice so clients
                  get a card payment link.
                </p>
              </div>
            ) : (
              <div>
                <h3 className="font-semibold text-ink">
                  {
                    initial.placeholders.find((p) => p.id === method)?.label
                  }
                </h3>
                <p className="mt-2 text-sm text-ink-soft">
                  Not available yet. Card payments via Stripe are the supported
                  UK path today.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-ink-soft">
        Invoice branding and bank details stay under{" "}
        <Link href="/settings/letterhead" className="font-semibold text-sea">
          Practice branding
        </Link>
        .
      </p>
    </div>
  );
}
