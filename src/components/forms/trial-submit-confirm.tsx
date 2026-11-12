"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmEndTrialAndCharge,
  getFilingTrialGate,
} from "@/server/actions/billing";
import { FILING_GATE, isFilingGateMessage } from "@/lib/filing-gate";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

/**
 * Detect trial/payment gate errors from submit actions and offer to end the
 * trial (charge card) or open billing settings.
 */
export function useTrialSubmitGate() {
  const [gateError, setGateError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [pending, start] = useTransition();

  function captureSubmitError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (!isFilingGateMessage(message)) return false;
    setGateError(message.replace(/^TRIAL_[A-Z_]+:\s*/, "").replace(/^PAYMENT_METHOD_REQUIRED:\s*/, ""));
    setNeedsConfirm(message.includes(FILING_GATE.TRIAL_BLOCKED));
    setPaymentFailed(
      message.includes(FILING_GATE.PAYMENT_FAILED) ||
        message.includes(FILING_GATE.PAYMENT_METHOD_REQUIRED),
    );
    return true;
  }

  function clearGate() {
    setGateError(null);
    setNeedsConfirm(false);
    setPaymentFailed(false);
  }

  function endTrialThen(
    retry: (opts: { confirmEndTrial: true }) => Promise<void>,
  ) {
    setGateError(null);
    start(async () => {
      const res = await confirmEndTrialAndCharge();
      if (!res.ok) {
        setNeedsConfirm(false);
        setPaymentFailed(true);
        setGateError(res.error);
        return;
      }
      clearGate();
      try {
        await retry({ confirmEndTrial: true });
      } catch (err) {
        if (!captureSubmitError(err)) {
          setGateError(err instanceof Error ? err.message : "Submit failed");
        }
      }
    });
  }

  return {
    gateError,
    needsConfirm,
    paymentFailed,
    pending,
    captureSubmitError,
    clearGate,
    endTrialThen,
    checkOnTrial: getFilingTrialGate,
  };
}

export function TrialSubmitConfirmPanel({
  gateError,
  needsConfirm,
  paymentFailed,
  pending,
  onConfirm,
  onDismiss,
}: {
  gateError: string | null;
  needsConfirm: boolean;
  paymentFailed: boolean;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (!gateError && !needsConfirm && !paymentFailed) return null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-ink">
      <p className="font-semibold text-ink">Live filing &amp; your free trial</p>
      {gateError ? <FormErrorBanner error={gateError} /> : null}
      {needsConfirm ? (
        <>
          <p className="text-ink-soft">
            Preparing returns is included in the trial. Submitting to HMRC or
            Companies House ends the trial now and charges the card saved at
            checkout for your selected plan.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? "Charging card…" : "End trial & charge card"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={pending}
              onClick={onDismiss}
            >
              Keep preparing
            </button>
            <Link
              href="/settings/account"
              className="btn btn-secondary text-sm"
            >
              Cancel trial / change card
            </Link>
          </div>
        </>
      ) : null}
      {paymentFailed ? (
        <p className="text-ink-soft">
          Update your payment method securely via Stripe, then try again.{" "}
          <Link href="/settings/account" className="font-semibold text-sea">
            Open Subscription settings
          </Link>
        </p>
      ) : null}
    </div>
  );
}
