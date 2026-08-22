"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

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
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-ink">{status}</p>
      <p className="mt-2 text-xs text-ink-soft">Please wait…</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
          <p className="text-sm text-ink-soft">Signing you in…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
