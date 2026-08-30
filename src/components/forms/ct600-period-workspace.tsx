"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  YearEndFilingForm,
  type LastFiledAccounts,
} from "@/components/forms/year-end-filing-form";
import {
  daysInclusive,
  formatGbDate,
  paymentDueFromPeriodEnd,
  addCalendarYear,
  type CtAccountingPeriod,
} from "@/lib/accounting-periods";

type FiledReturn = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
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

function statusForPeriod(
  period: Pick<PeriodCard, "start" | "end">,
  returns: FiledReturn[],
) {
  const match = returns.find(
    (r) => r.periodStart === period.start && r.periodEnd === period.end,
  );
  if (!match) return null;
  return match.status;
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

export function Ct600PeriodWorkspace({
  clientId,
  clientSlug,
  periods,
  returns,
  initialStart,
  initialEnd,
  incorporatedOn,
  company,
  accountsCheckoutHref,
  lastFiledAccounts = null,
}: {
  clientId: string;
  clientSlug: string;
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

  useEffect(() => {
    setDismissed(readJson<string[]>(dismissedStorageKey(clientId), []));
    setCustomPeriods(
      readJson<Array<{ start: string; end: string }>>(
        customStorageKey(clientId),
        [],
      ),
    );
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
    const list = [...byKey.values()]
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

    const latestCompletedEnd = list
      .filter((p) => p.end < today)
      .reduce<string | null>((max, p) => (!max || p.end > max ? p.end : max), null);

    return list.map((p) => ({
      ...p,
      isCurrentFiling: Boolean(latestCompletedEnd && p.end === latestCompletedEnd),
    }));
  }, [periods, customPeriods, dismissed, returns]);

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
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
              CT600 filing
            </p>
            <h2 className="display mt-1 text-2xl text-ink">
              {formatGbDate(selected.start)} → {formatGbDate(selected.end)}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Enter P&amp;L figures manually, import a trial balance, or choose
              dormant (all zeros). Then review and submit.
            </p>
          </div>
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
          initialMode="ct600"
          lockFilingMode
          defaultPeriodStart={selected.start}
          defaultPeriodEnd={selected.end}
          company={company}
          accountsCheckoutHref={accountsCheckoutHref}
          lastFiledAccounts={lastFiledAccounts}
          persistKey={`hydratax_ct600_${clientId}_${selected.start}_${selected.end}`}
          postSignInPath={`/clients/${clientSlug}/corporation-tax?start=${encodeURIComponent(selected.start)}&end=${encodeURIComponent(selected.end)}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display text-2xl text-ink">Corporation Tax periods</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Choose a CT600 accounting period since incorporation
          {incorporatedOn ? ` (${formatGbDate(incorporatedOn)})` : ""}. Periods
          can be removed until a return is submitted for that period.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="panel flex w-full flex-col p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
            Custom period
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Use when HMRC has a different accounting period (max 12 months).
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Start</label>
              <input
                type="date"
                className="input"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div>
              <label className="label">End</label>
              <input
                type="date"
                className="input"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
          {customError && (
            <p className="mt-2 text-sm text-danger">{customError}</p>
          )}
          <button
            type="button"
            className="btn btn-primary mt-4 self-start text-sm"
            onClick={applyCustom}
          >
            Add custom period
          </button>
        </div>

        {hydrated &&
          ordered.map((p) => {
            const filed = statusForPeriod(p, returns);
            const submitted = isSubmittedStatus(filed);
            return (
              <div
                key={periodKey(p.start, p.end)}
                className="panel panel-interactive flex w-full flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <button
                  type="button"
                  onClick={() => openPeriod(p.start, p.end)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
                      {p.label}
                    </span>
                    {filed ? (
                      <span className="badge badge-ok">{filed}</span>
                    ) : p.isCurrentFiling ? (
                      <span className="rounded-md border border-sea/30 bg-sea/5 px-2 py-0.5 text-xs font-semibold text-sea">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="display mt-2 text-xl text-ink">
                    {formatGbDate(p.start)}
                    <span className="mx-2 text-ink-soft">→</span>
                    {formatGbDate(p.end)}
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
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    onClick={() => openPeriod(p.start, p.end)}
                  >
                    File CT600 →
                  </button>
                  {submitted ? (
                    <span
                      className="rounded-md border border-line px-3 py-2 text-xs text-ink-soft"
                      title="Submitted periods cannot be removed"
                    >
                      Locked
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      onClick={(e) => deletePeriod(p, e)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
