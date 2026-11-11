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
import Link from "next/link";
import {
  filingSaTaxYear,
  listSaTaxYears,
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
 * One card per tax year — year + status + Edit / Delete / Upload SA100 & SA302.
 * Prior-year uploads are stored as tagged client documents so they survive refresh.
 */
export function SaTaxYearWorkspace({
  baseHref,
  activeYear,
  returns,
  filedDocs = [],
  clientId,
  taxpayerId,
  children,
}: {
  baseHref: string;
  activeYear: string | null;
  returns: Array<Pick<Sa100Stored, "id" | "taxYear" | "status">>;
  filedDocs?: SaFiledDocRow[];
  clientId: string;
  taxpayerId?: string | null;
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
    for (const d of filedDocs) {
      if (!d.taxYear || d.kind === "unassigned") continue;
      const slot = map.get(d.taxYear) ?? {};
      if (d.kind === "return") slot.return = d;
      if (d.kind === "sa302") slot.sa302 = d;
      map.set(d.taxYear, slot);
    }
    return map;
  }, [filedDocs]);

  const unassigned = useMemo(
    () => filedDocs.filter((d) => d.kind === "unassigned"),
    [filedDocs],
  );

  const yearCards = useMemo(() => {
    const defaults = listSaTaxYears(3).map((y) => y.label);
    const fromReturns = returns.map((r) => r.taxYear);
    const fromDocs = filedDocs
      .map((d) => d.taxYear)
      .filter((y): y is string => Boolean(y));
    const labels = Array.from(
      new Set([
        filingYear.label,
        ...defaults,
        ...fromReturns,
        ...fromDocs,
        ...extraYears,
      ]),
    ).filter((l) => !hiddenYears.includes(l));
    const years: SaTaxYear[] = [];
    for (const label of labels) {
      const y = parseSaTaxYearLabel(label);
      if (y) years.push(y);
    }
    years.sort((a, b) => b.label.localeCompare(a.label));
    return years;
  }, [returns, filedDocs, extraYears, hiddenYears, filingYear.label]);

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

  function addPreviousYear() {
    const oldest = yearCards[yearCards.length - 1];
    const start = oldest
      ? Number(oldest.label.slice(0, 4)) - 1
      : Number(filingYear.label.slice(0, 4)) - 1;
    const next = saTaxYearFromStartYear(start);
    setHiddenYears((prev) => prev.filter((y) => y !== next.label));
    setExtraYears((prev) =>
      prev.includes(next.label) ? prev : [...prev, next.label],
    );
    setMsg(`Added tax year ${next.label}`);
  }

  function deleteYear(year: SaTaxYear, status: string) {
    const label =
      status === "draft"
        ? `Delete the ${year.label} draft?`
        : status === "submitted" || status === "accepted"
          ? `Remove the ${year.label} filed return from this desk?`
          : `Remove ${year.label} from this list?`;
    if (!window.confirm(label)) return;
    setErr(null);
    setMsg(null);

    if (status === "none") {
      setHiddenYears((prev) =>
        prev.includes(year.label) ? prev : [...prev, year.label],
      );
      setExtraYears((prev) => prev.filter((y) => y !== year.label));
      setMsg(`${year.label} removed`);
      return;
    }

    start(async () => {
      try {
        await deleteSa100Return({
          clientId,
          taxYear: year.label,
          taxpayerId,
        });
        setMsg(`${year.label} deleted`);
        if (activeYear === year.label) backToPick();
        else router.refresh();
      } catch (e) {
        setErr(messageFromUnknown(e, "Could not delete"));
      }
    });
  }

  function pickUpload(year: string, kind: "return" | "sa302") {
    setUploadTarget({ year, kind });
    fileRef.current?.click();
  }

  if (mode === "file" && active) {
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
          <p className="mt-1 text-sm text-ink-soft">
            One card per year · edit or delete · upload prior SA100 / SA302
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/self-assessment/bulk-prior-returns"
            className="btn btn-secondary text-sm"
          >
            Bulk prior returns
          </Link>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={addPreviousYear}
          >
            Add previous year
          </button>
        </div>
      </div>

      <FormErrorBanner error={err} />
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      {unassigned.length > 0 ? (
        <div className="panel space-y-3 border-amber-200 bg-amber-50/40 p-4">
          <div>
            <p className="font-semibold text-ink">Unassigned SA uploads</p>
            <p className="text-sm text-ink-soft">
              These files were uploaded before year tagging. Assign each to a
              tax year as the submitted return or SA302.
            </p>
          </div>
          <ul className="space-y-2">
            {unassigned.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm"
              >
                <a
                  href={d.blobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sea hover:underline"
                >
                  {d.filename}
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="input py-1 text-xs"
                    id={`assign-year-${d.id}`}
                    defaultValue={yearCards[yearCards.length - 1]?.label ?? ""}
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
                          setMsg(`Assigned ${d.filename} as ${year} return`);
                          router.refresh();
                        } catch (e) {
                          setErr(messageFromUnknown(e, "Could not assign"));
                        }
                      });
                    }}
                  >
                    As return
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
                          setMsg(`Assigned ${d.filename} as ${year} SA302`);
                          router.refresh();
                        } catch (e) {
                          setErr(messageFromUnknown(e, "Could not assign"));
                        }
                      });
                    }}
                  >
                    As SA302
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-3">
        {yearCards.map((year) => {
          const match = returnYears.get(year.label) ?? null;
          const docs = docsByYear.get(year.label);
          const status =
            match?.status ??
            (docs?.return ? "accepted" : "none");
          const submitted = status === "submitted" || status === "accepted";
          const isDraft = status === "draft";
          const urgency = saFilingUrgency(year, status);
          const badge = isDraft
            ? "Draft"
            : saUrgencyLabel(urgency, submitted);

          return (
            <li key={year.label}>
              <div
                className={`panel flex w-full flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${saCardUrgencyClass(urgency, submitted)}`}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="display text-xl text-ink">
                      {year.label}
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
                        <a
                          href={docs.return.blobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sea hover:underline"
                        >
                          View return · {docs.return.filename}
                        </a>
                      ) : null}
                      {docs.sa302 ? (
                        <a
                          href={docs.sa302.blobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sea hover:underline"
                        >
                          View SA302 · {docs.sa302.filename}
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    onClick={() => openFiling(year)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm text-danger"
                    disabled={pending}
                    onClick={() => deleteYear(year, status)}
                  >
                    Delete
                  </button>
                  {!isDraft && !docs?.return ? (
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      disabled={pending}
                      onClick={() => pickUpload(year.label, "return")}
                    >
                      Upload return
                    </button>
                  ) : null}
                  {!docs?.sa302 ? (
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      disabled={pending}
                      onClick={() => pickUpload(year.label, "sa302")}
                    >
                      Upload SA302
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

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
                setMsg(`SA302 for ${target.year} saved (${doc.filename}).`);
              } else {
                await recordSubmittedSaReturn({
                  clientId,
                  taxYear: target.year,
                  taxpayerId,
                  documentId: doc.id,
                  filename: doc.filename,
                });
                setMsg(
                  `Submitted return for ${target.year} recorded (${doc.filename}).`,
                );
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
    </div>
  );
}
