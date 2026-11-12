"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmDeviceTrust,
  skipTwoFactorSuggestion,
} from "@/server/actions/session-policy";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { BrandLogo } from "@/components/brand-logo";
import { clearNavPending, markNavPending } from "@/components/pending-link";

export function SecureDeviceForm({
  nextPath,
  suggest2fa,
}: {
  nextPath: string;
  suggest2fa: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [show2fa, setShow2fa] = useState(suggest2fa);

  function finish(trusted: boolean) {
    setError(null);
    markNavPending(trusted ? "Trusting device…" : "Continuing…");
    start(async () => {
      try {
        const res = await confirmDeviceTrust({
          trusted,
          nextPath,
        });
        if (!res.ok) {
          clearNavPending();
          setError(res.error ?? "Could not save device preference");
          return;
        }
        router.replace(res.redirectTo);
        router.refresh();
      } catch (err) {
        clearNavPending();
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function skip2fa() {
    setError(null);
    start(async () => {
      try {
        await skipTwoFactorSuggestion();
        setShow2fa(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not skip");
      }
    });
  }

  return (
    <div className="w-full max-w-md space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sea/10 ring-1 ring-sea/20">
          <BrandLogo href={null} size="lg" showWordmark={false} priority />
        </div>
        <h1 className="display text-3xl text-ink">Trust this device?</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Choose how long to stay signed in on this browser.
        </p>
      </div>

      <FormErrorBanner error={error} />

      <ul className="space-y-3 text-sm text-ink text-left">
        <li className="rounded-xl border border-line px-4 py-3">
          <p className="font-semibold">Trust this device</p>
          <p className="mt-1 text-ink-soft">
            Stay signed in for <span className="font-medium text-ink">7 days</span>{" "}
            on this browser. Use only on a personal computer.
          </p>
        </li>
        <li className="rounded-xl border border-line px-4 py-3">
          <p className="font-semibold">Don&apos;t trust this device</p>
          <p className="mt-1 text-ink-soft">
            We&apos;ll sign you out automatically after{" "}
            <span className="font-medium text-ink">10 hours</span>. Prefer this on
            shared or public computers.
          </p>
        </li>
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={pending}
          onClick={() => finish(true)}
        >
          {pending ? "Saving…" : "Trust this device"}
        </button>
        <button
          type="button"
          className="btn btn-secondary flex-1"
          disabled={pending}
          onClick={() => finish(false)}
        >
          Don&apos;t trust
        </button>
      </div>

      {show2fa ? (
        <div className="rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-left">
          <p className="font-semibold text-ink">Protect your account with 2FA</p>
          <p className="mt-1 text-ink-soft">
            You&apos;ve signed in a few times. Turn on two-factor authentication
            so a stolen password alone can&apos;t open your desk.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                markNavPending("Opening 2FA settings…");
                start(async () => {
                  try {
                    const res = await confirmDeviceTrust({
                      trusted: false,
                      nextPath: "/settings/account#two-factor",
                    });
                    if (!res.ok) {
                      clearNavPending();
                      setError(res.error ?? "Could not continue");
                      return;
                    }
                    router.replace(res.redirectTo);
                    router.refresh();
                  } catch (err) {
                    clearNavPending();
                    setError(
                      err instanceof Error ? err.message : "Something went wrong",
                    );
                  }
                });
              }}
            >
              Set up 2FA
            </button>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={pending}
              onClick={skip2fa}
            >
              Skip for now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
