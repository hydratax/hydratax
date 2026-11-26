"use client";

import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";
import { ScrollOnNavigate } from "@/components/scroll-on-navigate";

/** Top-of-app navigation progress + scroll-to-top / hash landing. */
export function NavPendingReset() {
  return (
    <Suspense fallback={null}>
      <NavProgress />
      <ScrollOnNavigate />
    </Suspense>
  );
}
