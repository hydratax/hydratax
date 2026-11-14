"use client";

import { useState, useTransition } from "react";
import { cancelDeletionWithToken } from "@/server/actions/privacy";

export function CancelDeletionForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<
    "idle" | "cancelled" | "invalid" | "error"
  >("idle");

  if (result === "cancelled") {
    return (
      <p className="mt-6 text-sm text-ink">
        Deletion cancelled. Your account and data are unchanged — you can sign
        in as normal.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {result === "invalid" ? (
        <p className="text-sm text-danger">
          This link is no longer valid — the deletion may already have been
          cancelled or completed.
        </p>
      ) : null}
      {result === "error" ? (
        <p className="text-sm text-danger">
          Something went wrong. Please try again.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelDeletionWithToken(token);
            setResult(
              !res.ok ? "error" : res.cancelled ? "cancelled" : "invalid",
            );
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel deletion and keep my account"}
      </button>
    </div>
  );
}
