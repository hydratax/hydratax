"use client";

import { useState } from "react";
import { TaskInboxBanner } from "@/components/tasks/task-inbox-banner";
import { DocumentsPanel } from "@/components/tasks/documents-panel";
import { QueriesPanel } from "@/components/tasks/queries-panel";
import type {
  PracticeTask,
  PracticeTaskComment,
} from "@/lib/practice-tasks";

type Tab = "documents" | "queries";

export function TasksDesk({
  inboxEmail,
  documents,
  queries,
  clients,
  assignees,
  commentsByTask,
}: {
  inboxEmail: string;
  documents: PracticeTask[];
  queries: PracticeTask[];
  clients: Array<{ id: string; name: string }>;
  assignees: Array<{ userId: string; name: string; email: string }>;
  commentsByTask: Record<string, PracticeTaskComment[]>;
}) {
  const [tab, setTab] = useState<Tab>("documents");
  const unallocatedDocs = documents.filter((t) => t.status === "unallocated")
    .length;
  const unallocatedQueries = queries.filter((t) => t.status === "unallocated")
    .length;

  return (
    <div className="space-y-6">
      <TaskInboxBanner inboxEmail={inboxEmail} />

      <div className="flex gap-1 rounded-xl border border-line bg-white p-1">
        <button
          type="button"
          className={
            tab === "documents"
              ? "flex-1 rounded-lg bg-sea px-3 py-2.5 text-sm font-semibold text-white"
              : "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
          }
          onClick={() => setTab("documents")}
        >
          Documents
          {unallocatedDocs > 0 ? (
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {unallocatedDocs}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={
            tab === "queries"
              ? "flex-1 rounded-lg bg-sea px-3 py-2.5 text-sm font-semibold text-white"
              : "flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
          }
          onClick={() => setTab("queries")}
        >
          Queries
          {unallocatedQueries > 0 ? (
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {unallocatedQueries}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "documents" ? (
        <DocumentsPanel tasks={documents} clients={clients} />
      ) : (
        <QueriesPanel
          tasks={queries}
          assignees={assignees}
          commentsByTask={commentsByTask}
        />
      )}
    </div>
  );
}
