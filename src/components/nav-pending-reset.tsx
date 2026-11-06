"use client";

import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";

/** Top-of-app navigation progress (completes when the destination route is ready). */
export function NavPendingReset() {
  return (
    <Suspense fallback={null}>
      <NavProgress />
    </Suspense>
  );
}
