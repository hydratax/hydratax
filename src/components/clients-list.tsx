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
  type DeskFilterColor,
} from "@/lib/desk-filter-prefs";
import { maskUtr } from "@/lib/mask-identifiers";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  filingStatusFromSnapshot,
  formatDueShort,
  matchesFilingFilter,
  type FilingFilter,
  type FilingUrgency,
} from "@/lib/filing-due";

export type ClientListItem = {
  id: string;
  slug: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber: string | null;
  utr: string | null;
  vrn: string | null;
  isVatRegistered: boolean;
  isEmployer: boolean;
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
};

const FILTER_DEFAULTS = [
  { id: "all", label: "All" },
  { id: "cs_due_soon", label: "CS due soon" },
  { id: "cs_overdue", label: "CS overdue" },
  { id: "accounts_due_soon", label: "Accounts due soon" },
  { id: "accounts_overdue", label: "Accounts overdue" },
  { id: "any_due_soon", label: "Any due soon" },
  { id: "any_overdue", label: "Any overdue" },
] as const;

const MAP_OPTIONS = FILTER_DEFAULTS.filter((f) => f.id !== "all").map((f) => ({
  id: f.id,
  label: f.label,
}));

function matchesClientSearch(client: ClientListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const typeLabel = client.type.replace("_", " ");
  return (
    client.name.toLowerCase().includes(q) ||
    typeLabel.includes(q) ||
    (client.vrn ?? "").toLowerCase().includes(q) ||
    (client.utr ?? "").toLowerCase().includes(q) ||
    (client.companyNumber ?? "").toLowerCase().includes(q) ||
    client.slug.toLowerCase().includes(q)
  );
}

function urgencyColor(
  prefs: ReturnType<typeof useDeskFilterPrefs>["prefs"],
  kind: "cs" | "accounts",
  urgency: FilingUrgency,
): DeskFilterColor {
  if (urgency === "overdue") {
    return colorForMapsTo(prefs, `${kind}_overdue`);
  }
  if (urgency === "due_soon") {
    return colorForMapsTo(prefs, `${kind}_due_soon`);
  }
  if (urgency === "ok") return "green";
  return "colorless";
}

function ConfirmationStatusButton({
  urgency,
  due,
  color,
}: {
  urgency: FilingUrgency;
  due: string | null;
  color: DeskFilterColor;
}) {
  const label =
    urgency === "overdue"
      ? "CS overdue"
      : urgency === "due_soon"
        ? "CS due soon"
        : urgency === "ok"
          ? "CS ok"
          : "CS —";
  const date = formatDueShort(due);
  return (
    <span
      className={chipColorClass(color)}
      title={date ? `Confirmation statement due ${date}` : "No CS due date"}
    >
      {label}
      {date ? ` · ${date}` : ""}
    </span>
  );
}

function AccountsStatusButton({
  urgency,
  due,
  color,
}: {
  urgency: FilingUrgency;
  due: string | null;
  color: DeskFilterColor;
}) {
  const label =
    urgency === "overdue"
      ? "Accounts overdue"
      : urgency === "due_soon"
        ? "Accounts due soon"
        : urgency === "ok"
          ? "Accounts ok"
          : "Accounts —";
  const date = formatDueShort(due);
  return (
    <span
      className={chipColorClass(color)}
      title={date ? `Annual accounts due ${date}` : "No accounts due date"}
    >
      {label}
      {date ? ` · ${date}` : ""}
    </span>
  );
}

/** Path suffix after `/clients/:slug` — e.g. `/vat` opens the VAT tab. */
export type ClientOpenPath =
  | ""
  | "/vat"
  | "/payroll"
  | "/corporation-tax"
  | "/self-assessment"
  | "/sa800";

export function ClientsList({
  clients,
  openPath = "",
}: {
  clients: ClientListItem[];
  /** When opening from a domain desk, land on that tab. */
  openPath?: ClientOpenPath;
}) {
  const [filterId, setFilterId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const filterPrefs = useDeskFilterPrefs("clients", [...FILTER_DEFAULTS]);

  const enriched = useMemo(
    () =>
      clients.map((c) => {
        const status = filingStatusFromSnapshot(
          c.type === "limited_company" ? c.companiesHouse : null,
        );
        return { client: c, status };
      }),
    [clients],
  );

  const counts = useMemo(() => {
    const c = {
      all: clients.length,
      cs_due_soon: 0,
      cs_overdue: 0,
      accounts_due_soon: 0,
      accounts_overdue: 0,
      any_due_soon: 0,
      any_overdue: 0,
    };
    for (const row of enriched) {
      if (row.status.confirmation === "due_soon") c.cs_due_soon += 1;
      if (row.status.confirmation === "overdue") c.cs_overdue += 1;
      if (row.status.accounts === "due_soon") c.accounts_due_soon += 1;
      if (row.status.accounts === "overdue") c.accounts_overdue += 1;
    }
    c.any_due_soon = c.cs_due_soon + c.accounts_due_soon;
    c.any_overdue = c.cs_overdue + c.accounts_overdue;
    return c;
  }, [clients.length, enriched]);

  const activeMapsTo = resolveFilterMapsTo(
    filterPrefs.prefs,
    filterId,
  ) as FilingFilter;

  const visible = useMemo(
    () =>
      enriched.filter(
        (row) =>
          matchesFilingFilter(row.status, activeMapsTo) &&
          matchesClientSearch(row.client, searchQuery),
      ),
    [enriched, activeMapsTo, searchQuery],
  );

  const searchTrimmed = searchQuery.trim();

  return (
    <div className="space-y-4">
      <label className="sr-only" htmlFor="clients-search">
        Search clients
      </label>
      <input
        id="clients-search"
        type="search"
        className="input max-w-md"
        placeholder="Search name, company number, UTR, VRN…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <DeskFilterBar
        label="Filing filters"
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
        {visible.map(({ client: c, status }) => {
          const tintKey =
            status.worst === "overdue"
              ? status.confirmation === "overdue"
                ? "cs_overdue"
                : "accounts_overdue"
              : status.worst === "due_soon"
                ? status.confirmation === "due_soon"
                  ? "cs_due_soon"
                  : "accounts_due_soon"
                : "all";
          const tint = cardTintClass(
            colorForMapsTo(filterPrefs.prefs, tintKey),
          );

          return (
            <PendingLink
              key={c.id}
              href={`/clients/${c.slug}${openPath}`}
              className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
              pendingLabel="Opening client…"
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
                    {c.type.replace("_", " ")}
                  </p>

                  {c.type === "limited_company" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ConfirmationStatusButton
                        urgency={status.confirmation}
                        due={status.confirmationDue}
                        color={urgencyColor(
                          filterPrefs.prefs,
                          "cs",
                          status.confirmation,
                        )}
                      />
                      <AccountsStatusButton
                        urgency={status.accounts}
                        due={status.accountsDue}
                        color={urgencyColor(
                          filterPrefs.prefs,
                          "accounts",
                          status.accounts,
                        )}
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.isVatRegistered && (
                      <span className="badge badge-sea">VAT</span>
                    )}
                    {c.isEmployer && (
                      <span className="badge badge-muted">PAYE</span>
                    )}
                    {c.type === "limited_company" && (
                      <span className="badge badge-muted">CT600</span>
                    )}
                    {c.type !== "limited_company" && (
                      <span className="badge badge-muted">Self Assessment</span>
                    )}
                  </div>

                  <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                    {[
                      c.vrn && `VRN ${c.vrn}`,
                      c.utr && `UTR ${maskUtr(c.utr)}`,
                      c.companyNumber,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No identifiers yet"}
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
