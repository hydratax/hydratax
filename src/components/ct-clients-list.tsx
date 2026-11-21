"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import { DeskFilterBar } from "@/components/desk-filter-bar";
import { DeskStatusButton } from "@/components/desk-status-button";
import { useDeskFilterPrefs } from "@/hooks/use-desk-filter-prefs";
import {
  cardTintClass,
  chipColorClass,
  colorForMapsTo,
  resolveFilterMapsTo,
} from "@/lib/desk-filter-prefs";
import { maskUtr } from "@/lib/mask-identifiers";
import {
  ctStatusLabel,
  matchesCtFilter,
  type CtClientFilter,
  type CtClientSummary,
} from "@/lib/ct-client-status";

export type CtClientListItem = {
  id: string;
  slug: string;
  name: string;
  utr: string | null;
  ct: CtClientSummary;
};

const FILTER_DEFAULTS = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not started" },
  { id: "drafted", label: "Drafted" },
  { id: "ready", label: "Ready to file" },
  { id: "submitted", label: "Submitted" },
  { id: "accepted", label: "Accepted" },
] as const;

const MAP_OPTIONS = FILTER_DEFAULTS.filter((f) => f.id !== "all").map((f) => ({
  id: f.id,
  label: f.label,
}));

function matchesSearch(client: CtClientListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) ||
    (client.utr ?? "").toLowerCase().includes(q) ||
    client.slug.toLowerCase().includes(q)
  );
}

export function CtClientsList({ clients }: { clients: CtClientListItem[] }) {
  const [filterId, setFilterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const filterPrefs = useDeskFilterPrefs("ct", [...FILTER_DEFAULTS]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: clients.length,
      not_started: 0,
      drafted: 0,
      ready: 0,
      submitted: 0,
      accepted: 0,
    };
    for (const row of clients) {
      c[row.ct.status] += 1;
    }
    return c;
  }, [clients]);

  const activeMapsTo = resolveFilterMapsTo(filterPrefs.prefs, filterId);

  const visible = useMemo(
    () =>
      clients.filter(
        (row) =>
          matchesCtFilter(row.ct, activeMapsTo as CtClientFilter) &&
          matchesSearch(row, searchQuery),
      ),
    [clients, activeMapsTo, searchQuery],
  );

  const searchTrimmed = searchQuery.trim();

  return (
    <div className="space-y-4">
      <label className="sr-only" htmlFor="ct-clients-search">
        Search CT600 clients
      </label>
      <input
        id="ct-clients-search"
        type="search"
        className="input max-w-md"
        placeholder="Search name, company UTR…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <DeskFilterBar
        label="CT600 filters"
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
              ? `No companies match “${searchTrimmed}”.`
              : "No companies match this filter."}
          </p>
        )}
        {visible.map((c) => {
          const { ct } = c;
          const tintKey =
            !ct.filed && ct.urgency === "overdue" && ct.status === "not_started"
              ? "not_started"
              : ct.status;
          let tint = cardTintClass(colorForMapsTo(filterPrefs.prefs, tintKey));
          if (
            !tint &&
            !ct.filed &&
            ct.urgency === "overdue"
          ) {
            tint = cardTintClass("red");
          } else if (!tint && !ct.filed && ct.urgency === "due_soon") {
            tint = cardTintClass("violet");
          }
          return (
            <div
              key={c.id}
              className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="display min-w-0 flex-1 text-2xl leading-tight text-ink">
                  <PendingLink
                    href={`/clients/${c.slug}/corporation-tax`}
                    className="text-ink after:absolute after:inset-0 after:z-[1]"
                    pendingLabel="Opening CT600…"
                  >
                    {c.name}
                  </PendingLink>
                </h2>
                <DeskStatusButton
                  clientId={c.id}
                  desk="ct"
                  options={MAP_OPTIONS}
                  value={ct.status}
                />
              </div>

              <p className="mt-1 text-sm text-ink-soft">
                {ct.periodLabel ?? "Accounting period not set"}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={chipColorClass(
                    colorForMapsTo(filterPrefs.prefs, ct.status),
                  )}
                >
                  {ctStatusLabel(ct.status)}
                </span>
                {ct.dueLabel ? (
                  <span
                    className={
                      ct.filed
                        ? chipColorClass(
                            colorForMapsTo(filterPrefs.prefs, "submitted"),
                          )
                        : ct.urgency === "overdue"
                          ? "filing-btn filing-btn--tint-red"
                          : ct.urgency === "due_soon"
                            ? "filing-btn filing-btn--tint-violet"
                            : "filing-btn filing-btn--muted"
                    }
                  >
                    {ct.filed ? ct.dueLabel : `Due ${ct.dueLabel}`}
                  </span>
                ) : null}
              </div>

              <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                {c.utr
                  ? `Company UTR ${maskUtr(c.utr)}`
                  : "No company UTR yet"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
