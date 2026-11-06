"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  filingSaTaxYear,
  formatSaFilingDue,
  formatSaTaxYearRange,
  parseSaTaxYearLabel,
  saCardUrgencyClass,
  saFilingUrgency,
  saUrgencyLabel,
} from "@/lib/sa-tax-year";
import type { Sa100Stored } from "@/server/actions/sa100";

/**
 * CT600-style pick → file flow for Self Assessment.
 * Only the current filing year is offered (no prior-year card stack).
 */
export function SaTaxYearWorkspace({
  baseHref,
  activeYear,
  returns,
  children,
}: {
  /** Path without year query, e.g. /self-assessment/key */
  baseHref: string;
  activeYear: string | null;
  returns: Array<Pick<Sa100Stored, "id" | "taxYear" | "status">>;
  /** Rendered when a tax year is open for filing */
  children?: ReactNode;
}) {
  const router = useRouter();
  const filingYear = useMemo(() => filingSaTaxYear(), []);
  const year =
    (activeYear && parseSaTaxYearLabel(activeYear)) || filingYear;

  const [mode, setMode] = useState<"pick" | "file">(
    activeYear ? "file" : "pick",
  );

  useEffect(() => {
    setMode(activeYear ? "file" : "pick");
  }, [activeYear]);

  const match = returns.find((r) => r.taxYear === year.label) ?? null;
  const status = match?.status ?? "none";
  const submitted = status === "submitted" || status === "accepted";
  const urgency = saFilingUrgency(year, status);
  const badge = saUrgencyLabel(urgency, submitted);

  function openFiling() {
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("year", year.label);
    setMode("file");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function backToPick() {
    setMode("pick");
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.delete("year");
    const qs = url.searchParams.toString();
    router.push(qs ? `${url.pathname}?${qs}` : url.pathname);
  }

  if (mode === "file") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
              Filing · SA100 {year.label}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {formatSaTaxYearRange(year)} · file by {formatSaFilingDue(year)}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={backToPick}
          >
            ← Tax years
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="display text-2xl text-ink">Tax return</h2>
        <p className="mt-1 text-sm text-ink-soft">
          6 April – 5 April · online deadline 31 January
        </p>
      </div>

      <button
        type="button"
        onClick={openFiling}
        className={`panel flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between ${
          submitted ? "" : "panel-interactive"
        } ${saCardUrgencyClass(urgency, submitted)}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
              SA100 · {year.label}
            </span>
            {badge ? (
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  submitted
                    ? "bg-emerald-50 text-emerald-800"
                    : urgency === "overdue"
                      ? "bg-red-50 text-red-800"
                      : "bg-sea/10 text-sea"
                }`}
              >
                {badge}
              </span>
            ) : (
              <span className="rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-ink-soft">
                Not started
              </span>
            )}
          </div>
          <p className="display mt-2 text-xl text-ink">
            {formatSaTaxYearRange(year)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            File by {formatSaFilingDue(year)}
          </p>
        </div>
        <span className="open-chip shrink-0">
          {submitted ? "View return →" : "File SA100 →"}
        </span>
      </button>
    </div>
  );
}
