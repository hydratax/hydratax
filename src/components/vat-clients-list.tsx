"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import { DeskFilterBar } from "@/components/desk-filter-bar";
import { useDeskFilterPrefs } from "@/hooks/use-desk-filter-prefs";
import {
  cardTintClass,
  chipColorClass,
  colorForMapsTo,
  resolveFilterMapsTo,
} from "@/lib/desk-filter-prefs";
import {
  matchesVatFilter,
  vatStatusLabel,
  type VatClientFilter,
  type VatClientSummary,
  type VatWorkflowStatus,
} from "@/lib/vat-client-status";

export type VatClientListItem = {
  id: string;
  slug: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  vrn: string | null;
  vat: VatClientSummary;
};

const FILTER_DEFAULTS = [
  { id: "all", label: "All" },
  { id: "drafted", label: "Drafted" },
  { id: "emailed", label: "Emailed to client" },
  { id: "completed", label: "Completed" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
] as const;

const MAP_OPTIONS = FILTER_DEFAULTS.filter((f) => f.id !== "all").map((f) => ({
  id: f.id,
  label: f.label,
}));

function matchesSearch(client: VatClientListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) ||
    (client.vrn ?? "").toLowerCase().includes(q) ||
    client.slug.toLowerCase().includes(q)
  );
}

export function VatClientsList({
  clients,
}: {
  clients: VatClientListItem[];
}) {
  const [filterId, setFilterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const filterPrefs = useDeskFilterPrefs("vat", [...FILTER_DEFAULTS]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: clients.length,
      drafted: 0,
      emailed: 0,
      completed: 0,
      submitted: 0,
      approved: 0,
    };
    for (const row of clients) {
      const s = row.vat.status;
      if (s !== "not_started" && s in c) c[s] += 1;
    }
    return c;
  }, [clients]);

  const activeMapsTo = resolveFilterMapsTo(filterPrefs.prefs, filterId);

  const visible = useMemo(
    () =>
      clients.filter(
        (row) =>
          matchesVatFilter(row.vat, activeMapsTo as VatClientFilter) &&
          matchesSearch(row, searchQuery),
      ),
    [clients, activeMapsTo, searchQuery],
  );

  const searchTrimmed = searchQuery.trim();

  return (
    <div className="space-y-4">
      <label className="sr-only" htmlFor="vat-clients-search">
        Search VAT clients
      </label>
      <input
        id="vat-clients-search"
        type="search"
        className="input max-w-md"
        placeholder="Search name, VRN…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <DeskFilterBar
        label="VAT filters"
        prefs={filterPrefs.prefs}
        selectedId={filterId}
        counts={counts}
        mapOptions={MAP_OPTIONS}
        onSelect={setFilterId}
        onSetColor={filterPrefs.setColor}
        onSetLabel={filterPrefs.setLabel}
        onHide={filterPrefs.hideFilter}
        onShow={filterPrefs.showFilter}
        onDelete={filterPrefs.deleteFilter}
        onAdd={filterPrefs.addFilter}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-ink-soft">
            {searchTrimmed
              ? `No clients match “${searchTrimmed}”.`
              : "No clients match this filter."}
          </p>
        )}
        {visible.map((c) => {
          const { vat } = c;
          const statusKey =
            vat.status === "not_started" ? "all" : vat.status;
          const tint = cardTintClass(
            colorForMapsTo(filterPrefs.prefs, statusKey),
          );
          return (
            <PendingLink
              key={c.id}
              href={`/clients/${c.slug}/vat`}
              className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
              pendingLabel="Opening VAT…"
            >
              {(pending) => (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display min-w-0 flex-1 text-2xl leading-tight text-ink">
                      {c.name}
                    </h2>
                    <span
                      className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
                    >
                      {pending ? "Opening…" : "Open"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-ink-soft">
                    {vat.periodLabel}
                    {c.type === "limited_company" ? " · Limited company" : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={chipColorClass(
                        colorForMapsTo(
                          filterPrefs.prefs,
                          vat.status === "not_started"
                            ? "all"
                            : (vat.status as VatWorkflowStatus),
                        ),
                      )}
                    >
                      {vatStatusLabel(vat.status)}
                    </span>
                    {vat.nextDueLabel ? (
                      <span className="filing-btn filing-btn--muted">
                        Due {vat.nextDueLabel}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-sm text-ink">
                    {vat.nextDueLabel ? (
                      <>
                        Next quarter due{" "}
                        <span className="paye-digits font-semibold">
                          {vat.nextDueLabel}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-soft">No due date yet</span>
                    )}
                  </p>

                  <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                    {c.vrn ? `VRN ${c.vrn}` : "No VRN yet"}
                  </p>
                </>
              )}
            </PendingLink>
          );
        })}
      </div>
    </div>
  );
}
