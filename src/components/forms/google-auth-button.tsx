"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

type OrgType = "company" | "sole_trader" | "partnership" | "practice";

function setAuthIntentCookies(next: string, orgType?: OrgType) {
  const maxAge = 600;
  // Keep redirectTo allowlist-safe (no query string on callback URL).
  document.cookie = `ht_auth_next=${encodeURIComponent(next)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  if (orgType) {
    document.cookie = `ht_auth_org=${encodeURIComponent(orgType)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } else {
    document.cookie = `ht_auth_org=; Path=/; Max-Age=0`;
  }
}

export function GoogleAuthButton({
  next = "/dashboard",
  orgType,
  label = "Continue with Google",
}: {
  next?: string;
  orgType?: OrgType;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isSupabaseConfigured()) return null;

  async function startGoogle() {
    setError(null);
    setPending(true);
    try {
      const destination = next.startsWith("/") ? next : "/dashboard";
      setAuthIntentCookies(destination, orgType);

      const supabase = createClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Must match Supabase Auth → URL configuration allowlist exactly
          // (wildcards like https://hydratax.uk/auth/callback** also work).
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "online",
            prompt: "select_account",
          },
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setPending(false);
        return;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setError("Could not start Google sign-in. Check Supabase Google provider settings.");
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void startGoogle()}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-sand disabled:opacity-60"
      >
        <GoogleMark />
        {pending ? "Redirecting to Google…" : label}
      </button>
      {error ? (
        <p className="text-center text-xs text-ink-soft" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l.1.1 6.2 5.2C37.2 38.7 44 34 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
