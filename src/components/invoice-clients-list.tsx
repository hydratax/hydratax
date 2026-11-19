"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import { DeskFilterBar } from "@/components/desk-filter-bar";
import { useDeskFilterPrefs } from "@/hooks/use-desk-filter-prefs";
import { money } from "@/lib/format";
import {
  cardTintClass,
  chipColorClass,
  colorForMapsTo,
  resolveFilterMapsTo,
} from "@/lib/desk-filter-prefs";
import {
  matchesInvoiceFilter,
  type InvoiceClientSummary,
  type InvoiceDeskFilter,
} from "@/lib/invoice-client-status";

export type InvoiceClientListItem = {
  id: string;
  slug: string;
  name: string;
  type: string;
  invoices: InvoiceClientSummary;
};

const FILTER_DEFAULTS = [
  { id: "all", label: "All" },
  { id: "due", label: "Due" },
  { id: "sent", label: "Sent" },
  { id: "paid", label: "Paid" },
] as const;

const MAP_OPTIONS = [
  { id: "due", label: "Due" },
  { id: "sent", label: "Sent" },
  { id: "paid", label: "Paid" },
];

function matchesSearch(client: InvoiceClientListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) ||
    client.slug.toLowerCase().includes(q)
  );
}

export function InvoiceClientsList({
  clients,
}: {
  clients: InvoiceClientListItem[];
}) {
  const [filterId, setFilterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const filterPrefs = useDeskFilterPrefs("invoices", [...FILTER_DEFAULTS]);

  const counts = useMemo(() => {
    let due = 0;
    let paid = 0;
    let sent = 0;
    for (const row of clients) {
      if (row.invoices.dueCount > 0) due += 1;
      if (row.invoices.paidCount > 0) paid += 1;
      if (row.invoices.sentCount > 0) sent += 1;
    }
    return { all: clients.length, due, paid, sent };
  }, [clients]);

  const activeMapsTo = resolveFilterMapsTo(filterPrefs.prefs, filterId);

  const visible = useMemo(
    () =>
      clients.filter(
        (row) =>
          matchesInvoiceFilter(
            row.invoices,
            activeMapsTo as InvoiceDeskFilter,
          ) && matchesSearch(row, searchQuery),
      ),
    [clients, activeMapsTo, searchQuery],
  );

  const searchTrimmed = searchQuery.trim();

  return (
    <div className="space-y-4">
      <label className="sr-only" htmlFor="invoice-clients-search">
        Search invoice clients
      </label>
      <input
        id="invoice-clients-search"
        type="search"
        className="input max-w-md"
        placeholder="Search client…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <DeskFilterBar
        label="Invoice filters"
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
          const inv = c.invoices;
          const tintKey =
            inv.highlight === "none" ? "all" : inv.highlight;
          const tint = cardTintClass(
            colorForMapsTo(filterPrefs.prefs, tintKey),
          );
          return (
            <PendingLink
              key={c.id}
              href={`/invoices?client=${encodeURIComponent(c.slug)}`}
              className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
              pendingLabel="Opening invoices…"
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

                  <p className="mt-1 text-sm capitalize text-ink-soft">
                    {c.type.replace(/_/g, " ")}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, "due"),
                      )}
                    >
                      Due {inv.dueCount}
                      {inv.dueCount > 0 ? ` · ${money(inv.duePence)}` : ""}
                    </span>
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, "sent"),
                      )}
                    >
                      Sent {inv.sentCount}
                      {inv.sentCount > 0 ? ` · ${money(inv.sentPence)}` : ""}
                    </span>
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, "paid"),
                      )}
                    >
                      Paid {inv.paidCount}
                      {inv.paidCount > 0 ? ` · ${money(inv.paidPence)}` : ""}
                    </span>
                  </div>
                </>
              )}
            </PendingLink>
          );
        })}
      </div>
    </div>
  );
}
