"use client";

import { useEffect, useState, useTransition } from "react";
import { formatChFeeBreakdown, type ChServiceDetail } from "@/lib/ch-services";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type CompanyView = {
  companyNumber: string;
  companyName: string;
  status: string | null;
  registeredOffice: string;
  accountsNextDue: string | null;
  lastAccountsMadeUpTo: string | null;
};

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

function guessPeriodEnd(company: CompanyView | null): string {
  if (company?.lastAccountsMadeUpTo) {
    const d = new Date(company.lastAccountsMadeUpTo);
    if (!Number.isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    }
  }
  if (company?.accountsNextDue) {
    // Often ARD is ~9 months before next due — leave blank if unsure
    return "";
  }
  return "";
}

function guessPeriodStart(periodEnd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return "";
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function AnnualAccountsCheckout({
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

  const [company, setCompany] = useState<CompanyView | null>(null);
  const [lookupPending, setLookupPending] = useState(Boolean(presetCompany));
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [accountsType, setAccountsType] = useState("micro");
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!presetCompany) return;
    let cancelled = false;
    (async () => {
      setLookupPending(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/companies-house/search?company_number=${encodeURIComponent(presetCompany)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Lookup failed");
        const profile = data.profile as {
          company_name?: string;
          company_number?: string;
          company_status?: string;
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
        const view: CompanyView = {
          companyNumber: profile.company_number,
          companyName: profile.company_name,
          status: profile.company_status ?? null,
          registeredOffice: formatAddress(profile.registered_office_address),
          accountsNextDue: profile.accounts?.next_due ?? null,
          lastAccountsMadeUpTo:
            profile.accounts?.last_accounts?.made_up_to ?? null,
        };
        setCompany(view);
        const end =
          profile.accounts?.next_accounts?.period_end_on?.slice(0, 10) ||
          guessPeriodEnd(view);
        const start =
          profile.accounts?.next_accounts?.period_start_on?.slice(0, 10) ||
          guessPeriodStart(end);
        setPeriodEnd(end);
        setPeriodStart(start);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Lookup failed");
        }
      } finally {
        if (!cancelled) setLookupPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetCompany]);

  function pay() {
    if (!company) return;
    setError(null);
    if (!periodStart || !periodEnd) {
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
            periodStart,
            periodEnd,
            accountsType,
            notes,
            ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
          },
        });
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

  if (!presetCompany) {
    return (
      <p className="text-sm text-ink-soft">
        Open annual accounts from a company hub so we can load register details.
      </p>
    );
  }

  return (
    <div className="panel gloss-card mx-auto max-w-2xl space-y-5 overflow-visible p-4 safe-bottom sm:p-5 md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Annual accounts
        </p>
        <h2 className="display mt-1 text-2xl text-ink md:text-3xl">
          {lookupPending && !company ? "Loading company…" : "Confirm & pay"}
        </h2>
      </div>

      {lookupPending && !company && (
        <p className="text-sm text-ink-soft">
          Loading company from Companies House…
        </p>
      )}

      {company && (
        <div className="space-y-5">
          <a
            href={`/companies-house/company/${encodeURIComponent(company.companyNumber)}`}
            className="text-sm font-semibold text-sea"
          >
            ← Back to company hub
          </a>

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
            <div className="grid gap-px bg-line sm:grid-cols-2">
              <div className="bg-white px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Accounts due
                </p>
                <p className="mt-1.5 text-base font-semibold text-ink">
                  {company.accountsNextDue
                    ? new Date(company.accountsNextDue).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "—"}
                </p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Last accounts
                </p>
                <p className="mt-1.5 text-base font-semibold text-ink">
                  {company.lastAccountsMadeUpTo
                    ? new Date(
                        company.lastAccountsMadeUpTo,
                      ).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                Registered office
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                {company.registeredOffice || "—"}
              </p>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Period start
              <input
                type="date"
                className="input mt-1.5"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </label>
            <label className="label">
              Period end
              <input
                type="date"
                className="input mt-1.5"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  if (!periodStart) {
                    setPeriodStart(guessPeriodStart(e.target.value));
                  }
                }}
                required
              />
            </label>
          </div>

          <div className="rounded-xl border border-sea/30 bg-sea/5 p-4">
            <label className="label" htmlFor="aa-auth">
              Company authentication code
              <span className="font-normal text-danger"> *</span>
              <input
                id="aa-auth"
                className="input mt-1.5 mono"
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
              <option value="other">Other</option>
            </select>
          </label>

          <label className="label">
            Preparation notes
            <textarea
              className="input mt-1.5 min-h-[5rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="iXBRL file ready, figures to prepare, etc."
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I confirm these company details and the accounting period are
              correct for this accounts filing
            </span>
          </label>

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={pending || !companyAuthCode.trim() || !confirmed}
            onClick={pay}
          >
            {pending
              ? "Opening checkout…"
              : !companyAuthCode.trim()
                ? "Enter authentication code to pay"
                : `Pay ${fees.total}`}
          </button>
        </div>
      )}

      <FormErrorBanner error={error} />
    </div>
  );
}
