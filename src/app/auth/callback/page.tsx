"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth-return";
import { finishOAuthSignup } from "@/server/actions/oauth-finish";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function clearAuthIntentCookies() {
  document.cookie = "ht_auth_next=; Path=/; Max-Age=0";
  document.cookie = "ht_auth_org=; Path=/; Max-Age=0";
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const code = searchParams.get("code");
      const oauthError = searchParams.get("error");
      const next = safeReturnPath(
        searchParams.get("next") || readCookie("ht_auth_next"),
      );
      const orgType = searchParams.get("org_type") || readCookie("ht_auth_org");

      const fail = () => {
        clearAuthIntentCookies();
        if (!cancelled) {
          router.replace(`/sign-in?error=auth&next=${encodeURIComponent(next)}`);
        }
      };

      if (oauthError) {
        fail();
        return;
      }

      if (!code) {
        fail();
        return;
      }

      try {
        const supabase = createClient();
        // Must run in the browser — PKCE verifier lives in client storage/cookies
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/callback] exchange failed", error.message);
          fail();
          return;
        }

        if (!cancelled) setStatus("Setting up your account…");
        await finishOAuthSignup(orgType);
        clearAuthIntentCookies();

        if (!cancelled) {
          router.replace(next);
          router.refresh();
        }
      } catch (err) {
        console.error("[auth/callback]", err);
        fail();
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-sea border-t-transparent"
        aria-hidden
      />
      <p className="text-sm font-medium text-ink">{status}</p>
      <p className="text-xs text-ink-soft">Please wait a moment.</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink-soft">
          Signing you in…
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
