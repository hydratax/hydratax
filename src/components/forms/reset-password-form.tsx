"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updatePasswordWithSupabase } from "@/server/actions/auth";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            const res = await updatePasswordWithSupabase({
              password: String(fd.get("password") ?? ""),
              confirmPassword: String(fd.get("confirmPassword") ?? ""),
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            window.location.href = res.redirectTo;
          } catch (err) {
            setError(messageFromUnknown(err, "Could not update password"));
          }
        });
      }}
    >
      <div>
        <h1 className="display text-3xl text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Choose a new password for your HydraTax account.
        </p>
      </div>

      {error ? <FormErrorBanner error={error} title="Update blocked" /> : null}

      <label className="block text-sm font-semibold text-ink">
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
          placeholder="At least 8 characters"
        />
      </label>

      <label className="block text-sm font-semibold text-ink">
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
          placeholder="Repeat password"
        />
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Update password"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        <Link href="/sign-in" className="font-semibold text-sea">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
