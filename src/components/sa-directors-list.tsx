"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import { DeskFilterBar } from "@/components/desk-filter-bar";
import { DeskStatusButton } from "@/components/desk-status-button";
import { useDeskFilterPrefs } from "@/hooks/use-desk-filter-prefs";
import {
  cardTintClass,
  chipColorClass,
  colorForMapsTo,
  resolveFilterMapsTo,
} from "@/lib/desk-filter-prefs";
import {
  formatSaFilingDue,
  saUrgencyLabel,
} from "@/lib/sa-tax-year";
import { urgencyForDueDate } from "@/lib/filing-due";
import { maskNino, maskUtr } from "@/lib/mask-identifiers";
import {
  SA_DESK_FILTERS,
  matchesSaDeskFilter,
  mergeSaWorkStage,
  saDeskFilterFromStage,
  saDeskFilterLabel,
  type ClientWorkStage,
  type SaDeskFilter,
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

const MAP_OPTIONS = SA_DESK_FILTERS.filter((f) => f.id !== "all").map((f) => ({
  id: f.id,
  label: f.label,
}));

function identifiersLine(nino: string | null | undefined, utr: string | null | undefined) {
  const parts = [
    nino ? `NINO ${maskNino(nino)}` : null,
    utr ? `Personal UTR ${maskUtr(utr)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "NINO / Personal UTR not set";
}

export function SaDirectorsList({
  directors,
  soleTraders,
}: {
  directors: DirectorRow[];
  soleTraders: SoleTrader[];
}) {
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState("all");
  const filterPrefs = useDeskFilterPrefs("sa", [...SA_DESK_FILTERS]);

  const stageOf = (row: {
    workStage?: ClientWorkStage;
    filing?: { status?: string };
  }) => mergeSaWorkStage(row.workStage, row.filing?.status);

  const deskStageOf = (row: {
    workStage?: ClientWorkStage;
    filing?: { status?: string };
  }) => saDeskFilterFromStage(stageOf(row), row.filing?.status);

  const activeMapsTo = resolveFilterMapsTo(
    filterPrefs.prefs,
    filterId,
  ) as SaDeskFilter;

  const filteredDirectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directors.filter((d) => {
      const stage = stageOf(d);
      if (!matchesSaDeskFilter(stage, activeMapsTo, d.filing?.status)) {
        return false;
      }
      if (!q) return true;
      const nino = d.taxpayer?.nino ?? "";
      const utr = d.taxpayer?.utr ?? "";
      return (
        d.fullName.toLowerCase().includes(q) ||
        nino.toLowerCase().includes(q) ||
        utr.toLowerCase().includes(q) ||
        d.companies.some(
          (c) =>
            c.companyName.toLowerCase().includes(q) ||
            c.companyNumber.toLowerCase().includes(q),
        )
      );
    });
  }, [directors, query, activeMapsTo]);

  const filteredSole = useMemo(() => {
    const q = query.trim().toLowerCase();
    return soleTraders.filter((c) => {
      const stage = stageOf(c);
      if (!matchesSaDeskFilter(stage, activeMapsTo, c.filing?.status)) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.utr ?? "").includes(q) ||
        (c.nino ?? "").toLowerCase().includes(q)
      );
    });
  }, [soleTraders, query, activeMapsTo]);

  const counts = useMemo(() => {
    const rows = [
      ...directors.map((d) => deskStageOf(d)),
      ...soleTraders.map((c) => deskStageOf(c)),
    ];
    const map: Record<string, number> = { all: rows.length };
    for (const f of SA_DESK_FILTERS) {
      if (f.id === "all") continue;
      map[f.id] = rows.filter((s) => s === f.id).length;
    }
    return map;
  }, [directors, soleTraders]);

  const empty =
    filteredDirectors.length === 0 && filteredSole.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input max-w-md"
          placeholder="Search name, NINO, Personal UTR…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <DeskFilterBar
        label="Progress"
        prefs={filterPrefs.prefs}
        selectedId={filterId}
        counts={counts}
        mapOptions={MAP_OPTIONS}
        onSelect={setFilterId}
        onSetColor={filterPrefs.setColor}
        onSetLabel={filterPrefs.setLabel}
        onHide={filterPrefs.hideFilter}
        onShow={filterPrefs.showFilter}
        onDelete={filterPrefs.deleteFilter}
        onAdd={filterPrefs.addFilter}
      />

      {empty ? (
        <p className="py-10 text-center text-ink-soft">
          {query.trim() || activeMapsTo !== "all"
            ? "No people match this filter."
            : "No Self Assessment people yet. Add a sole trader client, or open a limited company and fetch Companies House."}
        </p>
      ) : null}

      {filteredDirectors.length > 0 ? (
        <section className="space-y-2">
          <h2 className="display text-2xl text-ink">People</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredDirectors.map((d) => {
              const href = `/self-assessment/${personKeySlug(d.key)}`;
              const submitted =
                d.filing.status === "submitted" ||
                d.filing.status === "accepted";
              const badge = saUrgencyLabel(d.filing.urgency, submitted);
              const deskStage = deskStageOf(d);
              const emails = d.emailCount ?? 0;
              const tint = cardTintClass(
                colorForMapsTo(filterPrefs.prefs, deskStage),
              );
              return (
                <div
                  key={d.key}
                  className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display min-w-0 flex-1 text-2xl leading-tight text-ink">
                      <PendingLink
                        href={href}
                        pendingLabel={`Opening ${d.fullName}…`}
                        className="text-ink after:absolute after:inset-0 after:z-[1]"
                      >
                        {d.fullName}
                      </PendingLink>
                    </h2>
                    <DeskStatusButton
                      clientId={d.homeClientId}
                      desk="sa"
                      options={MAP_OPTIONS}
                      value={deskStage}
                    />
                  </div>

                  <p className="mt-1 text-sm text-ink-soft">
                    SA {d.filing.taxYear} · file by{" "}
                    {formatSaFilingDue({
                      label: d.filing.taxYear,
                      start: "",
                      end: "",
                      filingDue: d.filing.filingDue,
                    })}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, deskStage),
                      )}
                    >
                      {saDeskFilterLabel(deskStage)}
                    </span>
                    {emails > 0 ? (
                      <span className="filing-btn filing-btn--muted">
                        {emails} email{emails === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {badge ? (
                      <span
                        className={
                          submitted
                            ? "filing-btn filing-btn--tint-green"
                            : d.filing.urgency === "overdue"
                              ? "filing-btn filing-btn--tint-red"
                              : "filing-btn filing-btn--tint-teal"
                        }
                      >
                        {badge}
                      </span>
                    ) : null}
                  </div>

                  <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                    {identifiersLine(d.taxpayer?.nino, d.taxpayer?.utr)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {filteredSole.length > 0 ? (
        <section className="space-y-2">
          <h2 className="display text-2xl text-ink">
            Sole traders &amp; partners
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredSole.map((c) => {
              const filing = c.filing;
              const submitted =
                filing?.status === "submitted" ||
                filing?.status === "accepted";
              const urgency =
                filing?.urgency ??
                urgencyForDueDate(filing?.filingDue ?? null);
              const badge = filing
                ? saUrgencyLabel(urgency, Boolean(submitted))
                : null;
              const deskStage = deskStageOf(c);
              const emails = c.emailCount ?? 0;
              const tint = cardTintClass(
                colorForMapsTo(filterPrefs.prefs, deskStage),
              );
              return (
                <div
                  key={c.id}
                  className={`panel panel-interactive client-card relative z-0 flex h-full flex-col p-5 hover:z-10 ${tint}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display min-w-0 flex-1 text-2xl leading-tight text-ink">
                      <PendingLink
                        href={`/clients/${c.slug}/self-assessment`}
                        pendingLabel={`Opening ${c.name}…`}
                        className="text-ink after:absolute after:inset-0 after:z-[1]"
                      >
                        {c.name}
                      </PendingLink>
                    </h2>
                    <DeskStatusButton
                      clientId={c.id}
                      desk="sa"
                      options={MAP_OPTIONS}
                      value={deskStage}
                    />
                  </div>

                  {filing ? (
                    <p className="mt-1 text-sm text-ink-soft">
                      SA {filing.taxYear} · file by{" "}
                      {formatSaFilingDue({
                        label: filing.taxYear,
                        start: "",
                        end: "",
                        filingDue: filing.filingDue,
                      })}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-soft">Self Assessment</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={chipColorClass(
                        colorForMapsTo(filterPrefs.prefs, deskStage),
                      )}
                    >
                      {saDeskFilterLabel(deskStage)}
                    </span>
                    {emails > 0 ? (
                      <span className="filing-btn filing-btn--muted">
                        {emails} email{emails === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {badge ? (
                      <span
                        className={
                          submitted
                            ? "filing-btn filing-btn--tint-green"
                            : urgency === "overdue"
                              ? "filing-btn filing-btn--tint-red"
                              : "filing-btn filing-btn--tint-teal"
                        }
                      >
                        {badge}
                      </span>
                    ) : null}
                  </div>

                  <p className="mono mt-auto pt-4 text-xs text-ink-soft">
                    {identifiersLine(c.nino, c.utr)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
