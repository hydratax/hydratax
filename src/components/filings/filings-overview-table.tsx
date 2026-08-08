import Link from "next/link";
import type { PracticeFilingRow } from "@/lib/practice-filings";

function dueBadge(row: PracticeFilingRow) {
  if (row.urgency === "overdue") {
    return (
      <span className="inline-block rounded-md bg-danger/10 px-2 py-1 text-xs font-bold uppercase tracking-wide text-danger">
        {row.daysLabel}
      </span>
    );
  }
  if (row.urgency === "due_soon") {
    return (
      <span className="inline-block rounded-md bg-sea/10 px-2 py-1 text-xs font-bold uppercase tracking-wide text-sea">
        {row.daysLabel}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-md bg-sand px-2 py-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
      {row.daysLabel}
    </span>
  );
}

export function FilingsOverviewTable({
  rows,
  emptyHint,
}: {
  rows: PracticeFilingRow[];
  emptyHint?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-ink-soft">
          {emptyHint ??
            "No filings yet. Add a limited company client and sync Companies House to see deadlines."}
        </p>
        <Link href="/clients/new" className="btn btn-primary mt-4 inline-flex">
          Add company
        </Link>
      </div>
    );
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-4 py-3 font-semibold">Due</th>
            <th className="px-4 py-3 font-semibold">Company</th>
            <th className="px-4 py-3 font-semibold">Filing</th>
            <th className="px-4 py-3 font-semibold">Period</th>
            <th className="px-4 py-3 font-semibold">Deadline</th>
            <th className="px-4 py-3 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-line/70 last:border-0"
            >
              <td className="px-4 py-3 align-middle">{dueBadge(row)}</td>
              <td className="px-4 py-3 align-middle">
                <p className="font-semibold text-ink">{row.companyName}</p>
                {row.companyNumber && (
                  <p className="mono text-xs text-ink-soft">
                    {row.companyNumber}
                  </p>
                )}
              </td>
              <td
                className={`px-4 py-3 align-middle font-semibold ${
                  row.urgency === "overdue" ? "text-danger" : "text-ink"
                }`}
              >
                {row.label}
              </td>
              <td className="px-4 py-3 align-middle text-ink-soft">
                {row.periodLabel}
              </td>
              <td
                className={`px-4 py-3 align-middle mono ${
                  row.urgency === "overdue" ? "text-danger" : "text-ink"
                }`}
              >
                {row.deadlineLabel}
              </td>
              <td className="px-4 py-3 align-middle text-right">
                <Link
                  href={row.href}
                  className="btn btn-primary whitespace-nowrap px-3 py-2 text-sm"
                >
                  View &amp; file
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-soft">
        One row per outstanding filing across every company — soonest deadline
        first.
      </p>
    </div>
  );
}
