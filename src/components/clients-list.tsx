"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber: string | null;
  utr: string | null;
  vrn: string | null;
  isVatRegistered: boolean;
  isEmployer: boolean;
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
};

const FILTERS: { id: FilingFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cs_due_soon", label: "CS due soon" },
  { id: "cs_overdue", label: "CS overdue" },
  { id: "accounts_due_soon", label: "Accounts due soon" },
  { id: "accounts_overdue", label: "Accounts overdue" },
  { id: "any_due_soon", label: "Any due soon" },
  { id: "any_overdue", label: "Any overdue" },
];

function urgencyClass(u: FilingUrgency) {
  if (u === "overdue") return "filing-btn filing-btn--overdue";
  if (u === "due_soon") return "filing-btn filing-btn--due-soon";
  if (u === "ok") return "filing-btn filing-btn--ok";
  return "filing-btn filing-btn--muted";
}

function ConfirmationStatusButton({
  urgency,
  due,
}: {
  urgency: FilingUrgency;
  due: string | null;
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
      className={urgencyClass(urgency)}
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
}: {
  urgency: FilingUrgency;
  due: string | null;
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
      className={urgencyClass(urgency)}
      title={date ? `Annual accounts due ${date}` : "No accounts due date"}
    >
      {label}
      {date ? ` · ${date}` : ""}
    </span>
  );
}

export function ClientsList({ clients }: { clients: ClientListItem[] }) {
  const [filter, setFilter] = useState<FilingFilter>("all");

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
      cs_due_soon: 0,
      cs_overdue: 0,
      accounts_due_soon: 0,
      accounts_overdue: 0,
    };
    for (const row of enriched) {
      if (row.status.confirmation === "due_soon") c.cs_due_soon += 1;
      if (row.status.confirmation === "overdue") c.cs_overdue += 1;
      if (row.status.accounts === "due_soon") c.accounts_due_soon += 1;
      if (row.status.accounts === "overdue") c.accounts_overdue += 1;
    }
    return c;
  }, [enriched]);

  const visible = useMemo(
    () => enriched.filter((row) => matchesFilingFilter(row.status, filter)),
    [enriched, filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filing filters">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count =
            f.id === "cs_due_soon"
              ? counts.cs_due_soon
              : f.id === "cs_overdue"
                ? counts.cs_overdue
                : f.id === "accounts_due_soon"
                  ? counts.accounts_due_soon
                  : f.id === "accounts_overdue"
                    ? counts.accounts_overdue
                    : f.id === "any_due_soon"
                      ? counts.cs_due_soon + counts.accounts_due_soon
                      : f.id === "any_overdue"
                        ? counts.cs_overdue + counts.accounts_overdue
                        : clients.length;

          const tone =
            f.id.includes("overdue")
              ? "is-overdue"
              : f.id.includes("due_soon")
                ? "is-due-soon"
                : "";

          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`filing-filter ${tone} ${active ? "is-active" : ""}`}
            >
              {f.label}
              <span className="filing-filter__count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-ink-soft">
            No clients match this filter.
          </p>
        )}
        {visible.map(({ client: c, status }) => {
          const highlight =
            status.worst === "overdue"
              ? "client-card--overdue"
              : status.worst === "due_soon"
                ? "client-card--due-soon"
                : "";

          return (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className={`panel panel-interactive block p-5 ${highlight}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.type === "limited_company" && (
                      <ConfirmationStatusButton
                        urgency={status.confirmation}
                        due={status.confirmationDue}
                      />
                    )}
                    <h2 className="display text-2xl text-ink">{c.name}</h2>
                  </div>
                  <p className="mt-1 capitalize text-sm text-ink-soft">
                    {c.type.replace("_", " ")}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-sea">
                  Open →
                </span>
              </div>

              {c.type === "limited_company" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <AccountsStatusButton
                    urgency={status.accounts}
                    due={status.accountsDue}
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
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
              <p className="mono mt-3 text-xs text-ink-soft">
                {[
                  c.vrn && `VRN ${c.vrn}`,
                  c.utr && `UTR ${c.utr}`,
                  c.companyNumber,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No identifiers yet"}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
