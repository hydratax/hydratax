"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { refreshStaleClientsCompaniesHouse } from "@/server/actions/clients";

/** Gap between Companies House batches (ms) — keeps under CH rate limits. */
const BATCH_GAP_MS = 2.5 * 60 * 1000;
const BATCH_SIZE = 25;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatGap(ms: number) {
  const mins = Math.round(ms / 60000);
  return mins <= 1 ? "about 1 minute" : `${mins} minutes`;
}

/**
 * Runs a full Companies House sweep: batch of 25, wait 2–3 minutes, next batch,
 * until every limited company has been checked. Shown only to admins / Companies desk.
 */
export function RefreshCompaniesHouseButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            stop();
            const ac = new AbortController();
            abortRef.current = ac;
            startTransition(async () => {
              let offset = 0;
              let totalRefreshed = 0;
              let totalFailed = 0;
              let batchNo = 0;
              try {
                while (!ac.signal.aborted) {
                  batchNo += 1;
                  setMessage(
                    batchNo === 1
                      ? "Refreshing Companies House… first batch"
                      : `Refreshing batch ${batchNo}…`,
                  );
                  const result = await refreshStaleClientsCompaniesHouse({
                    force: true,
                    limit: BATCH_SIZE,
                    offset,
                    requireCompaniesDesk: true,
                  });
                  totalRefreshed += result.refreshed;
                  totalFailed += result.failed;
                  router.refresh();

                  if (result.nextOffset == null) {
                    setMessage(
                      result.totalTargets === 0
                        ? "No limited companies to refresh"
                        : `Done — checked ${result.totalTargets} compan${
                            result.totalTargets === 1 ? "y" : "ies"
                          } (${totalRefreshed} updated${
                            totalFailed ? `, ${totalFailed} failed` : ""
                          })`,
                    );
                    break;
                  }

                  const done = result.nextOffset;
                  const left = result.totalTargets - done;
                  setMessage(
                    `Batch ${batchNo} done (${done}/${result.totalTargets}). Waiting ${formatGap(
                      BATCH_GAP_MS,
                    )} before the next ${Math.min(BATCH_SIZE, left)}…`,
                  );
                  offset = result.nextOffset;
                  await sleep(BATCH_GAP_MS, ac.signal);
                }
              } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                  setMessage(
                    `Stopped — updated ${totalRefreshed} so far. Press refresh to continue later.`,
                  );
                } else {
                  setMessage(
                    err instanceof Error ? err.message : "Refresh failed",
                  );
                }
              } finally {
                if (abortRef.current === ac) abortRef.current = null;
              }
            });
          }}
        >
          {pending ? "Refreshing…" : "Refresh from Companies House"}
        </button>
        {pending ? (
          <button
            type="button"
            className="btn btn-secondary text-danger"
            onClick={stop}
          >
            Stop
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="max-w-sm text-right text-xs text-ink-soft" role="status">
          {message}
        </p>
      ) : (
        <p className="max-w-sm text-right text-[11px] text-ink-soft">
          Checks every company in batches of {BATCH_SIZE}, with a{" "}
          {formatGap(BATCH_GAP_MS)} gap between batches.
        </p>
      )}
    </div>
  );
}
