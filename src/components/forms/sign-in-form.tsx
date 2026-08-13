"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithSupabase } from "@/server/actions/auth";
import { safeReturnPath } from "@/lib/auth-return";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmHint = searchParams.get("confirm") === "1";
  const next = safeReturnPath(searchParams.get("next"));

  return (
    <form
      className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            const res = await signInWithSupabase({
              email: String(fd.get("email") ?? ""),
              password: String(fd.get("password") ?? ""),
            });
            router.push(next);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign in failed");
          }
        });
      }}
    >
      <div>
        <h1 className="display text-3xl text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Access your HydraTax practice desk.
        </p>
      </div>

      {confirmHint && (
        <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
          Check your email to confirm the account, then sign in here.
        </p>
      )}

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

      <label className="block text-sm font-semibold text-ink">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
          placeholder="Your password"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        No account?{" "}
        <Link
          href={`/create-account?next=${encodeURIComponent(next)}`}
          className="font-semibold text-sea"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
