"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { requestPasswordReset } from "@/server/actions/auth";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const sent = searchParams.get("sent") === "1";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h1 className="display text-3xl text-ink">Check your email</h1>
        <p className="text-sm text-ink-soft">
          If an account exists for that address, we sent a link to reset your
          password. The link expires after a short time.
        </p>
        <p className="text-center text-sm text-ink-soft">
          <Link href="/sign-in" className="font-semibold text-sea">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            const res = await requestPasswordReset({
              email: String(fd.get("email") ?? ""),
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            window.location.href = res.redirectTo;
          } catch (err) {
            setError(messageFromUnknown(err, "Could not send reset email"));
          }
        });
      }}
    >
      <div>
        <h1 className="display text-3xl text-ink">Forgot password</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      {error ? <FormErrorBanner error={error} title="Reset blocked" /> : null}

      <label className="block text-sm font-semibold text-ink">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
          placeholder="you@firm.co.uk"
        />
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        <Link href="/sign-in" className="font-semibold text-sea">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
