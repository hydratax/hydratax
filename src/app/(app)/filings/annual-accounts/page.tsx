import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { buildPracticeFilings } from "@/lib/practice-filings";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export const metadata = {
  title: "Annual accounts — HydraTax",
};

export default async function AnnualAccountsListPage() {
  await requireSession();
  const clients = await listClients();
  const rows = buildPracticeFilings(
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      companyNumber: c.companyNumber,
      companiesHouse:
        "companiesHouse" in c
          ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
          : null,
    })),
  ).filter((r) => r.kind === "annual_accounts");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Companies House
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            Annual accounts
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            iXBRL accounts filings — unlimited on Practice and Custom desks.
          </p>
        </div>
        <Link href="/filings" className="btn btn-secondary text-sm">
          Back to overview
        </Link>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 font-semibold">Filing deadline</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  No accounts deadlines yet.{" "}
                  <Link href="/clients/new" className="font-semibold text-sea">
                    Add a company
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{row.companyName}</p>
                    <p className="mono text-xs text-ink-soft">
                      {row.companyNumber ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{row.periodLabel}</td>
                  <td
                    className={`px-4 py-3 mono ${
                      row.urgency === "overdue" ? "text-danger" : "text-ink"
                    }`}
                  >
                    {row.deadlineLabel}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{row.daysLabel}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={row.href}
                      className="btn btn-primary whitespace-nowrap px-3 py-2 text-sm"
                    >
                      View &amp; file
                    </Link>
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
