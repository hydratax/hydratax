"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteClient } from "@/server/actions/clients";

export function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="panel border-danger/25 p-5">
      <h2 className="display text-2xl text-danger">Remove client</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Permanently removes <span className="font-medium text-ink">{clientName}</span>{" "}
        and all workspace data (books, bank, payroll, documents, filings). This
        cannot be undone.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button
        type="button"
        className="btn btn-secondary mt-4 border-danger/40 text-danger hover:border-danger/60 hover:bg-danger/5"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Remove "${clientName}" and all related data? This cannot be undone.`,
            )
          ) {
            return;
          }
          setError(null);
          start(async () => {
            try {
              await deleteClient(clientId);
              router.push("/clients");
              router.refresh();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not remove client",
              );
            }
          });
        }}
      >
        {pending ? "Removing…" : "Remove client"}
      </button>
    </div>
  );
}
