"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshStaleClientsCompaniesHouse } from "@/server/actions/clients";

export function RefreshCompaniesHouseButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await refreshStaleClientsCompaniesHouse({
                force: true,
                limit: 25,
              });
              setMessage(
                result.refreshed > 0
                  ? `Updated ${result.refreshed} from Companies House`
                  : "No companies refreshed — check API key",
              );
              router.refresh();
            } catch (err) {
              setMessage(
                err instanceof Error ? err.message : "Refresh failed",
              );
            }
          });
        }}
      >
        {pending ? "Refreshing…" : "Refresh from Companies House"}
      </button>
      {message ? (
        <p className="text-xs text-ink-soft" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
