"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import {
  formatSaFilingDue,
  saCardUrgencyClass,
  saUrgencyLabel,
} from "@/lib/sa-tax-year";
import { urgencyForDueDate } from "@/lib/filing-due";
import {
  WORK_STAGE_FILTERS,
  WORK_STAGE_LABEL,
  mergeSaWorkStage,
  type ClientWorkStage,
} from "@/lib/client-work-stage";
import type { PracticeDirector } from "@/server/actions/sa-directors";
import { personKeySlug } from "@/lib/sa-taxpayer";

type SoleTrader = {
  id: string;
  slug: string;
  name: string;
  type: string;
  utr: string | null;
  nino: string | null;
  filing?: PracticeDirector["filing"];
  workStage?: ClientWorkStage;
  emailCount?: number;
};

type DirectorRow = PracticeDirector & {
  workStage?: ClientWorkStage;
  emailCount?: number;
};

export function SaDirectorsList({
  directors,
  soleTraders,
}: {
  directors: DirectorRow[];
  soleTraders: SoleTrader[];
}) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<ClientWorkStage | "all">(
    "all",
  );

  const stageOf = (row: {
    workStage?: ClientWorkStage;
    filing?: { status?: string };
  }) => mergeSaWorkStage(row.workStage, row.filing?.status);

  const filteredDirectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directors.filter((d) => {
      const stage = stageOf(d);
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (!q) return true;
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.companies.some(
          (c) =>
            c.companyName.toLowerCase().includes(q) ||
            c.companyNumber.toLowerCase().includes(q),
        )
      );
    });
  }, [directors, query, stageFilter]);

  const filteredSole = useMemo(() => {
    const q = query.trim().toLowerCase();
    return soleTraders.filter((c) => {
      const stage = stageOf(c);
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.utr ?? "").includes(q) ||
        (c.nino ?? "").toLowerCase().includes(q)
      );
    });
  }, [soleTraders, query, stageFilter]);

  const counts = useMemo(() => {
    const all = [
      ...directors.map((d) => stageOf(d)),
      ...soleTraders.map((c) => stageOf(c)),
    ];
    const map: Record<string, number> = { all: all.length };
    for (const f of WORK_STAGE_FILTERS) {
      if (f.id === "all") continue;
      map[f.id] = all.filter((s) => s === f.id).length;
    }
    return map;
  }, [directors, soleTraders]);

  const empty =
    filteredDirectors.length === 0 && filteredSole.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input max-w-md"
          placeholder="Search person…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Progress">
        {WORK_STAGE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={stageFilter === f.id}
            className={`filing-filter ${stageFilter === f.id ? "is-active" : ""}`}
            onClick={() => setStageFilter(f.id)}
          >
            {f.label}
            <span className="filing-filter__count">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {empty ? (
        <div className="panel px-5 py-8 text-center text-sm text-ink-soft">
          {query.trim() || stageFilter !== "all"
            ? "No people match this filter."
            : "No Self Assessment people yet. Add a sole trader client, or open a limited company and fetch Companies House."}
        </div>
      ) : null}

      {filteredDirectors.length > 0 ? (
        <section className="space-y-2">
          <h2 className="display text-2xl text-ink">People</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {filteredDirectors.map((d) => {
              // Person desk — not the limited company workspace.
              const href = `/self-assessment/${personKeySlug(d.key)}`;
              const submitted =
                d.filing.status === "submitted" ||
                d.filing.status === "accepted";
              const cardClass = saCardUrgencyClass(d.filing.urgency, submitted);
              const badge = saUrgencyLabel(d.filing.urgency, submitted);
              const stage = stageOf(d);
              const emails = d.emailCount ?? 0;
              return (
                <li key={d.key}>
                  <PendingLink
                    href={href}
                    pendingLabel={`Opening ${d.fullName}…`}
                    className={`panel panel-interactive client-card client-card--compact block px-4 py-3 ${cardClass}`}
                  >
                    {(pending) => (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">
                            {d.fullName}
                          </p>
                          <p className="mt-1 text-xs text-ink-soft">
                            SA {d.filing.taxYear} · file by{" "}
                            {formatSaFilingDue({
                              label: d.filing.taxYear,
                              start: "",
                              end: "",
                              filingDue: d.filing.filingDue,
                            })}
                          </p>
                          <p className="mt-1 text-xs text-ink-soft">
                            {WORK_STAGE_LABEL[stage]}
                            {emails > 0
                              ? ` · ${emails} email${emails === 1 ? "" : "s"}`
                              : ""}
                          </p>
                          {badge ? (
                            <p
                              className={`mt-1 text-xs font-semibold ${
                                submitted
                                  ? "text-ok"
                                  : d.filing.urgency === "overdue"
                                    ? "text-danger"
                                    : "text-sea"
                              }`}
                            >
                              {badge}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
                        >
                          {pending ? "Opening…" : "Open SA"}
                        </span>
                      </div>
                    )}
                  </PendingLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {filteredSole.length > 0 ? (
        <section className="space-y-2">
          <h2 className="display text-2xl text-ink">
            Sole traders &amp; partners
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {filteredSole.map((c) => {
              const filing = c.filing;
              const submitted =
                filing?.status === "submitted" ||
                filing?.status === "accepted";
              const urgency =
                filing?.urgency ??
                urgencyForDueDate(filing?.filingDue ?? null);
              const cardClass = filing
                ? saCardUrgencyClass(urgency, Boolean(submitted))
                : "";
              const badge = filing
                ? saUrgencyLabel(urgency, Boolean(submitted))
                : null;
              const stage = stageOf(c);
              const emails = c.emailCount ?? 0;
              return (
                <li key={c.id}>
                  <PendingLink
                    href={`/clients/${c.slug}/self-assessment`}
                    pendingLabel={`Opening ${c.name}…`}
                    className={`panel panel-interactive client-card client-card--compact block px-4 py-3 ${cardClass}`}
                  >
                    {(pending) => (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{c.name}</p>
                          {filing ? (
                            <p className="mt-1 text-xs text-ink-soft">
                              SA {filing.taxYear} · file by{" "}
                              {formatSaFilingDue({
                                label: filing.taxYear,
                                start: "",
                                end: "",
                                filingDue: filing.filingDue,
                              })}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-ink-soft">
                            {WORK_STAGE_LABEL[stage]}
                            {emails > 0
                              ? ` · ${emails} email${emails === 1 ? "" : "s"}`
                              : ""}
                          </p>
                          {badge ? (
                            <p
                              className={`mt-1 text-xs font-semibold ${
                                submitted
                                  ? "text-ok"
                                  : urgency === "overdue"
                                    ? "text-danger"
                                    : "text-sea"
                              }`}
                            >
                              {badge}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
                        >
                          {pending ? "Opening…" : "Open SA"}
                        </span>
                      </div>
                    )}
                  </PendingLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
