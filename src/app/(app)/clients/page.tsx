import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { clientSlugFor } from "@/lib/client-slug";
import { DedupeClientsButton } from "@/components/forms/dedupe-clients-button";

type Props = {
  searchParams: Promise<{ imported?: string; skipped?: string }>;
};

export default async function ClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  const imported = params.imported ? Number(params.imported) : 0;
  const skipped = params.skipped ? Number(params.skipped) : 0;
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));

  const items: ClientListItem[] = clients.map((c) => ({
    id: c.id,
    slug: clientSlugFor({ id: c.id, name: c.name }, peers),
    name: c.name,
    type: c.type,
    companyNumber: c.companyNumber,
    utr: c.utr,
    vrn: c.vrn,
    isVatRegistered: c.isVatRegistered,
    isEmployer: c.isEmployer,
    companiesHouse:
      ("companiesHouse" in c
        ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
        : null) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">Clients</h1>
          <p className="mt-1 text-ink-soft">
            Every entity your practice files for — open a workspace to start.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/channels" className="btn btn-secondary">
            Channels
          </Link>
          <Link href="/clients/bulk-email" className="btn btn-secondary">
            Bulk email
          </Link>
          <Link href="/clients/import" className="btn btn-secondary">
            Import Excel
          </Link>
          <Link href="/clients/new" className="btn btn-primary">
            Add client
          </Link>
        </div>
      </div>

      <DedupeClientsButton />

      {(imported > 0 || skipped > 0) && (
        <div className="rounded-lg border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          {imported > 0 && (
            <p>
              Imported <strong>{imported}</strong> client
              {imported === 1 ? "" : "s"}.
            </p>
          )}
          {skipped > 0 && (
            <p className={imported > 0 ? "mt-1 text-ink-soft" : undefined}>
              Skipped <strong>{skipped}</strong> row
              {skipped === 1 ? "" : "s"} already in your practice.
            </p>
          )}
        </div>
      )}

      <ClientsList clients={items} />
    </div>
  );
}
