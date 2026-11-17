"use client";

import { useMemo, useState } from "react";
import { SecretarialCompanyCard } from "@/components/company-secretarial/secretarial-company-card";

export type SecretarialCompanyListItem = {
  href: string;
  name: string;
  companyNumber: string | null;
  status: string | null;
  addressSnippet: string | null;
  confirmationDue: string | null;
};

function matchesCompanySearch(
  company: SecretarialCompanyListItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    company.name.toLowerCase().includes(q) ||
    (company.companyNumber ?? "").toLowerCase().includes(q) ||
    (company.status ?? "").toLowerCase().includes(q) ||
    (company.addressSnippet ?? "").toLowerCase().includes(q)
  );
}

export function SecretarialCompanyList({
  companies,
}: {
  companies: SecretarialCompanyListItem[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => companies.filter((c) => matchesCompanySearch(c, query)),
    [companies, query],
  );

  return (
    <div className="space-y-5">
      <label className="block max-w-xl">
        <span className="sr-only">Search companies</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by company name or number"
          className="input w-full"
          autoComplete="off"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="display text-2xl text-ink">No matching companies</p>
          <p className="mt-2 text-ink-soft">
            Try another name or company number.
          </p>
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <SecretarialCompanyCard
              key={c.href}
              href={c.href}
              name={c.name}
              companyNumber={c.companyNumber}
              status={c.status}
              addressSnippet={c.addressSnippet}
              confirmationDue={c.confirmationDue}
            />
          ))}
        </div>
      )}
    </div>
  );
}
