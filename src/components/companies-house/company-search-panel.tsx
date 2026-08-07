"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type SearchItem = {
  company_number: string;
  title: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  address_snippet?: string;
};

type Officer = {
  name: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  nationality?: string;
  identity_verification_details?: { identity_verified_on?: string };
};

type Psc = {
  name?: string;
  kind?: string;
  natures_of_control?: string[];
  notified_on?: string;
  ceased_on?: string;
};

type Bundle = {
  configured?: boolean;
  message?: string;
  profile?: {
    company_number: string;
    company_name: string;
    company_status?: string;
    type?: string;
    date_of_creation?: string;
    sic_codes?: string[];
    registered_office_address?: Record<string, string | undefined>;
    confirmation_statement?: { next_due?: string };
    accounts?: { next_due?: string };
  };
  officers?: Officer[];
  pscs?: Psc[];
  source?: { note?: string; register?: string };
};

export function CompanySearchPanel({
  onSelectCompany,
}: {
  onSelectCompany?: (company: {
    number: string;
    name: string;
  }) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search() {
    setError(null);
    setBundle(null);
    start(async () => {
      try {
        const res = await fetch(
          `/api/companies-house/search?q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setItems(data.items ?? []);
        setHint(data.message ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    });
  }

  function openCompany(number: string) {
    setError(null);
    start(async () => {
      try {
        const res = await fetch(
          `/api/companies-house/search?company_number=${encodeURIComponent(number)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lookup failed");
        setBundle(data);
        setHint(data.message ?? null);
        if (data.profile && onSelectCompany) {
          onSelectCompany({
            number: data.profile.company_number,
            name: data.profile.company_name,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
      }
    });
  }

  return (
    <div className="panel gloss-card space-y-4 p-5">
      <div>
        <h2 className="display text-2xl text-ink">Companies House search</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Search by company name or number. We pull profile, directors
          (officers) and persons with significant control from the official
          Public Data API.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Company name or number…"
          className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          disabled={pending || !q.trim()}
          onClick={search}
          className="btn btn-primary disabled:opacity-60"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </div>

      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((item) => (
            <li key={item.company_number}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-3 text-left hover:bg-sea/5"
                onClick={() => openCompany(item.company_number)}
              >
                <span className="font-semibold text-ink">{item.title}</span>
                <span className="mono text-xs text-ink-soft">
                  {item.company_number}
                  {item.company_status ? ` · ${item.company_status}` : ""}
                </span>
                {item.address_snippet && (
                  <span className="text-xs text-ink-soft">
                    {item.address_snippet}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {bundle?.profile && (
        <div className="space-y-4 rounded-xl border border-sea/25 bg-sea/5 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sea">
              Company profile
            </p>
            <h3 className="display mt-1 text-2xl text-ink">
              {bundle.profile.company_name}
            </h3>
            <p className="mono mt-1 text-sm text-ink-soft">
              {bundle.profile.company_number}
              {bundle.profile.company_status
                ? ` · ${bundle.profile.company_status}`
                : ""}
              {bundle.profile.date_of_creation
                ? ` · formed ${bundle.profile.date_of_creation}`
                : ""}
            </p>
            {bundle.profile.sic_codes?.length ? (
              <p className="mt-2 text-sm text-ink-soft">
                SIC: {bundle.profile.sic_codes.join(", ")}
              </p>
            ) : null}
            {bundle.profile.confirmation_statement?.next_due && (
              <p className="mt-1 text-sm text-ink-soft">
                CS next due: {bundle.profile.confirmation_statement.next_due}
              </p>
            )}
            {bundle.profile.accounts?.next_due && (
              <p className="text-sm text-ink-soft">
                Accounts next due: {bundle.profile.accounts.next_due}
              </p>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-ink">
              Directors / officers ({bundle.officers?.length ?? 0})
            </h4>
            <ul className="mt-2 space-y-2 text-sm">
              {(bundle.officers ?? []).slice(0, 12).map((o) => (
                <li
                  key={`${o.name}-${o.appointed_on}`}
                  className="rounded-lg border border-line/80 bg-white px-3 py-2"
                >
                  <p className="font-semibold text-ink">{o.name}</p>
                  <p className="text-xs text-ink-soft">
                    {o.officer_role}
                    {o.appointed_on ? ` · appointed ${o.appointed_on}` : ""}
                    {o.resigned_on ? ` · resigned ${o.resigned_on}` : ""}
                    {o.identity_verification_details?.identity_verified_on
                      ? " · ID verified"
                      : ""}
                  </p>
                </li>
              ))}
              {!bundle.officers?.length && (
                <li className="text-ink-soft">No officers returned.</li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-ink">
              Persons with significant control ({bundle.pscs?.length ?? 0})
            </h4>
            <p className="mt-1 text-xs text-ink-soft">
              PSC data is the structured ownership view on the public API. A
              full shareholder register is often only in filed documents, not
              searchable JSON.
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {(bundle.pscs ?? []).map((p, i) => (
                <li
                  key={`${p.name}-${i}`}
                  className="rounded-lg border border-line/80 bg-white px-3 py-2"
                >
                  <p className="font-semibold text-ink">
                    {p.name ?? "Name protected / unavailable"}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {p.kind}
                    {p.natures_of_control?.length
                      ? ` · ${p.natures_of_control.join("; ")}`
                      : ""}
                  </p>
                </li>
              ))}
              {!bundle.pscs?.length && (
                <li className="text-ink-soft">No PSC records returned.</li>
              )}
            </ul>
          </div>

          <p className="text-xs text-ink-soft">
            {bundle.source?.note}{" "}
            <a
              href={
                bundle.source?.register ??
                "https://find-and-update.company-information.service.gov.uk/"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sea"
            >
              View on Companies House register
            </a>
            . Need personal codes?{" "}
            <Link
              href="/companies-house/personal-code"
              className="font-semibold text-sea"
            >
              Guidance
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
