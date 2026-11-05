import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { buildPracticeFilings } from "@/lib/practice-filings";
import { FilingsOverviewTable } from "@/components/filings/filings-overview-table";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import Link from "next/link";

export const metadata = {
  title: "Filings overview — HydraTax",
};

export default async function FilingsOverviewPage() {
  await requireSession();
  const clients = await listClients();
  const rows = buildPracticeFilings(
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      isVatRegistered: c.isVatRegistered,
      isEmployer: c.isEmployer,
      amlNextReviewOn:
        "deskProfile" in c
          ? ((c.deskProfile as { aml?: { nextReviewOn?: string } } | null)?.aml
              ?.nextReviewOn ?? null)
          : null,
      companyNumber: c.companyNumber,
      companiesHouse:
        "companiesHouse" in c
          ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
          : null,
    })),
  ).map((row) => {
    const client = clients.find((c) => c.id === row.clientId);
    const jobs =
      client && "deskProfile" in client
        ? (client.deskProfile as { jobs?: Record<string, import("@/lib/desk-profile").JobStatus> } | null)
            ?.jobs
        : null;
    return { ...row, jobStatus: jobs?.[row.id] ?? null };
  });

  const overdue = rows.filter((r) => r.urgency === "overdue").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice desk
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            Overview
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Upcoming Corporation Tax, VAT, PAYE, Self Assessment, Confirmation
            Statement and Annual accounts deadlines across your clients. Set a
            job status before you file.
            {overdue > 0 ? ` ${overdue} overdue.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/filings/confirmation-statement"
            className="btn btn-secondary text-sm"
          >
            Confirmation Statement
          </Link>
          <Link
            href="/filings/corporation-tax"
            className="btn btn-secondary text-sm"
          >
            Corporation Tax
          </Link>
          <Link
            href="/filings/annual-accounts"
            className="btn btn-secondary text-sm"
          >
            Annual accounts
          </Link>
          <Link href="/clients/new" className="btn btn-primary text-sm">
            Add company
          </Link>
        </div>
      </div>

      <FilingsOverviewTable rows={rows} />
    </div>
  );
}
