"use client";

import { useState, useTransition } from "react";
import { money } from "@/lib/format";

export function PayInvoiceButton({
  token,
  amountPence,
}: {
  token: string;
  amountPence: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2 pt-2">
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              const res = await fetch(`/api/pay/${token}/checkout`, {
                method: "POST",
              });
              const json = (await res.json()) as { url?: string; error?: string };
              if (!res.ok || !json.url) {
                setError(json.error || "Could not start payment.");
                return;
              }
              window.location.href = json.url;
            } catch {
              setError("Could not start payment. Try again.");
            }
          });
        }}
      >
        {pending ? "Opening secure checkout…" : `Pay ${money(amountPence)}`}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <p className="text-xs text-ink-soft">
        You will complete payment on Stripe’s secure checkout.
      </p>
    </div>
  );
}
