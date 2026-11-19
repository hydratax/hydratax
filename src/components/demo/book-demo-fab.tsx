"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/** Floating Book a demo — public marketing pages only; hidden when signed in. */
export function BookDemoFab() {
  const pathname = usePathname() || "/";
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
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled) setSignedIn(Boolean(session?.user));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hidePath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/filings") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/create-account") ||
    pathname.startsWith("/book-demo") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/payroll") ||
    pathname.startsWith("/self-assessment") ||
    pathname.startsWith("/vat") ||
    pathname.startsWith("/corporation-tax");

  if (hidePath || signedIn === true || signedIn === null) return null;

  return (
    <Link
      href="/book-demo"
      className="fixed bottom-5 left-4 z-[90] inline-flex items-center gap-2 rounded-full border border-sea/30 bg-sea px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-12px_rgba(15,118,110,0.65)] transition hover:bg-sea-deep md:bottom-6 md:left-6"
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs"
        aria-hidden
      >
        ▸
      </span>
      Book a demo
    </Link>
  );
}
