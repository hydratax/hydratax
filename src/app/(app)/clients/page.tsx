import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export default async function ClientsPage() {
  const clients = await listClients();

  const items: ClientListItem[] = clients.map((c) => ({
    id: c.id,
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
          <Link href="/clients/import" className="btn btn-secondary">
            Import Excel
          </Link>
          <Link href="/clients/new" className="btn btn-primary">
            Add client
          </Link>
        </div>
      </div>

      <ClientsList clients={items} />
    </div>
  );
}
