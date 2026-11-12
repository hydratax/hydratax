"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  markMfaVerified,
  resendMfaChallenge,
  verifyMfaCode,
} from "@/server/actions/mfa";
import { safeReturnPath } from "@/lib/auth-return";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { clearNavPending, markNavPending } from "@/components/pending-link";
import { signOutSupabase } from "@/server/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

export function Verify2faForm({
  maskedTo,
  channel,
}: {
  maskedTo?: string | null;
  channel?: "email" | "phone" | "totp" | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeReturnPath(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const via =
    channel === "totp"
      ? "authenticator app"
      : channel === "phone"
        ? "text message"
        : channel === "email"
          ? "email"
          : "message";

  return (
    <form
      className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setInfo(null);
        markNavPending("Verifying…");
        const fd = new FormData(e.currentTarget);
        const code = String(fd.get("code") ?? "");
        start(async () => {
          try {
            if (channel === "totp") {
              if (!isSupabaseConfigured()) {
                clearNavPending();
                setError("Authenticator 2FA needs Supabase Auth.");
                return;
              }
              const supabase = createClient();
              const factors = await supabase.auth.mfa.listFactors();
              if (factors.error) throw factors.error;
              const totpFactor = factors.data.totp.find(
                (f) => f.status === "verified",
              );
              if (!totpFactor) {
                clearNavPending();
                setError("No authenticator app is linked to this account.");
                return;
              }
              const challenge = await supabase.auth.mfa.challenge({
                factorId: totpFactor.id,
              });
              if (challenge.error) throw challenge.error;
              const verify = await supabase.auth.mfa.verify({
                factorId: totpFactor.id,
                challengeId: challenge.data.id,
                code: code.replace(/\s+/g, ""),
              });
              if (verify.error) throw verify.error;
              const marked = await markMfaVerified();
              if (!marked.ok) {
                clearNavPending();
                setError(marked.error ?? "Could not finish verification");
                return;
              }
            } else {
              const res = await verifyMfaCode({ code });
              if (!res.ok) {
                clearNavPending();
                setError(res.error ?? "Incorrect code");
                return;
              }
            }
            // After 2FA, always collect device-trust (and optional 2FA setup nags are upstream).
            const dest = next.startsWith("/secure-device")
              ? next
              : `/secure-device?next=${encodeURIComponent(next)}`;
            router.replace(dest);
            router.refresh();
          } catch (err) {
            clearNavPending();
            setError(err instanceof Error ? err.message : "Verification failed");
          }
        });
      }}
    >
      <div>
        <h1 className="display text-3xl text-ink">Verify it’s you</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {channel === "totp" ? (
            <>
              Enter the 6-digit code from your authenticator app
              {maskedTo ? <> ({maskedTo})</> : null}.
            </>
          ) : (
            <>
              Enter the 6-digit code we sent by {via}
              {maskedTo ? (
                <>
                  {" "}
                  to <span className="font-medium text-ink">{maskedTo}</span>
                </>
              ) : null}
              .
            </>
          )}
        </p>
      </div>

      <FormErrorBanner error={error} title="Code not accepted" />
      {info ? (
        <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
          {info}
        </p>
      ) : null}

      <label className="block text-sm font-semibold text-ink">
        Verification code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          pattern="\d{6}"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal tracking-[0.2em]"
          placeholder="••••••"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={`btn btn-primary w-full ${pending ? "is-pending" : ""}`}
      >
        {pending ? "Checking…" : "Continue"}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {channel !== "totp" ? (
          <button
            type="button"
            className="font-semibold text-sea hover:underline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await resendMfaChallenge();
                if (!res.ok) {
                  setError(res.error ?? "Could not resend");
                  return;
                }
                setInfo(
                  res.maskedTo
                    ? `New code sent to ${res.maskedTo}.`
                    : "New code sent.",
                );
              })
            }
          >
            Resend code
          </button>
        ) : (
          <span className="text-ink-soft">Codes refresh every 30 seconds</span>
        )}
        <button
          type="button"
          className="font-semibold text-ink-soft hover:underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await signOutSupabase();
            })
          }
        >
          Sign out
        </button>
      </div>

      <p className="text-center text-xs text-ink-soft">
        Wrong account?{" "}
        <Link href="/sign-in" className="font-semibold text-sea">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
