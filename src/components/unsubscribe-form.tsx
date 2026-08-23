"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { unsubscribeByToken } from "@/server/actions/admin-email";

export function UnsubscribeForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="panel space-y-4 p-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Email preferences
      </p>
      <h1 className="display text-3xl text-ink">
        {ok === true
          ? "Unsubscribed"
          : ok === false
            ? "Could not unsubscribe"
            : "Unsubscribe from reminders"}
      </h1>
      {message ? (
        <p className="text-ink-soft">{message}</p>
      ) : (
        <p className="text-ink-soft">
          Stop receiving filing reminder summaries and marketing emails from
          HydraTax. Transactional account emails may still be sent.
        </p>
      )}
      {ok == null ? (
        <button
          type="button"
          disabled={pending}
          className="btn btn-primary mt-2"
          onClick={() =>
            start(async () => {
              const result = await unsubscribeByToken(token);
              setOk(result.ok);
              setMessage(result.message);
            })
          }
        >
          {pending ? "Processing…" : "Confirm unsubscribe"}
        </button>
      ) : null}
      <Link href="/" className="btn btn-secondary mt-4 inline-flex">
        Back to HydraTax
      </Link>
    </div>
  );
}
