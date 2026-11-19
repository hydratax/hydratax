"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

/** Footer / nav link — hidden when the visitor already has a session. */
export function BookDemoNavLink({
  className,
  children = "Book a demo",
}: {
  className?: string;
  children?: ReactNode;
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

  if (signedIn === true || signedIn === null) return null;

  return (
    <Link href="/book-demo" className={className}>
      {children}
    </Link>
  );
}
