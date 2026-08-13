"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimPracticeFreeTrial } from "@/server/actions/account";

export function ClaimFreeTrialButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="btn btn-primary text-sm disabled:opacity-60"
      onClick={() => {
        startTransition(async () => {
          const result = await claimPracticeFreeTrial();
          if (result.checkoutUrl) {
            window.location.href = result.checkoutUrl;
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "Opening checkout…" : "Try Practice free (7 days)"}
    </button>
  );
}
