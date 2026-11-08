import { TasksDesk } from "@/components/tasks/tasks-desk";
import { listClients } from "@/server/actions/clients";
import {
  getPracticeTaskInbox,
  listPracticeTasks,
  listTaskAssignees,
  listTaskComments,
} from "@/server/actions/tasks";
import { requireSession } from "@/server/auth/session";
import type { PracticeTaskComment } from "@/lib/practice-tasks";

export default async function TasksPage() {
  await requireSession();
  const [inbox, documents, queries, clients, assignees] = await Promise.all([
    getPracticeTaskInbox(),
    listPracticeTasks("document"),
    listPracticeTasks("query"),
    listClients(),
    listTaskAssignees(),
  ]);

  const commentsByTask: Record<string, PracticeTaskComment[]> = {};
  await Promise.all(
    queries.map(async (q) => {
      commentsByTask[q.id] = await listTaskComments(q.id);
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Practice desk
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">Tasks</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Collect documents and queries from outside HydraTax, then allocate
          files to companies and questions to your team.
        </p>
      </div>

      <TasksDesk
        inboxEmail={inbox.inboxEmail}
        documents={documents}
        queries={queries}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        assignees={assignees}
        commentsByTask={commentsByTask}
      />
    </div>
  );
}
