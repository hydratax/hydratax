"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ClientRow = {
  id: string;
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

export function DashboardClientList({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(clients[0]?.id ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        (c.vrn ?? "").includes(q) ||
        (c.companyNumber ?? "").includes(q),
    );
  }, [clients, query]);

  const active = filtered.find((c) => c.id === activeId) ?? filtered[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-2xl text-ink">Clients</h2>
            <p className="text-sm text-ink-soft">
              Search and open a workspace in one click
            </p>
          </div>
          <Link href="/clients/new" className="btn btn-primary text-sm">
            Add client
          </Link>
        </div>

        <label className="sr-only" htmlFor="client-search">
          Search clients
        </label>
        <input
          id="client-search"
          className="input mb-3"
          placeholder="Search name, VRN, company number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul>
          {filtered.length === 0 && (
            <li className="py-6 text-center text-sm text-ink-soft">
              No clients match “{query}”
            </li>
          )}
          {filtered.map((client) => {
            const selected = active?.id === client.id;
            return (
              <li key={client.id}>
                <button
                  type="button"
                  className={`client-row w-full text-left ${selected ? "bg-sea/[0.06]" : ""}`}
                  onClick={() => setActiveId(client.id)}
                  onDoubleClick={() => {
                    window.location.href = `/clients/${client.id}`;
                  }}
                >
                  <div>
                    <p className="font-semibold text-ink">{client.name}</p>
                    <p className="text-sm capitalize text-ink-soft">
                      {client.type.replace("_", " ")}
                      {client.isVatRegistered ? " · VAT" : ""}
                      {client.isEmployer ? " · PAYE" : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-sea">Select</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="panel flex flex-col p-5">
        {active ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
              Selected client
            </p>
            <h3 className="display mt-1 text-3xl text-ink">{active.name}</h3>
            <p className="mt-1 capitalize text-ink-soft">
              {active.type.replace("_", " ")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {MODULES.map((m) => {
                if (m.key === "sa" && active.type === "limited_company") return null;
                if (m.key === "ct" && active.type !== "limited_company") return null;
                if (m.key === "pay" && !active.isEmployer) return null;
                if (m.key === "vat" && !active.isVatRegistered) return null;
                return (
                  <Link
                    key={m.key}
                    href={`/clients/${active.id}/${m.path}`}
                    className="module-chip"
                  >
                    {m.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-8">
              <Link href={`/clients/${active.id}`} className="btn btn-primary">
                Open workspace
              </Link>
              <Link
                href={`/clients/${active.id}/books`}
                className="btn btn-secondary"
              >
                Go to books
              </Link>
            </div>
          </>
        ) : (
          <p className="text-ink-soft">Select a client to see quick actions.</p>
        )}
      </div>
    </div>
  );
}
