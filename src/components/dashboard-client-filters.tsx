"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DashboardClientList } from "@/components/dashboard-client-list";
import type { ServiceModule } from "@/lib/entitlements";

export type DashboardClientRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  isVatRegistered: boolean;
  isEmployer: boolean;
  vrn: string | null;
  companyNumber: string | null;
};

export type DashboardFilter = "clients" | "vat" | "rails" | "ltd";

type StatCard = {
  id: DashboardFilter;
  label: string;
  value: string;
  hint: string;
};

function clientMatchesRails(
  client: DashboardClientRow,
  unlocked: Set<ServiceModule>,
) {
  if (unlocked.has("vat") && client.isVatRegistered) return true;
  if (unlocked.has("corporation_tax") && client.type === "limited_company") {
    return true;
  }
  if (unlocked.has("payroll") && client.isEmployer) return true;
  if (
    unlocked.has("self_assessment") &&
    client.type !== "limited_company"
  ) {
    return true;
  }
  return false;
}

function filterClients(
  clients: DashboardClientRow[],
  filter: DashboardFilter,
  unlocked: Set<ServiceModule>,
) {
  switch (filter) {
    case "clients":
      return clients;
    case "vat":
      return clients.filter((c) => c.isVatRegistered);
    case "ltd":
      return clients.filter((c) => c.type === "limited_company");
    case "rails":
      return clients.filter((c) => clientMatchesRails(c, unlocked));
    default:
      return clients;
  }
}

export function DashboardClientFilters({
  clients,
  unlockedModules,
  stats,
  canAddClients,
}: {
  clients: DashboardClientRow[];
  unlockedModules: ServiceModule[];
  stats: StatCard[];
  canAddClients: boolean;
}) {
  const unlocked = useMemo(
    () => new Set(unlockedModules),
    [unlockedModules],
  );
  const [activeFilter, setActiveFilter] = useState<DashboardFilter | null>(
    null,
  );

  const filtered = useMemo(() => {
    if (!activeFilter) return [];
    return filterClients(clients, activeFilter, unlocked);
  }, [activeFilter, clients, unlocked]);

  const activeLabel =
    stats.find((s) => s.id === activeFilter)?.label ?? "Clients";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {stats.map((card) => {
          const selected = activeFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() =>
                setActiveFilter((prev) => (prev === card.id ? null : card.id))
              }
              className={`panel panel-interactive p-4 text-left transition ${
                selected ? "ring-2 ring-sea ring-offset-2" : ""
              }`}
              aria-pressed={selected}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {card.label}
              </p>
              <p className="display mt-2 text-3xl text-ink">{card.value}</p>
              <p className="mt-1 text-xs text-ink-soft">{card.hint}</p>
            </button>
          );
        })}
      </div>

      {!activeFilter ? (
        <section className="panel px-5 py-10 text-center">
          <p className="font-semibold text-ink">Filter your desk</p>
          <p className="mt-1 text-sm text-ink-soft">
            Select a card above to view matching clients. Your full client list
            lives on{" "}
            <Link href="/clients" className="font-semibold text-sea underline">
              Clients
            </Link>
            .
          </p>
          {canAddClients && (
            <Link href="/clients/new" className="btn btn-primary mt-4 text-sm">
              Add client
            </Link>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <section className="panel px-5 py-10 text-center">
          <p className="font-semibold text-ink">No {activeLabel.toLowerCase()} clients</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nothing in your practice matches this filter yet.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-4 text-sm"
            onClick={() => setActiveFilter(null)}
          >
            Clear filter
          </button>
        </section>
      ) : (
        <section className="panel overflow-hidden p-5">
          <DashboardClientList clients={filtered} />
        </section>
      )}
    </div>
  );
}
