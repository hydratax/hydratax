"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { authEntryHref } from "@/lib/auth-return";
import type { ChCompanySnapshot } from "@/lib/ch-wizard-shared";
import { hasSignedInSession } from "@/server/actions/session-check";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ChWizardSignInGate({
  returnPath,
  title = "Sign in required",
  blurb = "Company authentication codes are only collected after you sign in.",
}: {
  returnPath: string;
  title?: string;
  blurb?: string;
}) {
  return (
    <div className="panel gloss-card space-y-4 p-5">
      <div>
        <h2 className="display text-2xl text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ink-soft">{blurb}</p>
      </div>
      <Link
        href={authEntryHref("sign-in", returnPath)}
        className="btn btn-primary inline-flex w-full justify-center"
      >
        Sign in to continue
      </Link>
      <p className="text-xs text-ink-soft">
        No account?{" "}
        <Link href={authEntryHref("create-account", returnPath)} className="text-sea">
          Create one
        </Link>
      </p>
    </div>
  );
}

export function ChWizardStepNav({
  steps,
  currentIndex,
}: {
  steps: { id: string; label: string }[];
  currentIndex: number;
}) {
  return (
    <nav
      aria-label="Filing progress"
      className="flex flex-wrap items-center justify-center gap-2 border-b border-line pb-4"
    >
      {steps.map((s, i) => (
        <span
          key={s.id}
          className="filing-step"
          data-active={currentIndex === i || undefined}
          data-done={currentIndex > i || undefined}
        >
          <span>{i + 1}</span>
          {s.label}
        </span>
      ))}
    </nav>
  );
}

export function ChCompanySummaryCard({ company }: { company: ChCompanySnapshot }) {
  return (
    <div className="rounded-2xl border border-line bg-sea/[0.06] px-5 py-4">
      <p className="display text-2xl leading-tight text-ink md:text-3xl">
        {company.companyName}
      </p>
      <p className="mono mt-2 text-sm text-ink-soft">{company.companyNumber}</p>
      {company.registeredOffice ? (
        <p className="mt-2 text-sm text-ink-soft">{company.registeredOffice}</p>
      ) : null}
    </div>
  );
}

export function ChAuthCodeField({
  value,
  onChange,
  id = "ch-auth-code",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="rounded-xl border border-sea/30 bg-sea/5 p-4">
      <label className="label" htmlFor={id}>
        Company authentication code
        <span className="font-normal text-danger"> *</span>
        <input
          id={id}
          className="input mt-1.5 mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Authentication code"
          autoComplete="one-time-code"
          data-1p-ignore="true"
          data-lpignore="true"
          required
        />
      </label>
      <p className="mt-2 text-xs text-ink-soft">
        From Companies House online filing — required before payment. Never your
        HMRC Government Gateway ID.
      </p>
    </div>
  );
}

export function ChWizardShell({
  returnPath,
  price,
  error,
  pending,
  onPay,
  payLabel,
  payDisabled,
  children,
  footer,
}: {
  returnPath: string;
  price: string;
  error: string | null;
  pending: boolean;
  onPay: () => void;
  payLabel?: string;
  payDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasSignedInSession().then((ok) => {
      if (!cancelled) setSignedIn(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === null) {
    return (
      <div className="panel gloss-card p-5">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  if (!signedIn) {
    return <ChWizardSignInGate returnPath={returnPath} />;
  }

  return (
    <div className="panel gloss-card space-y-5 overflow-visible p-4 sm:p-6">
      {children}
      <FormErrorBanner error={error} />
      <div className="rounded-xl border border-line bg-sand/40 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="font-semibold text-ink">You pay</span>
          <span className="price-amount text-2xl">{price}</span>
        </div>
      </div>
      {footer}
      <button
        type="button"
        disabled={pending || payDisabled}
        className="btn btn-primary w-full"
        onClick={onPay}
      >
        {pending ? "Opening checkout…" : (payLabel ?? `Pay ${price} & submit`)}
      </button>
    </div>
  );
}

export function ChCompanySearchStep({
  searchQuery,
  onSearchQueryChange,
  searchHits,
  lookupPending,
  onSelectCompany,
  onSearch,
}: {
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  searchHits: Array<{
    company_number: string;
    title: string;
    company_status?: string;
    address_snippet?: string;
  }>;
  lookupPending: boolean;
  onSelectCompany: (companyNumber: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Search Companies House by company name or number.
      </p>
      <label className="label" htmlFor="ch-wizard-search">
        Company name or number
        <input
          id="ch-wizard-search"
          className="input mt-1.5"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearch();
            }
          }}
          placeholder="Search company"
          autoComplete="organization"
        />
      </label>
      {lookupPending && (
        <p className="text-xs text-ink-soft">Searching Companies House…</p>
      )}
      {searchHits.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {searchHits.map((item) => (
            <li key={item.company_number}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-sea/5"
                onClick={() => onSelectCompany(item.company_number)}
              >
                <span className="font-semibold text-ink">{item.title}</span>
                <span className="mono text-xs text-ink-soft">
                  {item.company_number}
                  {item.company_status ? ` · ${item.company_status}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
