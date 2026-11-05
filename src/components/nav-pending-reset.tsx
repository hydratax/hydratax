"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearNavPending } from "@/components/pending-link";

/** Drops the "Opening…" banner once the next page is on screen. */
export function NavPendingReset() {
  const pathname = usePathname();

  useEffect(() => {
    clearNavPending();
  }, [pathname]);

  return null;
}
