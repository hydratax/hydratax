"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  YearEndFilingForm,
  type LastFiledAccounts,
} from "@/components/forms/year-end-filing-form";
import { YearEndFiledActionsMenu } from "@/components/year-end-actions-menu";
import {
  daysInclusive,
  formatGbDate,
  paymentDueFromPeriodEnd,
  addCalendarYear,
  type CtAccountingPeriod,
  type PriorYearComparatives,
} from "@/lib/accounting-periods";
import { AbbrInfo } from "@/components/desk/abbr-info";

type FiledReturn = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  questionnaire?: Record<string, unknown> | null;
};

type PeriodCard = {
  start: string;
  end: string;
  label: string;
  kind: "standard" | "custom" | "first-year";
  index?: number;
  of?: number;
  firstYear?: boolean;
  days: number;
  filingDue: string;
  paymentDue: string;
};

function periodKey(start: string, end: string) {
  return `${start}|${end}`;
}

function dismissedStorageKey(clientId: string) {
  return `hydratax:ct600-dismissed:${clientId}`;
}

function customStorageKey(clientId: string) {
  return `hydratax:ct600-custom:${clientId}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function amendmentIndexOf(r: FiledReturn): number {
  const q = (r as { questionnaire?: Record<string, unknown> }).questionnaire;
  return Number(q?.amendmentIndex) || 0;
}

function returnForPeriod(
  period: Pick<PeriodCard, "start" | "end">,
  returns: FiledReturn[],
  amendmentIndex = 0,
) {
  const matches = returns.filter(
    (r) => r.periodStart === period.start && r.periodEnd === period.end,
  );
  return (
    matches.find((r) => amendmentIndexOf(r) === amendmentIndex) ??
    (amendmentIndex === 0 ? matches[0] ?? null : null)
  );
}

function statusForPeriod(
  period: Pick<PeriodCard, "start" | "end">,
  returns: FiledReturn[],
) {
  return returnForPeriod(period, returns)?.status ?? null;
}

function isSubmittedStatus(status: string | null) {
  if (!status) return false;
  return ["submitted", "accepted", "rejected", "error"].includes(status);
}

function toCardFromStandard(p: CtAccountingPeriod): PeriodCard {
  return {
    start: p.start,
    end: p.end,
    label:
      p.firstYear && p.of > 1
        ? `First year · ${p.index} of ${p.of}`
        : p.firstYear
          ? "First year"
          : "Accounting period",
    kind: p.firstYear ? "first-year" : "standard",
    index: p.index,
    of: p.of,
    firstYear: p.firstYear,
    days: p.days,
    filingDue: p.filingDue,
    paymentDue: p.paymentDue,
  };
}

function toCardFromCustom(start: string, end: string): PeriodCard {
  const days = daysInclusive(start, end);
  return {
    start,
    end,
    label: "Custom period",
    kind: "custom",
    days,
    filingDue: addCalendarYear(end, 1) ?? end,
    paymentDue: paymentDueFromPeriodEnd(end),
  };
}

/** Latest completed 1 Apr → 31 Mar year when Companies House periods are empty. */
function defaultFilingPeriod(now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const endYear = month < 3 ? y - 1 : y;
  return {
    start: `${endYear - 1}-04-01`,
    end: `${endYear}-03-31`,
  };
}

export function Ct600PeriodWorkspace({
  clientId,
  clientSlug,
  contactEmail = null,
  periods,
  returns,
  initialStart,
  initialEnd,
  incorporatedOn,
  company,
  accountsCheckoutHref,
  lastFiledAccounts = null,
  priorYearComparatives = null,
  priorYearSource = "none",
  priorYearMadeUpTo = null,
}: {
  clientId: string;
  clientSlug: string;
  contactEmail?: string | null;
  periods: CtAccountingPeriod[];
  returns: FiledReturn[];
  initialStart?: string;
  initialEnd?: string;
  incorporatedOn?: string | null;
  company: {
    name: string;
    companyNumber: string | null;
    registeredOffice: string | null;
    companyStatus: string | null;
    sicCodes: string[];
    directors: string[];
    incorporatedOn?: string | null;
    accountsNextDue?: string | null;
  };
  accountsCheckoutHref: string;
  lastFiledAccounts?: LastFiledAccounts | null;
  priorYearComparatives?: PriorYearComparatives | null;
  priorYearSource?: "saved" | "ct600" | "companies_house" | "none";
  priorYearMadeUpTo?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"pick" | "file">(
    initialStart && initialEnd ? "file" : "pick",
  );
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(
    initialStart && initialEnd
      ? { start: initialStart, end: initialEnd }
      : null,
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [customPeriods, setCustomPeriods] = useState<
    Array<{ start: string; end: string }>
  >([]);
  const [hydrated, setHydrated] = useState(false);
  const seededDefault = useRef(false);

  useEffect(() => {
    setDismissed(readJson<string[]>(dismissedStorageKey(clientId), []));
    setCustomPeriods(
      readJson<Array<{ start: string; end: string }>>(
        customStorageKey(clientId),
        [],
      ),
    );
    seededDefault.current = false;
    setHydrated(true);
  }, [clientId]);

  const ordered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dismissedSet = new Set(dismissed);
    const standard = periods
      // Only completed periods — not the year still in progress.
      .filter((p) => p.end < today)
      .map(toCardFromStandard);
    const customs = customPeriods.map((c) => toCardFromCustom(c.start, c.end));
    const byKey = new Map<string, PeriodCard>();
    for (const card of [...standard, ...customs]) {
      byKey.set(periodKey(card.start, card.end), card);
    }
    let list = [...byKey.values()]
      .filter((p) => {
        const key = periodKey(p.start, p.end);
        const submitted = isSubmittedStatus(statusForPeriod(p, returns));
        if (submitted) return true;
        // Standard cards: completed only. Custom: allow even if open.
        if (p.kind !== "custom" && p.end >= today) return false;
        return !dismissedSet.has(key);
      })
      .sort((a, b) =>
        a.start < b.start ? -1 : a.start > b.start ? 1 : a.end.localeCompare(b.end),
      );

    // Always show a current filing card when the desk would otherwise be empty.
    if (list.length === 0) {
      const def = defaultFilingPeriod();
      list = [toCardFromCustom(def.start, def.end)];
    }

    const latestCompletedEnd = list
      .filter((p) => p.end < today)
      .reduce<string | null>((max, p) => (!max || p.end > max ? p.end : max), null);

    return list.map((p) => ({
      ...p,
      isCurrentFiling: Boolean(latestCompletedEnd && p.end === latestCompletedEnd),
    }));
  }, [periods, customPeriods, dismissed, returns]);

  useEffect(() => {
    if (!hydrated || seededDefault.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const hasCompleted = periods.some((p) => p.end < today);
    if (hasCompleted || customPeriods.length > 0) {
      seededDefault.current = true;
      return;
    }
    const def = defaultFilingPeriod();
    const next = [{ start: def.start, end: def.end }];
    setCustomPeriods(next);
    writeJson(customStorageKey(clientId), next);
    seededDefault.current = true;
  }, [hydrated, periods, customPeriods.length, clientId]);

  function openPeriod(start: string, end: string) {
    setSelected({ start, end });
    setMode("file");
    router.replace(
      `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { scroll: false },
    );
  }

  function applyCustom() {
    setCustomError(null);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(customStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)
    ) {
      setCustomError("Enter valid start and end dates.");
      return;
    }
    if (customEnd < customStart) {
      setCustomError("Period end must be on or after the start date.");
      return;
    }
    const days = daysInclusive(customStart, customEnd);
    if (days > 366) {
      setCustomError(
        "HMRC accounting periods cannot exceed 12 months. Split into two CT600s.",
      );
      return;
    }
    if (incorporatedOn && customStart < incorporatedOn.slice(0, 10)) {
      setCustomError(
        "Period cannot start before the company incorporation date.",
      );
      return;
    }

    const next = [
      ...customPeriods.filter(
        (c) => !(c.start === customStart && c.end === customEnd),
      ),
      { start: customStart, end: customEnd },
    ];
    setCustomPeriods(next);
    writeJson(customStorageKey(clientId), next);

    // If it was previously dismissed, restore it.
    const key = periodKey(customStart, customEnd);
    if (dismissed.includes(key)) {
      const restored = dismissed.filter((k) => k !== key);
      setDismissed(restored);
      writeJson(dismissedStorageKey(clientId), restored);
    }

    setCustomStart("");
    setCustomEnd("");
    openPeriod(customStart, customEnd);
  }

  function deletePeriod(card: PeriodCard, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const status = statusForPeriod(card, returns);
    if (isSubmittedStatus(status)) return;

    const key = periodKey(card.start, card.end);
    const nextDismissed = dismissed.includes(key)
      ? dismissed
      : [...dismissed, key];
    setDismissed(nextDismissed);
    writeJson(dismissedStorageKey(clientId), nextDismissed);

    if (card.kind === "custom") {
      const nextCustom = customPeriods.filter(
        (c) => !(c.start === card.start && c.end === card.end),
      );
      setCustomPeriods(nextCustom);
      writeJson(customStorageKey(clientId), nextCustom);
    }
  }

  if (mode === "file" && selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-2xl text-ink">
            {formatGbDate(selected.start)} → {formatGbDate(selected.end)}
          </h2>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => {
              setMode("pick");
              setSelected(null);
              router.replace("?", { scroll: false });
            }}
          >
            Change period
          </button>
        </div>

        <YearEndFilingForm
          key={`${selected.start}-${selected.end}`}
          clientId={clientId}
          contactEmail={contactEmail}
          initialMode="ct600"
          lockFilingMode
          defaultPeriodStart={selected.start}
          defaultPeriodEnd={selected.end}
          company={company}
          accountsCheckoutHref={accountsCheckoutHref}
          lastFiledAccounts={lastFiledAccounts}
          priorYearComparatives={priorYearComparatives}
          priorYearSource={priorYearSource}
          priorYearMadeUpTo={priorYearMadeUpTo}
          persistKey={`hydratax_ct600_${clientId}_${selected.start}_${selected.end}`}
          postSignInPath={`/clients/${clientSlug}/corporation-tax?start=${encodeURIComponent(selected.start)}&end=${encodeURIComponent(selected.end)}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="panel flex w-full flex-col gap-2 border-sea/30 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
            Add accounting period
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="text-[11px] font-semibold text-ink-soft">
                Start
              </label>
              <UkDateField
                className="input mt-1 w-full text-sm"
                value={customStart}
                onChange={(iso) => setCustomStart(iso)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-soft">
                End
              </label>
              <UkDateField
                className="input mt-1 w-full text-sm"
                value={customEnd}
                onChange={(iso) => setCustomEnd(iso)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary text-sm shadow-md"
              onClick={applyCustom}
            >
              Add period
            </button>
          </div>
          {customError ? (
            <p className="text-xs text-ink-soft">{customError}</p>
          ) : null}
        </div>

        {hydrated &&
          ordered.flatMap((p) => {
            const periodReturns = returns
              .filter(
                (r) => r.periodStart === p.start && r.periodEnd === p.end,
              )
              .sort((a, b) => amendmentIndexOf(a) - amendmentIndexOf(b));
            const revisions =
              periodReturns.length > 0
                ? periodReturns
                : [null];
            return revisions.map((rev) => {
            const amendmentIndex = rev ? amendmentIndexOf(rev) : 0;
            const match =
              rev ?? returnForPeriod(p, returns, amendmentIndex);
            const filed = match?.status ?? null;
            const submitted = isSubmittedStatus(filed);
            const arLabel =
              amendmentIndex > 0 ? ` AR ${amendmentIndex}` : "";
            return (
              <div
                key={`${periodKey(p.start, p.end)}:AR${amendmentIndex}`}
                role={submitted ? undefined : "button"}
                tabIndex={submitted ? undefined : 0}
                className={`panel flex w-full flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${
                  submitted ? "" : "panel-interactive"
                }`}
                onClick={
                  submitted
                    ? undefined
                    : () => openPeriod(p.start, p.end)
                }
                onKeyDown={
                  submitted
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPeriod(p.start, p.end);
                        }
                      }
                }
              >
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
                      {p.label}
                      {arLabel}
                    </span>
                    {filed ? (
                      <span className="badge badge-ok">
                        {submitted && amendmentIndex === 0
                          ? `${filed} · locked`
                          : filed}
                      </span>
                    ) : p.isCurrentFiling && amendmentIndex === 0 ? (
                      <span className="rounded-md border border-sea/30 bg-sea/5 px-2 py-0.5 text-xs font-semibold text-sea">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="display mt-2 text-xl text-ink">
                    {formatGbDate(p.start)}
                    <span className="mx-2 text-ink-soft">→</span>
                    {formatGbDate(p.end)}
                    {arLabel ? (
                      <span className="ml-2 text-lg text-ink-soft">{arLabel.trim()}</span>
                    ) : null}
                  </p>
                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
                    <div>
                      <dt className="inline">Days </dt>
                      <dd className="inline font-medium text-ink">{p.days}</dd>
                    </div>
                    <div>
                      <dt className="inline">File by </dt>
                      <dd className="inline font-medium text-ink">
                        {formatGbDate(p.filingDue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Tax payable </dt>
                      <dd className="inline font-medium text-ink">
                        {formatGbDate(p.paymentDue)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div
                  className="flex shrink-0 flex-wrap items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {submitted && match ? (
                    <YearEndFiledActionsMenu
                      label="Filed actions"
                      className="w-auto"
                      filed={{
                        clientId,
                        returnId: match.id,
                        periodStart: p.start,
                        periodEnd: p.end,
                        companyNumber: company.companyNumber,
                        contactEmail,
                        companyName: company.name,
                      }}
                    />
                  ) : (
                    <>
                      <span className="open-chip inline-flex items-center gap-1">
                        File CT600
                        <AbbrInfo code="CT600" />
                        →
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary text-sm"
                        onClick={(e) => deletePeriod(p, e)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
            });
          })}
      </div>
    </div>
  );
}
