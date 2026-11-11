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
  payeRef?: string | null;
  /** True for sole traders, partnerships, or Ltd homes that hold SA people. */
  hasSelfAssessment?: boolean;
};

export type DashboardFilter = "clients" | "vat" | "paye" | "sa" | "ltd";

type StatCard = {
  id: DashboardFilter;
  label: string;
  value: string;
  hint: string;
};

function filterClients(
  clients: DashboardClientRow[],
  filter: DashboardFilter,
) {
  switch (filter) {
    case "clients":
      return clients;
    case "vat":
      return clients.filter((c) => c.isVatRegistered);
    case "paye":
      return clients.filter(
        (c) => c.isEmployer || Boolean(c.payeRef?.trim()),
      );
    case "sa":
      return clients.filter(
        (c) =>
          c.hasSelfAssessment ||
          c.type === "sole_trader" ||
          c.type === "partnership",
      );
    case "ltd":
      return clients.filter((c) => c.type === "limited_company");
    default:
      return clients;
  }
}

export function DashboardClientFilters({
  clients,
  unlockedModules: _unlockedModules,
  stats,
  canAddClients,
}: {
  clients: DashboardClientRow[];
  unlockedModules: ServiceModule[];
  stats: StatCard[];
  canAddClients: boolean;
}) {
  const [activeFilter, setActiveFilter] = useState<DashboardFilter | null>(
    null,
  );

  const filtered = useMemo(() => {
    if (!activeFilter) return [];
    return filterClients(clients, activeFilter);
  }, [activeFilter, clients]);

  const activeLabel =
    stats.find((s) => s.id === activeFilter)?.label ?? "Clients";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((card) => {
          const selected = activeFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() =>
                setActiveFilter((prev) => (prev === card.id ? null : card.id))
              }
              className={`stat-tile text-left ${
                selected ? "stat-tile--active" : ""
              }`}
              aria-pressed={selected}
            >
              <span className="service-tile__sheen" aria-hidden />
              <p className="relative z-[1] text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
                {card.label}
              </p>
              <p className="display relative z-[1] mt-2 text-3xl text-ink">
                {card.value}
              </p>
              <p className="relative z-[1] mt-1 text-xs text-ink-soft">
                {card.hint}
              </p>
            </button>
          );
        })}
      </div>

      {!activeFilter ? (
        <section className="service-tile px-5 py-10 text-center">
          <span className="service-tile__sheen" aria-hidden />
          <p className="relative z-[1] font-semibold text-ink">
            Filter your desk
          </p>
          <p className="relative z-[1] mt-1 text-sm text-ink-soft">
            Select a card above to view matching clients. Your full client list
            lives on{" "}
            <Link href="/clients" className="font-semibold text-sea underline">
              Clients
            </Link>
            .
          </p>
          {canAddClients && (
            <Link
              href="/clients/new"
              className="btn btn-primary relative z-[1] mt-4 text-sm"
            >
              Add client
            </Link>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <section className="service-tile px-5 py-10 text-center">
          <p className="font-semibold text-ink">
            No {activeLabel.toLowerCase()} clients
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Nothing in your practice matches this filter yet.
          </p>
          {activeFilter === "sa" ? (
            <Link
              href="/clients?desk=sa"
              className="btn btn-primary mt-4 inline-flex text-sm"
            >
              Open Self Assessment desk
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-secondary mt-4 text-sm"
              onClick={() => setActiveFilter(null)}
            >
              Clear filter
            </button>
          )}
        </section>
      ) : (
        <section className="service-tile overflow-hidden p-5">
          {activeFilter === "sa" ? (
            <p className="mb-3 text-sm text-ink-soft">
              Showing client files linked to Self Assessment people. Open the{" "}
              <Link
                href="/clients?desk=sa"
                className="font-semibold text-sea underline"
              >
                SA desk
              </Link>{" "}
              for the full people list.
            </p>
          ) : null}
          <DashboardClientList clients={filtered} />
        </section>
      )}
    </div>
  );
}
