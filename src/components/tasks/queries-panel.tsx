"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addTaskComment,
  allocateQueryToMember,
  markTaskDone,
} from "@/server/actions/tasks";
import type {
  PracticeTask,
  PracticeTaskComment,
} from "@/lib/practice-tasks";

type Assignee = { userId: string; name: string; email: string };

export function QueriesPanel({
  tasks,
  assignees,
  commentsByTask,
}: {
  tasks: PracticeTask[];
  assignees: Assignee[];
  commentsByTask: Record<string, PracticeTaskComment[]>;
}) {
  const [filter, setFilter] = useState<"unallocated" | "allocated" | "all">(
    "unallocated",
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "unallocated") {
      return tasks.filter((t) => t.status === "unallocated");
    }
    return tasks.filter((t) => t.status === "allocated" || t.status === "done");
  }, [tasks, filter]);

  function allocate(taskId: string) {
    const assigneeUserId = selections[taskId];
    if (!assigneeUserId) {
      setError("Choose a team member first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await allocateQueryToMember({ taskId, assigneeUserId });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not allocate.");
      }
    });
  }

  function postComment(taskId: string) {
    const body = (drafts[taskId] ?? "").trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      try {
        await addTaskComment({ taskId, body });
        setDrafts((d) => ({ ...d, [taskId]: "" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not comment.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Assign queries to a team member. Allocator and assignee can keep a
          comment thread on each query.
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
          No queries yet. Forward a question email to your Tasks address.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((task) => {
            const open = openId === task.id;
            const comments = commentsByTask[task.id] ?? [];
            return (
              <li
                key={task.id}
                className="rounded-xl border border-line bg-white/80 p-4"
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                  onClick={() => setOpenId(open ? null : task.id)}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{task.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                      {task.body}
                    </p>
                    <p className="mt-2 text-xs text-ink-soft">
                      From {task.fromAddress ?? "unknown"} ·{" "}
                      {new Date(task.createdAt).toLocaleString("en-GB")}
                      {task.assigneeName
                        ? ` · Assigned to ${task.assigneeName}`
                        : ""}
                      {comments.length
                        ? ` · ${comments.length} comment${comments.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    {task.status}
                  </span>
                </button>

                {open ? (
                  <div className="mt-4 space-y-4 border-t border-line pt-4">
                    {task.status === "unallocated" ? (
                      <div className="flex flex-wrap items-center gap-2">
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
                          <option value="">Allocate to team member…</option>
                          {assignees.map((a) => (
                            <option key={a.userId} value={a.userId}>
                              {a.name}
                              {a.email ? ` (${a.email})` : ""}
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
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sea">
                        Comments
                      </p>
                      {comments.length === 0 ? (
                        <p className="text-sm text-ink-soft">
                          No comments yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {comments.map((c) => (
                            <li
                              key={c.id}
                              className="rounded-lg border border-line/80 bg-paper/70 px-3 py-2"
                            >
                              <p className="text-xs font-semibold text-ink">
                                {c.authorName ?? "Team"}
                                <span className="ml-2 font-normal text-ink-soft">
                                  {new Date(c.createdAt).toLocaleString(
                                    "en-GB",
                                  )}
                                </span>
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                                {c.body}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <textarea
                          className="input min-h-[4.5rem] flex-1 text-sm"
                          placeholder="Add a comment…"
                          value={drafts[task.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [task.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary self-end text-sm"
                          disabled={pending}
                          onClick={() => postComment(task.id)}
                        >
                          Post
                        </button>
                      </div>
                    </div>

                    {task.status !== "done" ? (
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await markTaskDone({ taskId: task.id });
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Could not update.",
                              );
                            }
                          })
                        }
                      >
                        Mark done
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
