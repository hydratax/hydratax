"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  formatChFeeBreakdown,
  type ChServiceDetail,
} from "@/lib/ch-services";
import { formatDueLabel, filingUrgency } from "@/lib/ch-deadlines";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import {
  YearEndFilingForm,
  type YearEndFilingMode,
  type LastFiledAccounts,
} from "@/components/forms/year-end-filing-form";
import {
  type AccountsWizardDraft,
  type AccountsWizardPhase,
  clearAccountsDraft,
  loadAccountsDraft,
  saveAccountsDraft,
} from "@/lib/accounts-wizard-draft";
import { authEntryHref, appendReturnParams } from "@/lib/auth-return";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type CompanyView = {
  companyNumber: string;
  companyName: string;
  status: string | null;
  registeredOffice: string;
  accountsNextDue: string | null;
  lastAccountsMadeUpTo: string | null;
  periodStart: string;
  periodEnd: string;
  directors: string[];
  sicCodes: string[];
};

const STEPS: { id: AccountsWizardPhase; label: string }[] = [
  { id: "search", label: "Find company" },
  { id: "period", label: "Period due" },
  { id: "options", label: "Filing options" },
  { id: "details", label: "Enter details" },
  { id: "pay", label: "Payment" },
];

const FILING_OPTIONS: {
  id: YearEndFilingMode;
  title: string;
  blurb: string;
}[] = [
  {
    id: "accounts",
    title: "Accounts only",
    blurb: "File Companies House annual accounts for this period.",
  },
  {
    id: "ct600",
    title: "CT600 only",
    blurb: "Prepare the Corporation Tax return without filing accounts here.",
  },
  {
    id: "both",
    title: "File both",
    blurb: "Prepare CT600 and Companies House accounts together.",
  },
];

function formatAddress(addr?: Record<string, string | undefined> | null) {
  if (!addr) return "";
  return [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function guessPeriodEnd(lastMadeUpTo: string | null): string {
  if (!lastMadeUpTo) return "";
  const d = new Date(`${lastMadeUpTo.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function guessPeriodStart(periodEnd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return "";
  const d = new Date(`${periodEnd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function figuresPersistKey(companyNumber: string) {
  return `hydratax_year_end_figures_${companyNumber}`;
}

export function AnnualAccountsWizard({
  service,
  defaults,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
}) {
  const fees = formatChFeeBreakdown(service);
  const presetCompany =
    defaults?.companyNumber?.trim().toUpperCase() ||
    defaults?.company_number?.trim().toUpperCase() ||
    "";
  const startAtPay = defaults?.pay === "1";

  const [phase, setPhase] = useState<AccountsWizardPhase>(() =>
    presetCompany ? (startAtPay ? "pay" : "period") : "search",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<
    Array<{
      company_number: string;
      title: string;
      company_status?: string;
      address_snippet?: string;
    }>
  >([]);
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [filingMode, setFilingMode] = useState<YearEndFilingMode>("accounts");
  const [lastFiled, setLastFiled] = useState<LastFiledAccounts | null>(null);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [accountsType, setAccountsType] = useState("micro");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [lookupPending, setLookupPending] = useState(Boolean(presetCompany));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const [formPhase, setFormPhase] = useState(0);

  useEffect(() => {
    if (!company?.companyNumber) return;
    try {
      const saved = sessionStorage.getItem(
        `hydratax_ch_auth_${company.companyNumber}`,
      );
      if (saved && !companyAuthCode) setCompanyAuthCode(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.companyNumber]);

  const stepIndex = STEPS.findIndex((s) => s.id === phase);

  const postSignInPath = useMemo(() => {
    if (!company) return "/companies-house/accounts-ixbrl";
    return `/companies-house/accounts-ixbrl?company=${encodeURIComponent(company.companyNumber)}&resume=1`;
  }, [company]);

  const resumeUrl = useMemo(() => {
    if (formPhase >= 2) {
      return appendReturnParams(postSignInPath, { step: "submit" });
    }
    if (phase === "pay") {
      return appendReturnParams(postSignInPath, { pay: true });
    }
    return postSignInPath;
  }, [postSignInPath, formPhase, phase]);

  const signInHref = authEntryHref("sign-in", resumeUrl);
  const signUpHref = authEntryHref("create-account", resumeUrl);

  function persist(partial?: Partial<AccountsWizardDraft>) {
    if (!company) return;
    saveAccountsDraft({
      v: 1,
      phase,
      companyNumber: company.companyNumber,
      companyName: company.companyName,
      status: company.status,
      registeredOffice: company.registeredOffice,
      accountsNextDue: company.accountsNextDue,
      lastAccountsMadeUpTo: company.lastAccountsMadeUpTo,
      periodStart: company.periodStart,
      periodEnd: company.periodEnd,
      filingMode,
      directors: company.directors,
      updatedAt: new Date().toISOString(),
      ...partial,
    });
  }

  useEffect(() => {
    if (hydrated) return;
    setHydrated(true);
    const draft = loadAccountsDraft(presetCompany || undefined);
    if (!draft) return;
    setCompany({
      companyNumber: draft.companyNumber,
      companyName: draft.companyName,
      status: draft.status,
      registeredOffice: draft.registeredOffice,
      accountsNextDue: draft.accountsNextDue,
      lastAccountsMadeUpTo: draft.lastAccountsMadeUpTo,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      directors: draft.directors,
      sicCodes: [],
    });
    setFilingMode(draft.filingMode);
    setSearchQuery(draft.companyName);
    if (startAtPay) setPhase("pay");
    else if (defaults?.step === "submit") setPhase("details");
    else if (defaults?.pay === "1") setPhase("pay");
    else if (defaults?.resume === "1" || draft.phase) setPhase(draft.phase);
  }, [hydrated, presetCompany, startAtPay, defaults?.resume, defaults?.pay, defaults?.step]);

  // Honour mode deep-link from chooser / resume
  useEffect(() => {
    const mode = defaults?.mode;
    if (mode === "accounts" || mode === "ct600" || mode === "both") {
      setFilingMode(mode);
      if (company || presetCompany) {
        setPhase("details");
      }
    }
  }, [defaults?.mode, company, presetCompany]);

  useEffect(() => {
    if (!presetCompany || company) return;
    void loadCompany(presetCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCompany]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (phase !== "search" || q.length < 2) {
      if (q.length < 2) setSearchHits([]);
      return;
    }
    if (company && q === company.companyName) return;
    const t = setTimeout(() => {
      void searchByName(q);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, phase]);

  async function searchByName(q: string) {
    setLookupPending(true);
    setError(null);
    try {
      if (/^[A-Z0-9]{6,8}$/i.test(q) && !/\s/.test(q)) {
        await loadCompany(q.toUpperCase());
        return;
      }
      const res = await fetch(
        `/api/companies-house/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const items = (data.items ?? []) as typeof searchHits;
      setSearchHits(items);
      if (items.length === 0) {
        setError(data.message ?? "No companies matched that name.");
      } else if (items.length === 1) {
        await loadCompany(items[0].company_number);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLookupPending(false);
    }
  }

  async function loadCompany(companyNumber: string) {
    setLookupPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?company_number=${encodeURIComponent(companyNumber)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      const profile = data.profile as {
        company_name?: string;
        company_number?: string;
        company_status?: string;
        sic_codes?: string[];
        registered_office_address?: Record<string, string | undefined>;
        accounts?: {
          next_due?: string;
          last_accounts?: { made_up_to?: string };
          next_accounts?: {
            period_start_on?: string;
            period_end_on?: string;
          };
        };
      };
      if (!profile?.company_name || !profile.company_number) {
        setError("Company not found on Companies House.");
        return;
      }
      const officers = (data.officers ?? []) as Array<{
        name: string;
        officer_role?: string;
        resigned_on?: string;
      }>;
      const directors = officers
        .filter((o) => !o.resigned_on)
        .filter((o) => /director/i.test(o.officer_role ?? "director"))
        .map((o) => o.name)
        .filter(Boolean);

      const periodEnd =
        profile.accounts?.next_accounts?.period_end_on?.slice(0, 10) ||
        guessPeriodEnd(profile.accounts?.last_accounts?.made_up_to ?? null);
      const periodStart =
        profile.accounts?.next_accounts?.period_start_on?.slice(0, 10) ||
        guessPeriodStart(periodEnd);

      const view: CompanyView = {
        companyNumber: profile.company_number,
        companyName: profile.company_name,
        status: profile.company_status ?? null,
        registeredOffice: formatAddress(profile.registered_office_address),
        accountsNextDue: profile.accounts?.next_due ?? null,
        lastAccountsMadeUpTo:
          profile.accounts?.last_accounts?.made_up_to ?? null,
        periodStart,
        periodEnd,
        directors: directors.length ? directors : ["Director"],
        sicCodes: profile.sic_codes ?? [],
      };
      setCompany(view);
      setSearchQuery(view.companyName);
      setSearchHits([]);
      setPhase(startAtPay ? "pay" : "period");
      saveAccountsDraft({
        v: 1,
        phase: startAtPay ? "pay" : "period",
        companyNumber: view.companyNumber,
        companyName: view.companyName,
        status: view.status,
        registeredOffice: view.registeredOffice,
        accountsNextDue: view.accountsNextDue,
        lastAccountsMadeUpTo: view.lastAccountsMadeUpTo,
        periodStart: view.periodStart,
        periodEnd: view.periodEnd,
        filingMode,
        directors: view.directors,
        updatedAt: new Date().toISOString(),
      });

      // Last filed accounts metadata (best-effort)
      setLastFiled({
        description: "Accounts on Companies House",
        filedOn: null,
        madeUpTo: view.lastAccountsMadeUpTo,
        pages: null,
        registerUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(view.companyNumber)}/filing-history?category=accounts`,
        companyFilingHistoryUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(view.companyNumber)}/filing-history?category=accounts`,
        chPreviewUrl: `/api/companies-house/document?company=${encodeURIComponent(view.companyNumber)}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupPending(false);
    }
  }

  function go(next: AccountsWizardPhase) {
    setPhase(next);
    persist({ phase: next });
  }

  function pay() {
    if (!company) return;
    setError(null);
    if (!company.periodStart || !company.periodEnd) {
      setError("Enter the accounting period start and end dates.");
      return;
    }
    if (!companyAuthCode.trim()) {
      setError("Enter the company authentication code.");
      return;
    }
    if (!confirmed) {
      setError("Confirm the company and period details before paying.");
      return;
    }

    start(async () => {
      try {
        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          fields: {
            companyNumber: company.companyNumber,
            companyName: company.companyName,
            companyAuthCode: companyAuthCode.trim(),
            periodStart: company.periodStart,
            periodEnd: company.periodEnd,
            accountsType,
            notes,
            filingMode,
            ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
          },
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const checkout = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: res.checkoutPlanKey }),
        });
        const data = (await checkout.json()) as {
          url?: string;
          error?: string;
        };
        if (checkout.ok && data.url) {
          clearAccountsDraft();
          window.location.href = data.url;
          return;
        }
        setError(
          data.error ??
            "Request saved, but checkout is not configured yet. Contact support.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
      }
    });
  }

  const urgency = filingUrgency(company?.accountsNextDue);
  const attention = urgency === "attention";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav
        aria-label="Accounts filing progress"
        className="flex flex-wrap items-center justify-center gap-2 border-b border-line pb-4"
      >
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className="filing-step"
            data-active={stepIndex === i || undefined}
            data-done={stepIndex > i || undefined}
          >
            <span>{i + 1}</span>
            {s.label}
          </span>
        ))}
      </nav>

      <div className="panel gloss-card space-y-5 overflow-visible p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
              Annual accounts
            </p>
            <h2 className="display mt-1 text-2xl text-ink md:text-3xl">
              {phase === "search" && "Find your company"}
              {phase === "period" && "Accounting period"}
              {phase === "options" && "What would you like to file?"}
              {phase === "details" && "Enter Details"}
              {phase === "pay" && "Confirm & pay"}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={signInHref} className="font-semibold text-sea" onClick={() => persist()}>
              Sign in
            </Link>
            <span className="text-ink-soft">·</span>
            <Link href={signUpHref} className="font-semibold text-sea" onClick={() => persist()}>
              Sign up
            </Link>
            <span className="text-ink-soft">to save progress</span>
          </div>
        </div>

        {lookupPending && !company && (
          <p className="text-sm text-ink-soft">
            Loading company from Companies House…
          </p>
        )}

        {phase === "search" && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Search Companies House by name or number — same flow as
              confirmation statements.
            </p>
            <label className="label" htmlFor="aa-search">
              Company name or number
              <input
                id="aa-search"
                className="input mt-1.5"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCompany(null);
                  setSearchHits([]);
                }}
                placeholder="Search company by name"
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
                      onClick={() => void loadCompany(item.company_number)}
                    >
                      <span className="font-semibold text-ink">{item.title}</span>
                      <span className="mono text-xs text-ink-soft">
                        {item.company_number}
                        {item.company_status ? ` · ${item.company_status}` : ""}
                      </span>
                      {item.address_snippet ? (
                        <span className="text-xs text-ink-soft">
                          {item.address_snippet}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {phase === "period" && company && (
          <div className="space-y-5">
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => {
                setPhase("search");
                setCompany(null);
                persist({ phase: "search" });
              }}
            >
              ← Search again
            </button>

            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="border-b border-line bg-sea/[0.06] px-5 py-5">
                <p className="display text-2xl leading-tight text-ink md:text-3xl">
                  {company.companyName}
                </p>
                <p className="mono mt-2 text-sm text-ink-soft">
                  {company.companyNumber}
                  {company.status ? ` · ${company.status}` : ""}
                </p>
              </div>
              <div
                className={`px-5 py-4 ${
                  attention ? "bg-red-50" : "bg-emerald-50"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Accounts filing status
                </p>
                <p
                  className={`mt-1.5 text-base font-semibold ${
                    attention ? "text-red-700" : "text-emerald-800"
                  }`}
                >
                  {formatDueLabel(company.accountsNextDue)}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  Last accounts made up to{" "}
                  {prettyDate(company.lastAccountsMadeUpTo)}
                </p>
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-2">
                <div className="bg-white px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Period start
                  </p>
                  <input
                    type="date"
                    className="input mt-2"
                    value={company.periodStart}
                    onChange={(e) =>
                      setCompany({ ...company, periodStart: e.target.value })
                    }
                  />
                </div>
                <div className="bg-white px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Period end
                  </p>
                  <input
                    type="date"
                    className="input mt-2"
                    value={company.periodEnd}
                    onChange={(e) => {
                      const end = e.target.value;
                      setCompany({
                        ...company,
                        periodEnd: end,
                        periodStart:
                          company.periodStart || guessPeriodStart(end),
                      });
                    }}
                  />
                </div>
              </div>
              <div className="border-t border-line px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Registered office
                </p>
                <p className="mt-1.5 text-sm text-ink">
                  {company.registeredOffice || "—"}
                </p>
              </div>
            </section>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => {
                if (!company.periodStart || !company.periodEnd) {
                  setError("Enter period start and end dates.");
                  return;
                }
                setError(null);
                go("options");
              }}
            >
              Continue
            </button>
          </div>
        )}

        {phase === "options" && company && (
          <div className="space-y-5">
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => go("period")}
            >
              ← Back to period
            </button>
            <p className="text-sm text-ink-soft">
              {company.companyName} · {prettyDate(company.periodStart)} –{" "}
              {prettyDate(company.periodEnd)}
            </p>
            <div className="space-y-3">
              {FILING_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setFilingMode(opt.id);
                    persist({ filingMode: opt.id, phase: "details" });
                    setPhase("details");
                  }}
                  className={`block w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    filingMode === opt.id
                      ? "border-sea bg-sea/5"
                      : "border-line bg-white hover:border-sea/40"
                  }`}
                >
                  <p className="font-semibold text-ink">{opt.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{opt.blurb}</p>
                  <span className="mt-3 inline-flex text-sm font-semibold text-sea">
                    Continue →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "details" && company && (
          <div className="space-y-4">
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => go("options")}
            >
              ← Change filing option
            </button>
            <YearEndFilingForm
              initialMode={filingMode}
              lockFilingMode
              persistKey={figuresPersistKey(company.companyNumber)}
              postSignInPath={postSignInPath}
              company={{
                name: company.companyName,
                companyNumber: company.companyNumber,
                registeredOffice: company.registeredOffice,
                companyStatus: company.status,
                sicCodes: company.sicCodes,
                directors: company.directors,
                accountsNextDue: company.accountsNextDue,
              }}
              defaultPeriodStart={company.periodStart}
              defaultPeriodEnd={company.periodEnd}
              accountsCheckoutHref="#"
              lastFiledAccounts={lastFiled}
              signInHref={signInHref}
              clientId={defaults?.clientId || null}
              onPhaseChange={(p) => {
                setFormPhase(p);
                if (p >= 2) persist({ phase: "details" });
              }}
              onContinueToPayment={(info) => {
                setCompany({
                  ...company,
                  periodStart: info.periodStart,
                  periodEnd: info.periodEnd,
                });
                persist({
                  phase: "pay",
                  periodStart: info.periodStart,
                  periodEnd: info.periodEnd,
                });
                setPhase("pay");
              }}
            />
          </div>
        )}

        {phase === "pay" && company && (
          <div className="space-y-5">
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => go("details")}
            >
              ← Back to details
            </button>

            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="border-b border-line bg-sea/[0.06] px-5 py-5">
                <p className="display text-2xl text-ink">{company.companyName}</p>
                <p className="mono mt-2 text-sm text-ink-soft">
                  {company.companyNumber}
                </p>
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-2">
                <div className="bg-white px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Period
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-ink">
                    {prettyDate(company.periodStart)} –{" "}
                    {prettyDate(company.periodEnd)}
                  </p>
                </div>
                <div className="bg-white px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Filing
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-ink">
                    {FILING_OPTIONS.find((o) => o.id === filingMode)?.title}
                  </p>
                </div>
              </div>
            </section>

            <div className="rounded-xl border border-line bg-sand/40 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Companies House (statutory)</span>
                <span className="font-semibold">{fees.statutory}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-ink-soft">Hydra service</span>
                <span className="font-semibold">{fees.hydra}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-line pt-2">
                <span className="font-semibold text-ink">You pay</span>
                <span className="price-amount text-2xl">{fees.total}</span>
              </div>
            </div>

            <div className="rounded-xl border border-sea/30 bg-sea/5 p-4">
              <label className="label">
                Company authentication code
                <span className="font-normal text-danger"> *</span>
                <input
                  className={`input mt-1.5 mono ${
                    !companyAuthCode.trim() ? "border-sea/40" : ""
                  }`}
                  value={companyAuthCode}
                  onChange={(e) => setCompanyAuthCode(e.target.value)}
                  placeholder="Authentication code"
                  autoComplete="off"
                  required
                />
              </label>
              <p className="mt-2 text-xs text-ink-soft">
                Required before payment — from Companies House online filing.
              </p>
            </div>

            <label className="label">
              Accounts type
              <select
                className="input mt-1.5"
                value={accountsType}
                onChange={(e) => setAccountsType(e.target.value)}
              >
                <option value="micro">Micro-entity</option>
                <option value="small">Small</option>
                <option value="dormant">Dormant</option>
                <option value="full">Full</option>
              </select>
            </label>

            <label className="label">
              Notes (optional)
              <textarea
                className="input mt-1.5 min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <label className="flex items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm the company, period and figures are correct and I am
                authorised to file these accounts.
              </span>
            </label>

            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={
                pending || !companyAuthCode.trim() || !confirmed
              }
              onClick={pay}
            >
              {pending
                ? "Starting checkout…"
                : !companyAuthCode.trim()
                  ? "Enter authentication code to pay"
                  : `Pay ${fees.total} & submit`}
            </button>
          </div>
        )}

        <FormErrorBanner error={error} />
      </div>
    </div>
  );
}
