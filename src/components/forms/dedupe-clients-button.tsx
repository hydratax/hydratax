"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dedupePracticeClients } from "@/server/actions/correspondence";

export function DedupeClientsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Remove duplicate clients that share the same company number? The oldest record for each company is kept.",
            )
          ) {
            return;
          }
          setMessage(null);
          start(async () => {
            const res = await dedupePracticeClients();
            setMessage(
              res.removed === 0
                ? "No duplicates found."
                : `Removed ${res.removed} duplicate client${res.removed === 1 ? "" : "s"}.`,
            );
            router.refresh();
          });
        }}
      >
        {pending ? "Cleaning…" : "Remove duplicates"}
      </button>
      {message && <span className="text-sm text-ink-soft">{message}</span>}
    </div>
  );
}
