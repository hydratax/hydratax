"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  filingSaTaxYear,
  formatSaTaxYearRange,
  parseSaTaxYearLabel,
  saCardUrgencyClass,
  saFilingUrgency,
  saTaxYearFromStartYear,
  saUrgencyLabel,
  type SaTaxYear,
} from "@/lib/sa-tax-year";
import type { Sa100Stored } from "@/server/actions/sa100";
import {
  assignSaFiledDocument,
  deleteSa100Return,
  recordSa302Upload,
  recordSubmittedSaReturn,
} from "@/server/actions/sa100";
import { uploadClientDocument } from "@/server/actions/documents";
import { saFiledCategory } from "@/lib/sa-filed-docs";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export type SaFiledDocRow = {
  id: string;
  filename: string;
  blobUrl: string;
  taxYear: string | null;
  kind: "return" | "sa302" | "unassigned";
  createdAt: string;
};

/**
 * One card per tax year — click the card to open SA100 for that year.
 * Prior-year uploads are stored as tagged client documents so they survive refresh.
 */
export function SaTaxYearWorkspace({
  baseHref,
  activeYear,
  returns,
  filedDocs = [],
  clientId,
  taxpayerId,
  identifiersReady = true,
  identifiersMissing = [],
  children,
}: {
  baseHref: string;
  activeYear: string | null;
  returns: Array<Pick<Sa100Stored, "id" | "taxYear" | "status">>;
  filedDocs?: SaFiledDocRow[];
  clientId: string;
  taxpayerId?: string | null;
  /** NINO + personal UTR + address required before opening any SA100. */
  identifiersReady?: boolean;
  identifiersMissing?: string[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const filingYear = useMemo(() => filingSaTaxYear(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{
    year: string;
    kind: "return" | "sa302";
  } | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [extraYears, setExtraYears] = useState<string[]>([]);
  const [hiddenYears, setHiddenYears] = useState<string[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [cardMenuYear, setCardMenuYear] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    year: SaTaxYear;
    status: string;
    message: string;
  } | null>(null);
  /** Optimistic: years removed locally before / after server delete. */
  const [removedYears, setRemovedYears] = useState<string[]>([]);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const cardMenuRef = useRef<HTMLDivElement>(null);

  const returnYears = useMemo(() => {
    const map = new Map<
      string,
      Pick<Sa100Stored, "id" | "taxYear" | "status">
    >();
    for (const r of returns) map.set(r.taxYear, r);
    return map;
  }, [returns]);

  const docsByYear = useMemo(() => {
    const map = new Map<
      string,
      { return?: SaFiledDocRow; sa302?: SaFiledDocRow }
    >();
    // Prefer newest document per kind (draft saves append fresh PDFs).
    const sorted = [...filedDocs].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    for (const d of sorted) {
      if (!d.taxYear || d.kind === "unassigned") continue;
      const slot = map.get(d.taxYear) ?? {};
      if (d.kind === "return" && !slot.return) slot.return = d;
      if (d.kind === "sa302" && !slot.sa302) slot.sa302 = d;
      map.set(d.taxYear, slot);
    }
    return map;
  }, [filedDocs]);

  const unassigned = useMemo(
    () => filedDocs.filter((d) => d.kind === "unassigned"),
    [filedDocs],
  );

  const yearCards = useMemo(() => {
    // Only show years the user has started (draft/filed) or explicitly added.
    // Never auto-seed overdue empty years onto the desk.
    const fromReturns = returns.map((r) => r.taxYear);
    const fromDocs = filedDocs
      .map((d) => d.taxYear)
      .filter((y): y is string => Boolean(y));
    const filingUrgency = saFilingUrgency(filingYear, "none");
    const includeFilingYear = filingUrgency !== "overdue";
    const labels = Array.from(
      new Set([
        ...(includeFilingYear ? [filingYear.label] : []),
        ...fromReturns,
        ...fromDocs,
        ...extraYears,
      ]),
    ).filter(
      (l) => !hiddenYears.includes(l) && !removedYears.includes(l),
    );
    const years: SaTaxYear[] = [];
    for (const label of labels) {
      const y = parseSaTaxYearLabel(label);
      if (!y) continue;
      const hasWork =
        returnYears.has(y.label) ||
        docsByYear.has(y.label) ||
        extraYears.includes(y.label);
      // Hide empty overdue years even if they slipped into the set.
      if (
        !hasWork &&
        saFilingUrgency(y, "none") === "overdue"
      ) {
        continue;
      }
      years.push(y);
    }
    years.sort((a, b) => b.label.localeCompare(a.label));
    return years;
  }, [
    returns,
    filedDocs,
    extraYears,
    hiddenYears,
    removedYears,
    filingYear,
    returnYears,
    docsByYear,
  ]);

  const active =
    (activeYear && parseSaTaxYearLabel(activeYear)) || null;

  const [mode, setMode] = useState<"pick" | "file">(
    activeYear ? "file" : "pick",
  );

  useEffect(() => {
    setMode(activeYear ? "file" : "pick");
  }, [activeYear]);

  useEffect(() => {
    if (mode !== "file") return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode, activeYear]);

  function openFiling(year: SaTaxYear) {
    if (!identifiersReady) {
      const missing = identifiersMissing.length
        ? identifiersMissing
        : ["NINO", "Personal UTR", "Postcode"];
      setErr(
        `Enter ${missing.join(", ")} on Identifiers before opening an SA100.`,
      );
      window.dispatchEvent(
        new CustomEvent("hydra:sa-focus-identifiers", {
          detail: { missing },
        }),
      );
      requestAnimationFrame(() => {
        document
          .getElementById("sa-identifiers")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        document
          .getElementById("sa-tax-years-error")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }
    setErr(null);
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

  useEffect(() => {
    if (!addMenuOpen && !cardMenuYear) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (addMenuOpen && !addMenuRef.current?.contains(t)) {
        setAddMenuOpen(false);
        setCustomOpen(false);
      }
      if (cardMenuYear && !cardMenuRef.current?.contains(t)) {
        setCardMenuYear(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addMenuOpen, cardMenuYear]);

  function addYearLabel(label: string, note?: string) {
    const y = parseSaTaxYearLabel(label);
    if (!y) {
      setErr("Could not resolve that tax year.");
      return;
    }
    setErr(null);
    setRemovedYears((prev) => prev.filter((x) => x !== y.label));
    setHiddenYears((prev) => prev.filter((x) => x !== y.label));
    setExtraYears((prev) =>
      prev.includes(y.label) ? prev : [...prev, y.label],
    );
    setMsg(note ?? `Added tax year ${y.label}`);
    setAddMenuOpen(false);
    setCustomOpen(false);
  }

  function addPreviousYear() {
    const oldest = yearCards[yearCards.length - 1];
    const start = oldest
      ? Number(oldest.label.slice(0, 4)) - 1
      : Number(filingYear.label.slice(0, 4)) - 1;
    addYearLabel(saTaxYearFromStartYear(start).label);
  }

  function addNextYear() {
    const newest = yearCards[0];
    const start = newest
      ? Number(newest.label.slice(0, 4)) + 1
      : Number(filingYear.label.slice(0, 4)) + 1;
    addYearLabel(saTaxYearFromStartYear(start).label);
  }

  /** Map a calendar date into the SA tax year that contains it (6 Apr → 5 Apr). */
  function taxYearContainingIso(iso: string): SaTaxYear | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(y) || !month || !day) return null;
    const startYear =
      month < 4 || (month === 4 && day < 6) ? y - 1 : y;
    return saTaxYearFromStartYear(startYear);
  }

  function addCustomPeriod() {
    if (!customStart && !customEnd) {
      setErr("Pick a start or end date for the custom period.");
      return;
    }
    if (customStart && customEnd && customStart > customEnd) {
      setErr("Period start must be on or before the end date.");
      return;
    }
    // Prefer end date (accounting year-end); else start.
    const year =
      (customEnd && taxYearContainingIso(customEnd)) ||
      (customStart && taxYearContainingIso(customStart));
    if (!year) {
      setErr("Could not resolve a tax year from those dates.");
      return;
    }
    const range =
      customStart && customEnd
        ? `${customStart} → ${customEnd}`
        : customStart || customEnd;
    addYearLabel(
      year.label,
      `Added tax year ${year.label} (period ${range})`,
    );
  }

  function askDeleteYear(year: SaTaxYear, status: string) {
    const message =
      status === "draft"
        ? `Delete the ${year.label} draft? This removes the saved SA100 for that year from this desk.`
        : status === "submitted" || status === "accepted"
          ? `Remove the ${year.label} filed return from this desk?`
          : `Remove ${year.label} from this list?`;
    setCardMenuYear(null);
    setConfirmDelete({ year, status, message });
  }

  function confirmDeleteYear() {
    if (!confirmDelete) return;
    const { year, status } = confirmDelete;
    setConfirmDelete(null);
    setErr(null);
    setMsg(null);

    // Hide immediately so the card cannot linger (filing year auto-seeds).
    setRemovedYears((prev) =>
      prev.includes(year.label) ? prev : [...prev, year.label],
    );
    setHiddenYears((prev) =>
      prev.includes(year.label) ? prev : [...prev, year.label],
    );
    setExtraYears((prev) => prev.filter((y) => y !== year.label));

    start(async () => {
      try {
        // Always clear durable/memory drafts for this year — even when the card
        // looked "Not started", an orphan draft must not resurrect on re-add.
        await deleteSa100Return({
          clientId,
          taxYear: year.label,
          taxpayerId,
        }).catch((e) => {
          if (status === "none") return;
          throw e;
        });
        setMsg(
          status === "none" ? `${year.label} removed` : `${year.label} deleted`,
        );
        if (activeYear === year.label) backToPick();
        else router.refresh();
      } catch (e) {
        // Restore the card if the server delete failed.
        setRemovedYears((prev) => prev.filter((y) => y !== year.label));
        setHiddenYears((prev) => prev.filter((y) => y !== year.label));
        setErr(messageFromUnknown(e, "Could not delete"));
      }
    });
  }

  function pickUpload(year: string, kind: "return" | "sa302") {
    setUploadTarget({ year, kind });
    fileRef.current?.click();
  }

  if (mode === "file" && active) {
    if (!identifiersReady) {
      const missing = identifiersMissing.length
        ? identifiersMissing
        : ["NINO", "Personal UTR", "Postcode"];
      return (
        <div ref={rootRef} id="sa-tax-return" className="space-y-4 scroll-mt-24">
          <div className="panel border-amber-200 bg-amber-50/50 p-5">
            <h2 className="display text-2xl text-ink">Identifiers required</h2>
            <p className="mt-2 text-sm text-ink-soft">
              Enter {missing.join(", ")} on the person’s Identifiers before
              continuing with SA100 {active.label}.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-4 text-sm"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("hydra:sa-focus-identifiers", {
                    detail: { missing },
                  }),
                );
                backToPick();
                requestAnimationFrame(() => {
                  document
                    .getElementById("sa-identifiers")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              Go to Identifiers
            </button>
            <button
              type="button"
              className="btn btn-secondary mt-4 ml-2 text-sm"
              onClick={backToPick}
            >
              ← Tax years
            </button>
          </div>
        </div>
      );
    }
    return (
      <div ref={rootRef} id="sa-tax-return" className="space-y-6 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
              Filing · SA100 {active.label}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Expand each section to add details
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
    <div ref={rootRef} id="sa-tax-return" className="space-y-3 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-ink">Tax return</h2>
        </div>
        <div className={`relative ${addMenuOpen ? "z-40" : ""}`} ref={addMenuRef}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm hover:border-sea/40 hover:bg-sand/40"
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setAddMenuOpen((o) => !o);
              if (addMenuOpen) setCustomOpen(false);
              setCardMenuYear(null);
            }}
          >
            Add tax year
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden
              className={`text-ink-soft transition ${addMenuOpen ? "rotate-180" : ""}`}
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {addMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-1.5 w-56 rounded-xl border border-line bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70"
                onClick={addPreviousYear}
              >
                Add previous year
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70"
                onClick={addNextYear}
              >
                Add next year
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70"
                onClick={() => setCustomOpen((o) => !o)}
              >
                Add custom period…
              </button>
              {customOpen ? (
                <div className="space-y-2 border-t border-line px-3.5 py-3">
                  <label className="block text-xs font-semibold text-ink-soft">
                    Period start
                    <input
                      type="date"
                      className="input mt-1 w-full text-sm"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-ink-soft">
                    Period end
                    <input
                      type="date"
                      className="input mt-1 w-full text-sm"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary w-full text-sm"
                    onClick={addCustomPeriod}
                  >
                    Add period
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        Add the accounting year you want to file, then open it to complete the
        SA100. Books dates follow that year.
      </p>
      <div id="sa-tax-years-error">
        <FormErrorBanner error={err} />
      </div>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      <ul className="space-y-3 overflow-visible">
        {yearCards.map((year) => {
          const match = returnYears.get(year.label) ?? null;
          const docs = docsByYear.get(year.label);
          // Prefer the return row status — draft PDFs must not look "Submitted".
          const status =
            match?.status ??
            (docs?.return && !match ? "accepted" : "none");
          const submitted = status === "submitted" || status === "accepted";
          const isDraft = status === "draft";
          const urgency = saFilingUrgency(year, status);
          const badge = isDraft
            ? "Draft"
            : saUrgencyLabel(urgency, submitted);
          const menuOpen = cardMenuYear === year.label;

          return (
            <li
              key={year.label}
              className={`relative overflow-visible ${menuOpen ? "z-30" : "z-0"}`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => openFiling(year)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openFiling(year);
                  }
                }}
                className={`panel panel-interactive flex w-full cursor-pointer flex-col gap-3 overflow-visible p-4 text-left sm:flex-row sm:items-center sm:justify-between ${saCardUrgencyClass(urgency, submitted)}`}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="display text-xl text-ink">
                      {year.label}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {formatSaTaxYearRange(year)}
                    </span>
                    {badge ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                          submitted
                            ? "bg-emerald-50 text-emerald-800"
                            : isDraft
                              ? "bg-sand text-ink"
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
                  {(docs?.return || docs?.sa302) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                      {docs.return ? (
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              docs.return!.blobUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(
                                docs.return!.blobUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }
                          }}
                          className="font-medium text-sea hover:underline"
                          title={docs.return.filename}
                        >
                          view SA100
                        </span>
                      ) : null}
                      {docs.sa302 ? (
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              docs.sa302!.blobUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(
                                docs.sa302!.blobUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }
                          }}
                          className="font-medium text-sea hover:underline"
                          title={docs.sa302.filename}
                        >
                          view SA302
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Split control: primary open + actions menu (stops card click). */}
                <div
                  className="relative flex shrink-0"
                  ref={menuOpen ? cardMenuRef : undefined}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex overflow-hidden rounded-lg border border-sea/40 bg-white shadow-sm">
                    <button
                      type="button"
                      className="px-3 py-2 text-sm font-semibold text-sea hover:bg-sea/5"
                      onClick={() => openFiling(year)}
                    >
                      Open return →
                    </button>
                    <button
                      type="button"
                      className="border-l border-sea/30 px-2.5 py-2 text-sea hover:bg-sea/5"
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      aria-label={`More actions for ${year.label}`}
                      onClick={() => {
                        setCardMenuYear((cur) =>
                          cur === year.label ? null : year.label,
                        );
                        setAddMenuOpen(false);
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden
                        className="mx-auto"
                      >
                        <path
                          d="M2.5 4.5 6 8l3.5-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-line bg-white py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70"
                        onClick={() => {
                          setCardMenuYear(null);
                          openFiling(year);
                        }}
                      >
                        Open return
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70 disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          setCardMenuYear(null);
                          pickUpload(year.label, "return");
                        }}
                      >
                        Upload SA100
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-sand/70 disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          setCardMenuYear(null);
                          pickUpload(year.label, "sa302");
                        }}
                      >
                        Upload SA302
                      </button>
                      <div className="my-1 border-t border-line" />
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        disabled={pending}
                        onClick={() => askDeleteYear(year, status)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 pt-2">
        {unassigned.length > 0 ? (
          <details className="panel border-amber-200 bg-amber-50/40 p-4">
            <summary className="cursor-pointer list-none font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Unassigned SA uploads
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    ({unassigned.length})
                  </span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Open
                </span>
              </span>
            </summary>
            <div className="mt-3 space-y-3 border-t border-amber-200/80 pt-3">
              <p className="text-sm text-ink-soft">
                Files you uploaded for Self Assessment that still need a tax
                year. Assign each as the submitted SA100 or SA302. Auto-saved
                drafts are not listed here.
              </p>
              <ul className="space-y-2">
                {unassigned.map((d) => {
                  const name = d.filename.toLowerCase();
                  const viewLabel = /sa\s*302|sa302/.test(name)
                    ? "view SA302"
                    : /sa\s*100|sa100|forms?\(/.test(name)
                      ? "view SA100"
                      : "view file";
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    >
                      <a
                        href={d.blobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-sea hover:underline"
                        title={d.filename}
                      >
                        {viewLabel}
                      </a>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="input py-1 text-xs"
                          id={`assign-year-${d.id}`}
                          defaultValue={
                            yearCards[yearCards.length - 1]?.label ?? ""
                          }
                        >
                          {yearCards.map((y) => (
                            <option key={y.label} value={y.label}>
                              {y.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          disabled={pending}
                          onClick={() => {
                            const sel = document.getElementById(
                              `assign-year-${d.id}`,
                            ) as HTMLSelectElement | null;
                            const year = sel?.value;
                            if (!year) return;
                            setErr(null);
                            start(async () => {
                              try {
                                await assignSaFiledDocument({
                                  clientId,
                                  documentId: d.id,
                                  taxYear: year,
                                  kind: "return",
                                  taxpayerId,
                                });
                                setMsg(
                                  `Assigned as ${year} SA100`,
                                );
                                router.refresh();
                              } catch (e) {
                                setErr(
                                  messageFromUnknown(e, "Could not assign"),
                                );
                              }
                            });
                          }}
                        >
                          As SA100
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          disabled={pending}
                          onClick={() => {
                            const sel = document.getElementById(
                              `assign-year-${d.id}`,
                            ) as HTMLSelectElement | null;
                            const year = sel?.value;
                            if (!year) return;
                            setErr(null);
                            start(async () => {
                              try {
                                await assignSaFiledDocument({
                                  clientId,
                                  documentId: d.id,
                                  taxYear: year,
                                  kind: "sa302",
                                  taxpayerId,
                                });
                                setMsg(`Assigned as ${year} SA302`);
                                router.refresh();
                              } catch (e) {
                                setErr(
                                  messageFromUnknown(e, "Could not assign"),
                                );
                              }
                            });
                          }}
                        >
                          As SA302
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = uploadTarget;
          e.target.value = "";
          setUploadTarget(null);
          if (!file || !target) return;
          setErr(null);
          setMsg(null);
          start(async () => {
            try {
              const fd = new FormData();
              fd.set("clientId", clientId);
              fd.set(
                "category",
                saFiledCategory(target.year, target.kind, taxpayerId),
              );
              fd.set("file", file);
              const doc = await uploadClientDocument(fd);
              if (target.kind === "sa302") {
                await recordSa302Upload({
                  clientId,
                  taxYear: target.year,
                  taxpayerId,
                  documentId: doc.id,
                  filename: doc.filename,
                });
                setMsg(`SA302 for ${target.year} saved.`);
              } else {
                await recordSubmittedSaReturn({
                  clientId,
                  taxYear: target.year,
                  taxpayerId,
                  documentId: doc.id,
                  filename: doc.filename,
                });
                setMsg(`SA100 for ${target.year} recorded.`);
              }
              router.refresh();
            } catch (error) {
              setErr(
                messageFromUnknown(error, "Could not upload document"),
              );
            }
          });
        }}
      />

      {confirmDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sa-delete-title"
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="sa-delete-title"
              className="display text-2xl text-ink"
            >
              Delete {confirmDelete.year.label}?
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {confirmDelete.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-red-700 text-sm text-white hover:bg-red-800"
                disabled={pending}
                onClick={confirmDeleteYear}
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
