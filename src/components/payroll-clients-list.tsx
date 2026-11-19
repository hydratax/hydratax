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
import { maskAccountsOfficeRef } from "@/lib/mask-identifiers";
import {
  matchesPayrollFilter,
  payrollFrequencyLabel,
  payrollStatusLabel,
  type PayrollClientFilter,
  type PayrollClientSummary,
} from "@/lib/payroll-client-status";

export type PayrollClientListItem = {
  id: string;
  slug: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  accountsOfficeRef?: string | null;
  payeRef?: string | null;
  employeeCount?: number;
  payroll: PayrollClientSummary;
};

const FILTER_DEFAULTS = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not started" },
  { id: "generated", label: "Generated" },
  { id: "submitted", label: "RTI submitted" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
] as const;

const MAP_OPTIONS = FILTER_DEFAULTS.filter((f) => f.id !== "all").map((f) => ({
  id: f.id,
  label: f.label,
}));

function matchesSearch(client: PayrollClientListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    client.name.toLowerCase().includes(q) ||
    (client.payeRef ?? "").toLowerCase().includes(q) ||
    (client.accountsOfficeRef ?? "").toLowerCase().includes(q) ||
    client.slug.toLowerCase().includes(q)
  );
}

export function PayrollClientsList({
  clients,
}: {
  clients: PayrollClientListItem[];
}) {
  const [filterId, setFilterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const filterPrefs = useDeskFilterPrefs("payroll", [...FILTER_DEFAULTS]);

  const counts = useMemo(() => {
    const c = {
      all: clients.length,
      not_started: 0,
      generated: 0,
      submitted: 0,
      monthly: 0,
      weekly: 0,
    };
    for (const row of clients) {
      if (row.payroll.status === "not_started") c.not_started += 1;
      if (row.payroll.status === "generated") c.generated += 1;
      if (row.payroll.status === "submitted") c.submitted += 1;
      if (row.payroll.payFrequency === "M1") c.monthly += 1;
      if (row.payroll.payFrequency === "W1") c.weekly += 1;
    }
    return c;
  }, [clients]);

  const activeMapsTo = resolveFilterMapsTo(filterPrefs.prefs, filterId);

  const visible = useMemo(
    () =>
      clients.filter(
        (row) =>
          matchesPayrollFilter(
            row.payroll,
            activeMapsTo as PayrollClientFilter,
          ) && matchesSearch(row, searchQuery),
      ),
    [clients, activeMapsTo, searchQuery],
  );

  const searchTrimmed = searchQuery.trim();

  return (
    <div className="space-y-4">
      <label className="sr-only" htmlFor="payroll-clients-search">
        Search payroll clients
      </label>
      <input
        id="payroll-clients-search"
        type="search"
        className="input max-w-md"
        placeholder="Search name, PAYE ref, Accounts Office ref…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <DeskFilterBar
        label="Payroll filters"
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
              ? `No employers match “${searchTrimmed}”.`
              : "No employers match this filter."}
          </p>
        )}
        {visible.map((c) => {
          const { payroll } = c;
          const tint = cardTintClass(
            colorForMapsTo(filterPrefs.prefs, payroll.status),
          );
          return (
            <PendingLink
              key={c.id}
              href={`/clients/${c.slug}/payroll`}
              className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
              pendingLabel="Opening payroll…"
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
                    {payrollFrequencyLabel(payroll.payFrequency)} payroll
                    {c.type === "limited_company" ? " · Limited company" : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, payroll.status),
                      )}
                    >
                      {payrollStatusLabel(payroll.status)}
                    </span>
                    <span className="filing-btn filing-btn--muted">
                      {payrollFrequencyLabel(payroll.payFrequency)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-ink">
                    {payroll.periodLabel ? (
                      <>
                        Latest period{" "}
                        <span className="paye-digits font-semibold">
                          {payroll.periodLabel}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-soft">No pay run yet</span>
                    )}
                  </p>

                  <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                    {[
                      c.payeRef && `PAYE ${c.payeRef}`,
                      c.accountsOfficeRef &&
                        `AO ${maskAccountsOfficeRef(c.accountsOfficeRef)}`,
                      typeof c.employeeCount === "number"
                        ? `${c.employeeCount} employee${c.employeeCount === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No payroll refs yet"}
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
