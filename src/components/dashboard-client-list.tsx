"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ClientRow = {
  id: string;
  slug: string;
  name: string;
  type: string;
  isVatRegistered: boolean;
  isEmployer: boolean;
  vrn: string | null;
  companyNumber: string | null;
};

const MODULES = [
  { key: "books", label: "Books", path: "books" },
  { key: "vat", label: "VAT", path: "vat" },
  { key: "sa", label: "SA", path: "self-assessment" },
  { key: "ct", label: "Corporation Tax", path: "corporation-tax" },
  { key: "pay", label: "Payroll", path: "payroll" },
] as const;

type ViewMode = "cards" | "list";

function typeLabel(type: string) {
  return type.replace("_", " ");
}

function clientHref(client: ClientRow, path?: string) {
  const base = `/clients/${client.slug || client.id}`;
  return path ? `${base}/${path}` : base;
}

export function DashboardClientList({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    try {
      const saved = localStorage.getItem("hydratax_dashboard_client_view");
      if (saved === "cards" || saved === "list") return saved;
    } catch {
      /* ignore */
    }
    return "cards";
  });

  function setViewMode(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem("hydratax_dashboard_client_view", next);
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        (c.vrn ?? "").includes(q) ||
        (c.companyNumber ?? "").includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-ink">Clients</h2>
          <p className="text-sm text-ink-soft">
            Search and open a workspace in one click
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-line p-0.5"
            role="group"
            aria-label="Client view"
          >
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                view === "cards" ? "bg-sea/10 text-sea" : "text-ink-soft"
              }`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                view === "list" ? "bg-sea/10 text-sea" : "text-ink-soft"
              }`}
              onClick={() => setViewMode("list")}
            >
              List
            </button>
          </div>
          <Link href="/clients/new" className="btn btn-primary text-sm">
            Add client
          </Link>
        </div>
      </div>

      <label className="sr-only" htmlFor="client-search">
        Search clients
      </label>
      <input
        id="client-search"
        className="input max-w-md"
        placeholder="Search name, VRN, company number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-soft">
          No clients match “{query}”
        </p>
      )}

      {view === "cards" && filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((client) => (
            <Link
              key={client.id}
              href={clientHref(client)}
              className="panel panel-interactive block p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="display text-2xl text-ink">{client.name}</h3>
                  <p className="mt-1 capitalize text-sm text-ink-soft">
                    {typeLabel(client.type)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-sea">
                  Open →
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {client.isVatRegistered && (
                  <span className="badge badge-sea">VAT</span>
                )}
                {client.isEmployer && (
                  <span className="badge badge-muted">PAYE</span>
                )}
                {client.type === "limited_company" && (
                  <span className="badge badge-muted">CT600</span>
                )}
                {client.type !== "limited_company" && (
                  <span className="badge badge-muted">Self Assessment</span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {MODULES.map((m) => {
                  if (m.key === "sa" && client.type === "limited_company")
                    return null;
                  if (m.key === "ct" && client.type !== "limited_company")
                    return null;
                  if (m.key === "pay" && !client.isEmployer) return null;
                  if (m.key === "vat" && !client.isVatRegistered) return null;
                  return (
                    <span key={m.key} className="module-chip">
                      {m.label}
                    </span>
                  );
                })}
              </div>
              <p className="mono mt-3 text-xs text-ink-soft">
                {[
                  client.vrn && `VRN ${client.vrn}`,
                  client.companyNumber,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No identifiers yet"}
              </p>
            </Link>
          ))}
        </div>
      )}

      {view === "list" && filtered.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {filtered.map((client) => (
            <li key={client.id}>
              <Link
                href={clientHref(client)}
                className="client-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-sea/[0.04]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{client.name}</p>
                  <p className="text-sm capitalize text-ink-soft">
                    {typeLabel(client.type)}
                    {client.isVatRegistered ? " · VAT" : ""}
                    {client.isEmployer ? " · PAYE" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-sea">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
