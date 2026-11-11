import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { buildPracticeFilings } from "@/lib/practice-filings";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import type { FilingUrgency } from "@/lib/filing-due";

export const metadata = {
  title: "Corporation Tax — HydraTax",
};

const URGENCY_RANK: Record<FilingUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
  unknown: 3,
};

export default async function CorporationTaxListPage() {
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
  ).filter((r) => r.kind === "corporation_tax");

  /** One presentation card per company — periods live on the CT600 desk. */
  const byCompany = new Map<
    string,
    {
      clientId: string;
      companyName: string;
      companyNumber: string | null;
      periodCount: number;
      nextDueLabel: string;
      daysLabel: string;
      urgency: FilingUrgency;
      href: string;
    }
  >();

  for (const row of rows) {
    const existing = byCompany.get(row.clientId);
    if (!existing) {
      byCompany.set(row.clientId, {
        clientId: row.clientId,
        companyName: row.companyName,
        companyNumber: row.companyNumber,
        periodCount: 1,
        nextDueLabel: row.deadlineLabel,
        daysLabel: row.daysLabel,
        urgency: row.urgency,
        href: `/clients/${row.clientId}/corporation-tax`,
      });
      continue;
    }
    existing.periodCount += 1;
    if (URGENCY_RANK[row.urgency] < URGENCY_RANK[existing.urgency]) {
      existing.urgency = row.urgency;
      existing.nextDueLabel = row.deadlineLabel;
      existing.daysLabel = row.daysLabel;
    } else if (
      row.urgency === existing.urgency &&
      row.deadlineIso &&
      (!existing.nextDueLabel ||
        (row.deadlineLabel !== "—" &&
          row.deadlineLabel < existing.nextDueLabel))
    ) {
      existing.nextDueLabel = row.deadlineLabel;
      existing.daysLabel = row.daysLabel;
    }
  }

  const companies = [...byCompany.values()].sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      a.companyName.localeCompare(b.companyName),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            HMRC
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            Corporation Tax
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Choose a company, then open a CT600 accounting period.
          </p>
        </div>
        <Link href="/filings" className="btn btn-secondary text-sm">
          Back to overview
        </Link>
      </div>

      {companies.length === 0 ? (
        <div className="panel p-8 text-center text-ink-soft">
          No limited companies yet.{" "}
          <Link href="/clients/new" className="font-semibold text-sea">
            Add a company
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((co) => (
            <Link
              key={co.clientId}
              href={co.href}
              className="company-deadline-tile gloss-card group relative flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
            >
              <span className="gloss-shine" aria-hidden />
              <div className="relative z-[1] flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold tracking-tight text-ink">
                      {co.companyName}
                    </p>
                    <p className="mono mt-0.5 text-xs text-ink-soft">
                      {co.companyNumber ?? "—"}
                    </p>
                  </div>
                  <span
                    className={
                      co.urgency === "overdue"
                        ? "shrink-0 rounded-md bg-danger/10 px-2 py-1 text-xs font-bold text-danger"
                        : co.urgency === "due_soon"
                          ? "badge badge-sea shrink-0"
                          : "badge badge-muted shrink-0"
                    }
                  >
                    {co.daysLabel}
                  </span>
                </div>
                <dl className="mt-auto space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">CT600 periods</dt>
                    <dd className="text-right text-ink">{co.periodCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Next due</dt>
                    <dd
                      className={`mono text-right ${
                        co.urgency === "overdue" ? "text-danger" : "text-ink"
                      }`}
                    >
                      {co.nextDueLabel}
                    </dd>
                  </div>
                </dl>
                <span className="btn btn-primary mt-1 w-full justify-center px-3 py-2 text-sm">
                  Open CT600 periods
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
