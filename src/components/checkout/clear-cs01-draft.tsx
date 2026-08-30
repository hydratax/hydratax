"use client";

import { useEffect } from "react";
import { clearCs01Draft } from "@/lib/cs01-checkout-draft";

/** Clear CS01 local draft after a successful one-off filing checkout. */
export function ClearCs01DraftOnSuccess() {
  useEffect(() => {
    clearCs01Draft();
  }, []);
  return null;
}
