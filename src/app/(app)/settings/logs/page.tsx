import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { listPracticeLogs } from "@/server/actions/practice-logs";

export default async function PracticeLogsPage() {
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "admin") {
    redirect("/settings/account");
  }

  let rows: Awaited<ReturnType<typeof listPracticeLogs>> = [];
  let error: string | null = null;
  try {
    rows = await listPracticeLogs(250);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load logs.";
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Practice admin
        </p>
        <h1 className="display mt-1 text-3xl text-ink">Logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Activity across the practice — client creation, emails, letters, and
          support tickets. Visible to owners and admins only.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sand/40 text-xs font-bold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-ink-soft"
                >
                  No activity logged yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line/70 last:border-0 hover:bg-sand/30"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-soft">
                    {new Date(row.at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-md border border-line px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-ink-soft">
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    <p className="font-medium">{row.summary}</p>
                    {row.clientName || row.detail ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {[row.clientName, row.detail].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">
                    {row.actor ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
