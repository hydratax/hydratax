"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import { SaDirectorsList } from "@/components/sa-directors-list";
import type { ServiceModule } from "@/lib/entitlements";
import type { PracticeDirector } from "@/server/actions/sa-directors";
import type { ClientWorkStage } from "@/lib/client-work-stage";

export type DashboardClientRow = ClientListItem & {
  payeRef?: string | null;
};

export type DashboardFilter = "clients" | "vat" | "paye" | "sa" | "ltd";

type StatCard = {
  id: DashboardFilter;
  label: string;
  value: string;
  hint: string;
};

type SoleTraderRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  utr: string | null;
  nino: string | null;
  filing?: PracticeDirector["filing"];
  workStage?: ClientWorkStage;
  emailCount?: number;
};

type DirectorRow = PracticeDirector & {
  workStage?: ClientWorkStage;
  emailCount?: number;
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
        (c) => c.type === "sole_trader" || c.type === "partnership",
      );
    case "ltd":
      return clients.filter((c) => c.type === "limited_company");
    default:
      return clients;
  }
}

export function DashboardClientFilters({
  clients,
  saDirectors = [],
  saSoleTraders = [],
  unlockedModules: _unlockedModules,
  stats,
  canAddClients,
}: {
  clients: DashboardClientRow[];
  saDirectors?: DirectorRow[];
  saSoleTraders?: SoleTraderRow[];
  unlockedModules: ServiceModule[];
  stats: StatCard[];
  canAddClients: boolean;
}) {
  /** Full practice list — not Ltd-only. */
  const [activeFilter, setActiveFilter] = useState<DashboardFilter | null>(
    "clients",
  );

  const filtered = useMemo(() => {
    if (!activeFilter || activeFilter === "sa") return [];
    return filterClients(clients, activeFilter);
  }, [activeFilter, clients]);

  const activeLabel =
    stats.find((s) => s.id === activeFilter)?.label ?? "Clients";

  const showSaPeople =
    activeFilter === "clients" || activeFilter === "sa";
  const saEmpty =
    showSaPeople &&
    saDirectors.length === 0 &&
    saSoleTraders.length === 0;

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
      ) : activeFilter === "sa" ? (
        saEmpty ? (
          <section className="service-tile px-5 py-10 text-center">
            <p className="font-semibold text-ink">No Self Assessment people</p>
            <p className="mt-1 text-sm text-ink-soft">
              Add a sole trader or partnership, or open a limited company and
              refresh Companies House officers.
            </p>
            <Link
              href="/clients?desk=sa"
              className="btn btn-primary mt-4 inline-flex text-sm"
            >
              Open Self Assessment desk
            </Link>
          </section>
        ) : (
          <section className="service-tile service-tile--static overflow-hidden p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="display text-2xl text-ink">Self Assessment</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  People only — personal UTR / NINO. Limited companies stay on
                  Ltd companies / CT600.
                </p>
              </div>
              <Link
                href="/clients?desk=sa"
                className="btn btn-secondary text-sm"
              >
                Full SA desk
              </Link>
            </div>
            <SaDirectorsList
              directors={saDirectors}
              soleTraders={saSoleTraders}
            />
          </section>
        )
      ) : filtered.length === 0 &&
        !(activeFilter === "clients" && !saEmpty) ? (
        <section className="service-tile px-5 py-10 text-center">
          <p className="font-semibold text-ink">
            No {activeLabel.toLowerCase()} clients
          </p>
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
        <section className="service-tile service-tile--static overflow-hidden p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-2xl text-ink">{activeLabel}</h2>
              {activeFilter === "clients" ? (
                <p className="mt-1 text-sm text-ink-soft">
                  Companies, partnerships and individuals across the practice.
                </p>
              ) : null}
            </div>
            {canAddClients && (
              <Link href="/clients/new" className="btn btn-primary text-sm">
                Add client
              </Link>
            )}
          </div>
          {filtered.length > 0 ? (
            <ClientsList
              clients={filtered}
              openPath={
                activeFilter === "vat"
                  ? "/vat"
                  : activeFilter === "paye"
                    ? "/payroll"
                    : activeFilter === "ltd"
                      ? "/corporation-tax"
                      : ""
              }
            />
          ) : null}
          {activeFilter === "clients" && !saEmpty ? (
            <div className={filtered.length > 0 ? "mt-8 border-t border-line pt-6" : ""}>
              <h3 className="display text-xl text-ink">Self Assessment people</h3>
              <p className="mt-1 mb-4 text-sm text-ink-soft">
                Sole traders and company officers with personal returns.
              </p>
              <SaDirectorsList
                directors={saDirectors}
                soleTraders={saSoleTraders}
              />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
