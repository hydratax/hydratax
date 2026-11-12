"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import { PendingLink } from "@/components/pending-link";
import type { ServiceModule } from "@/lib/entitlements";

export type DashboardClientRow = ClientListItem & {
  payeRef?: string | null;
};

/** Natural persons / SA entities — never limited companies. */
export type DashboardSaPersonRow = {
  key: string;
  fullName: string;
  href: string;
  kind: "director" | "sole_trader" | "partnership";
  detail?: string;
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
        (c) => c.type === "sole_trader" || c.type === "partnership",
      );
    case "ltd":
      return clients.filter((c) => c.type === "limited_company");
    default:
      return clients;
  }
}

function kindLabel(kind: DashboardSaPersonRow["kind"]) {
  if (kind === "director") return "Director / shareholder";
  if (kind === "partnership") return "Partnership";
  return "Sole trader";
}

export function DashboardClientFilters({
  clients,
  saPeople = [],
  unlockedModules: _unlockedModules,
  stats,
  canAddClients,
}: {
  clients: DashboardClientRow[];
  /** People for the Self Assessment filter (directors + sole/partnership). */
  saPeople?: DashboardSaPersonRow[];
  unlockedModules: ServiceModule[];
  stats: StatCard[];
  canAddClients: boolean;
}) {
  /** Ltd companies with colour-coded filing cards — default desk view. */
  const [activeFilter, setActiveFilter] = useState<DashboardFilter | null>(
    "ltd",
  );
  const [saQuery, setSaQuery] = useState("");

  const filtered = useMemo(() => {
    if (!activeFilter || activeFilter === "sa") return [];
    return filterClients(clients, activeFilter);
  }, [activeFilter, clients]);

  const filteredSaPeople = useMemo(() => {
    const q = saQuery.trim().toLowerCase();
    if (!q) return saPeople;
    return saPeople.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        (p.detail ?? "").toLowerCase().includes(q) ||
        kindLabel(p.kind).toLowerCase().includes(q),
    );
  }, [saPeople, saQuery]);

  const activeLabel =
    stats.find((s) => s.id === activeFilter)?.label ?? "Clients";

  const saEmpty = activeFilter === "sa" && filteredSaPeople.length === 0;

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
        saEmpty && !saQuery.trim() ? (
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
          <section className="service-tile overflow-hidden p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
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
            <input
              type="search"
              className="input mt-4 max-w-md"
              placeholder="Search person…"
              value={saQuery}
              onChange={(e) => setSaQuery(e.target.value)}
            />
            {filteredSaPeople.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ink-soft">
                No people match this search.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {filteredSaPeople.map((p) => (
                  <li key={p.key}>
                    <PendingLink
                      href={p.href}
                      pendingLabel={`Opening ${p.fullName}…`}
                      className="panel panel-interactive client-card client-card--compact block px-4 py-3"
                    >
                      {(pending) => (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">
                              {p.fullName}
                            </p>
                            <p className="mt-1 text-xs text-ink-soft">
                              {kindLabel(p.kind)}
                              {p.detail ? ` · ${p.detail}` : ""}
                            </p>
                          </div>
                          <span
                            className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
                          >
                            {pending ? "Opening…" : "Open SA"}
                          </span>
                        </div>
                      )}
                    </PendingLink>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      ) : filtered.length === 0 ? (
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
        <section className="service-tile overflow-hidden p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-2xl text-ink">{activeLabel}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Colour-coded for confirmation statement and accounts deadlines.
              </p>
            </div>
            {canAddClients && (
              <Link href="/clients/new" className="btn btn-primary text-sm">
                Add client
              </Link>
            )}
          </div>
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
        </section>
      )}
    </div>
  );
}
