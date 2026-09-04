"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithSupabase } from "@/server/actions/auth";
import { safeReturnPath } from "@/lib/auth-return";
import { messageFromUnknown } from "@/lib/action-error";
import {
  EXISTING_ACCOUNT_SIGN_IN_MESSAGE,
  isExistingAccountAuthError,
} from "@/lib/auth-errors";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import {
  AuthDivider,
  GoogleAuthButton,
} from "@/components/forms/google-auth-button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const confirmHint = searchParams.get("confirm") === "1";
  const resetDone = searchParams.get("reset") === "1";
  const oauthError = searchParams.get("error");
  const oauthFailed = oauthError === "auth";
  const accountExists = oauthError === "account_exists";
  const next = safeReturnPath(searchParams.get("next"));

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && !cancelled) {
          router.replace(next);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const bannerError =
    error ??
    (accountExists
      ? EXISTING_ACCOUNT_SIGN_IN_MESSAGE
      : oauthFailed
        ? "Google sign-in did not finish. If you already have an account with this email, sign in with your password or use Forgot password."
        : null);

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
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push(next);
            router.refresh();
          } catch (err) {
            setError(messageFromUnknown(err, "Sign in failed"));
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

      {resetDone && (
        <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
          Password updated. Sign in with your new password.
        </p>
      )}

      {bannerError && (
        <FormErrorBanner
          error={bannerError}
          title={accountExists ? "Account already exists" : "Sign in blocked"}
        />
      )}

      {(accountExists || oauthFailed) && (
        <p className="text-center text-sm text-ink-soft">
          <Link
            href="/forgot-password"
            className="font-semibold text-sea hover:underline"
          >
            Forgot password?
          </Link>
          {" · "}
          Use email and password below to sign in.
        </p>
      )}

      <GoogleAuthButton
        next={next}
        label="Sign in with Google"
        onError={(msg) => {
          setError(
            isExistingAccountAuthError(msg)
              ? EXISTING_ACCOUNT_SIGN_IN_MESSAGE
              : msg,
          );
        }}
      />
      <AuthDivider />

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
        <span className="flex items-center justify-between gap-2">
          Password
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-sea hover:underline"
          >
            Forgot password?
          </Link>
        </span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2.5 font-normal"
          placeholder="Your password"
        />
      </label>

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
