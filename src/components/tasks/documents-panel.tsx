"use client";

import { useMemo, useState, useTransition } from "react";
import {
  allocateDocumentToClient,
  markTaskDone,
} from "@/server/actions/tasks";
import type { PracticeTask } from "@/lib/practice-tasks";

type ClientOption = { id: string; name: string };

export function DocumentsPanel({
  tasks,
  clients,
}: {
  tasks: PracticeTask[];
  clients: ClientOption[];
}) {
  const [filter, setFilter] = useState<"unallocated" | "allocated" | "all">(
    "unallocated",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "unallocated") {
      return tasks.filter((t) => t.status === "unallocated");
    }
    return tasks.filter((t) => t.status === "allocated" || t.status === "done");
  }, [tasks, filter]);

  function allocate(taskId: string) {
    const clientId = selections[taskId];
    if (!clientId) {
      setError("Choose a company first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await allocateDocumentToClient({ taskId, clientId });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not allocate.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Allocate each file to the right company. It is copied into that
          client&apos;s documents once assigned.
        </p>
        <div className="flex gap-1 rounded-lg border border-line bg-white p-1 text-xs">
          {(
            [
              ["unallocated", "Unallocated"],
              ["allocated", "Allocated"],
              ["all", "All"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={
                filter === key
                  ? "rounded-md bg-sea px-2.5 py-1 font-semibold text-white"
                  : "rounded-md px-2.5 py-1 text-ink-soft hover:text-ink"
              }
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-soft">
          No documents here yet. Forward a file to your Tasks email.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((task) => (
            <li
              key={task.id}
              className="rounded-xl border border-line bg-white/80 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {task.filename || task.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    From {task.fromAddress ?? "unknown"} ·{" "}
                    {new Date(task.createdAt).toLocaleString("en-GB")}
                    {task.byteSize
                      ? ` · ${Math.round(task.byteSize / 1024)} KB`
                      : ""}
                  </p>
                  {task.clientName ? (
                    <p className="mt-2 text-sm text-sea">
                      Allocated to {task.clientName}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  {task.status}
                </span>
              </div>

              {task.status === "unallocated" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="input min-w-[12rem] flex-1 text-sm"
                    value={selections[task.id] ?? ""}
                    onChange={(e) =>
                      setSelections((s) => ({
                        ...s,
                        [task.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Allocate to company…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    disabled={pending}
                    onClick={() => allocate(task.id)}
                  >
                    Allocate
                  </button>
                </div>
              ) : task.status !== "done" ? (
                <button
                  type="button"
                  className="btn btn-secondary mt-3 text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await markTaskDone({ taskId: task.id });
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Could not update.",
                        );
                      }
                    })
                  }
                >
                  Mark done
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
