"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Public header auth links — show desk link when signed in instead of always Sign in.
 */
export function PublicAuthLinks({
  signInClass,
  signUpClass,
  deskClass,
  dark = false,
}: {
  signInClass: string;
  signUpClass: string;
  deskClass?: string;
  dark?: boolean;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSignedIn(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setSignedIn(Boolean(user));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === null) {
    // Avoid flashing Sign up while we check the session (esp. mobile header).
    return (
      <span
        className={`inline-block h-9 w-20 animate-pulse rounded-lg ${
          dark ? "bg-white/15" : "bg-sand"
        }`}
        aria-hidden
      />
    );
  }

  if (signedIn) {
    return (
      <Link
        href="/dashboard"
        className={deskClass ?? signUpClass}
      >
        Open desk
      </Link>
    );
  }

  return (
    <>
      <Link href="/sign-in" className={signInClass}>
        Sign in
      </Link>
      <Link href="/create-account" className={signUpClass}>
        Sign up
      </Link>
    </>
  );
}
