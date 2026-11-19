"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatSaTaxYearRange,
  saTaxYearContainingDate,
  type SaTaxYear,
} from "@/lib/sa-tax-year";
import {
  SA103F_HEAD_META,
  SA_ALLOCATE_CHOICE_LABEL,
  bankCategoryToSaField,
  resolveAllocateTarget,
  saHeadDisplayPence,
  suggestSaFormForCategory,
  type SaAllocateChoice,
  type SaAllocateForm,
  type SaFormSuggestSignals,
  type SaSelfEmploymentMoneyField,
} from "@/server/bank/sa-box-map";
import {
  applyBankSaHeadToReturn,
  applyBankSaHeadsBulk,
} from "@/server/actions/sa-bank-apply";
import {
  previewMissingSaBankStatementsEmail,
  requestMissingSaBankStatements,
} from "@/server/actions/sa-bank-missing-request";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { AbbrInfo } from "@/components/desk/abbr-info";
import { messageFromUnknown } from "@/lib/action-error";
import {
  formatMissingPeriodPhrase,
  missingMonthsForTaxYearLabel,
  missingPeriodIsoBounds,
} from "@/lib/bank/missing-statement-months";

type EmailActivity = {
  id: string;
  sentAt: string;
  toEmail: string;
  periodPhrase: string;
  taxYear: string;
};

type EmailDraft = {
  taxYear: string;
  periodPhrase: string;
  periodStart: string;
  periodEnd: string;
  toEmail: string;
  subject: string;
  message: string;
};

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function shortFormLabel(choice: SaAllocateChoice) {
  if (choice === "unallocated") return "unallocated";
  if (choice === "sa105") return "SA105";
  if (choice === "sa102") return "SA102";
  return "SA103F";
}

const CHOICE_OPTIONS = Object.keys(
  SA_ALLOCATE_CHOICE_LABEL,
) as SaAllocateChoice[];

/**
 * bankbee SA desk — bank lines by UK tax year, allocate to SA103F / SA105 / SA102.
 */
export function SaBankTaxYearHeads({
  clientId,
  taxpayerId,
  transactions,
  formSignals = {},
  clientEmail,
}: {
  clientId: string;
  taxpayerId: string;
  transactions: Tx[];
  formSignals?: SaFormSuggestSignals;
  clientEmail?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [openHeads, setOpenHeads] = useState<Record<string, boolean>>({});
  const [headSearch, setHeadSearch] = useState<Record<string, string>>({});
  const [formByHead, setFormByHead] = useState<
    Record<string, SaAllocateChoice>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [emailModalError, setEmailModalError] = useState<string | null>(null);
  const [emailActivity, setEmailActivity] = useState<EmailActivity[]>([]);

  const allDates = useMemo(
    () => transactions.map((t) => t.dated),
    [transactions],
  );

  const byYear = useMemo(() => {
    const map = new Map<string, { year: SaTaxYear; txs: Tx[] }>();
    const unassigned: Tx[] = [];
    for (const tx of transactions) {
      const y = saTaxYearContainingDate(tx.dated);
      if (!y) {
        unassigned.push(tx);
        continue;
      }
      const slot = map.get(y.label) ?? { year: y, txs: [] };
      slot.txs.push(tx);
      map.set(y.label, slot);
    }
    const years = [...map.values()].sort((a, b) =>
      b.year.label.localeCompare(a.year.label),
    );
    return { years, unassigned };
  }, [transactions]);

  function defaultFormForHead(
    field: SaSelfEmploymentMoneyField,
    rows: Tx[],
  ): SaAllocateForm {
    const cats = rows.map((r) => r.category);
    const votes: SaAllocateForm[] = cats.map((c) =>
      suggestSaFormForCategory(c, formSignals),
    );
    const score = { sa103f: 0, sa105: 0, sa102: 0 };
    for (const v of votes) score[v] += 1;
    if (score.sa105 >= score.sa103f && score.sa105 >= score.sa102) {
      return "sa105";
    }
    if (score.sa102 > score.sa103f) return "sa102";
    return "sa103f";
  }

  function choiceFor(
    headKey: string,
    field: SaSelfEmploymentMoneyField,
    rows: Tx[],
  ): SaAllocateChoice {
    return formByHead[headKey] ?? defaultFormForHead(field, rows);
  }

  function headsForYear(txs: Tx[]) {
    const byField = new Map<SaSelfEmploymentMoneyField, Tx[]>();
    const review: Tx[] = [];
    for (const tx of txs) {
      const field = bankCategoryToSaField(tx.category);
      if (!field) {
        review.push(tx);
        continue;
      }
      const list = byField.get(field) ?? [];
      list.push(tx);
      byField.set(field, list);
    }
    const heads = SA103F_HEAD_META.map((meta) => {
      const rows = byField.get(meta.field) ?? [];
      if (!rows.length) return null;
      const amountPence = saHeadDisplayPence(meta.field, rows);
      return { ...meta, rows, amountPence };
    }).filter(Boolean) as Array<{
      field: SaSelfEmploymentMoneyField;
      box: string;
      label: string;
      rows: Tx[];
      amountPence: number;
    }>;
    return { heads, review };
  }

  function allocate(
    taxYear: string,
    field: SaSelfEmploymentMoneyField,
    key: string,
    form: SaAllocateForm,
  ) {
    setError(null);
    setOk(null);
    setBusyKey(key);
    start(async () => {
      try {
        const res = await applyBankSaHeadToReturn({
          clientId,
          taxpayerId,
          taxYear,
          field,
          form,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk(res.message);
        router.refresh();
      } catch (err) {
        setError(messageFromUnknown(err, "Could not allocate"));
      } finally {
        setBusyKey(null);
      }
    });
  }

  function allocateAllYear(
    taxYear: string,
    heads: Array<{
      field: SaSelfEmploymentMoneyField;
      rows: Tx[];
    }>,
  ) {
    const payload = heads
      .map((h) => {
        const key = `${taxYear}:${h.field}`;
        const choice = choiceFor(key, h.field, h.rows);
        if (choice === "unallocated") return null;
        return { field: h.field, form: choice };
      })
      .filter(Boolean) as Array<{ field: string; form: SaAllocateForm }>;

    if (!payload.length) {
      setError(
        "Every head is set to Keep unallocated — choose a form for at least one.",
      );
      return;
    }

    const key = `all:${taxYear}`;
    setError(null);
    setOk(null);
    setBusyKey(key);
    start(async () => {
      try {
        const res = await applyBankSaHeadsBulk({
          clientId,
          taxpayerId,
          taxYear,
          heads: payload,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setOk(res.message);
        router.refresh();
      } catch (err) {
        setError(messageFromUnknown(err, "Could not allocate all heads"));
      } finally {
        setBusyKey(null);
      }
    });
  }

  function openEmailPopup(
    taxYear: string,
    periodPhrase: string,
    periodStart: string,
    periodEnd: string,
    key: string,
  ) {
    setError(null);
    setOk(null);
    setEmailModalError(null);
    setBusyKey(key);
    start(async () => {
      try {
        const res = await previewMissingSaBankStatementsEmail({
          clientId,
          taxpayerId,
          taxYear,
          periodStart,
          periodEnd,
          periodPhrase,
          toEmail: clientEmail || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setEmailDraft({
          taxYear,
          periodPhrase,
          periodStart,
          periodEnd,
          toEmail: res.toEmail,
          subject: res.subject,
          message: res.message,
        });
      } catch (err) {
        setError(messageFromUnknown(err, "Could not open email draft"));
      } finally {
        setBusyKey(null);
      }
    });
  }

  function sendEmailFromPopup() {
    if (!emailDraft) return;
    const draft = emailDraft;
    setEmailModalError(null);
    setBusyKey("email-send");
    start(async () => {
      try {
        if (!draft.toEmail.trim()) {
          setEmailModalError("Confirm the client email address.");
          return;
        }
        const res = await requestMissingSaBankStatements({
          clientId,
          taxpayerId,
          taxYear: draft.taxYear,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          periodPhrase: draft.periodPhrase,
          toEmail: draft.toEmail.trim(),
          subject: draft.subject,
          message: draft.message,
        });
        if (!res.ok) {
          setEmailModalError(res.error);
          return;
        }
        setEmailDraft(null);
        setOk(res.message);
        setEmailActivity((prev) => [
          {
            id: crypto.randomUUID(),
            sentAt: res.sentAt,
            toEmail: res.toEmail,
            periodPhrase: draft.periodPhrase,
            taxYear: draft.taxYear,
          },
          ...prev,
        ]);
        router.refresh();
      } catch (err) {
        setEmailModalError(messageFromUnknown(err, "Could not send email"));
      } finally {
        setBusyKey(null);
      }
    });
  }

  function formatSentAt(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (!transactions.length) return null;

  return (
    <div id="sa-bank-tax-year-heads" className="space-y-4">
      <div>
        <h3 className="display text-xl text-ink">Bank → SA forms by tax year</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-ink-soft">
          Statements are split by UK tax year (6 Apr → 5 Apr). Pick
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
            SA103
            <AbbrInfo code="SA103" />
          </span>
          ,
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
            SA105
            <AbbrInfo code="SA105" />
          </span>
          ,
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
            SA102
            <AbbrInfo code="SA102" />
          </span>
          , or Keep unallocated per head — then Allocate all at the bottom of
          the year.
        </p>
      </div>

      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}

      {byYear.years.map(({ year, txs }) => {
        const yearOpen = openYears[year.label] ?? true;
        const { heads, review } = headsForYear(txs);
        const coverage = missingMonthsForTaxYearLabel(year.label, allDates);
        const missing = coverage?.missingMonths ?? [];
        const periodPhrase = coverage
          ? formatMissingPeriodPhrase(coverage)
          : null;
        const bounds = coverage ? missingPeriodIsoBounds(coverage) : null;
        const emailKey = `email:${year.label}`;
        return (
          <details
            key={year.label}
            open={yearOpen}
            className="rounded-xl border border-line bg-white"
            onToggle={(e) => {
              setOpenYears((prev) => ({
                ...prev,
                [year.label]: (e.target as HTMLDetailsElement).open,
              }));
            }}
          >
            <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">
                    Tax year {year.label}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {formatSaTaxYearRange(year)} · {txs.length} transaction
                    {txs.length === 1 ? "" : "s"}
                    {missing.length
                      ? ` · ${missing.length} month${missing.length === 1 ? "" : "s"} missing`
                      : " · statements complete to date"}
                  </p>
                </div>
                <span className="text-ink-soft" aria-hidden>
                  {yearOpen ? "▾" : "›"}
                </span>
              </div>
            </summary>

            <div className="space-y-2 border-t border-line px-3 py-3">
              {missing.length && periodPhrase && bounds ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-semibold">SA · Missing bank statements</p>
                  <p className="mt-0.5 break-words text-amber-900/90">
                    {periodPhrase}
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      disabled={pending}
                      onClick={() =>
                        openEmailPopup(
                          year.label,
                          periodPhrase,
                          bounds.startIso,
                          bounds.endIso,
                          emailKey,
                        )
                      }
                    >
                      {busyKey === emailKey
                        ? "Opening…"
                        : "Email client for these statements"}
                    </button>
                  </div>
                </div>
              ) : null}
              {heads.length === 0 && review.length === 0 ? (
                <p className="px-1 text-sm text-ink-soft">
                  No categorised lines in this year yet.
                </p>
              ) : null}

              {heads.map((head) => {
                const headKey = `${year.label}:${head.field}`;
                const headOpen = openHeads[headKey] ?? false;
                const choice = choiceFor(headKey, head.field, head.rows);
                const target =
                  choice === "unallocated"
                    ? null
                    : resolveAllocateTarget(choice, head.field);
                return (
                  <div
                    key={headKey}
                    className="rounded-lg border border-line bg-sand/30"
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          setOpenHeads((prev) => ({
                            ...prev,
                            [headKey]: !headOpen,
                          }))
                        }
                      >
                        <p className="text-sm font-semibold text-ink">
                          Box {head.box} · {head.label}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {head.rows.length} transaction
                          {head.rows.length === 1 ? "" : "s"} ·{" "}
                          {gbp(head.amountPence)}
                          {target ? <> → {target.boxLabel}</> : null}
                          {choice === "unallocated" ? (
                            <> · kept unallocated</>
                          ) : null}
                        </p>
                      </button>
                      <label className="flex items-center gap-1 text-xs text-ink-soft">
                        <span className="sr-only">Allocate to form</span>
                        <select
                          className="input py-1 text-xs"
                          value={choice}
                          disabled={pending}
                          onChange={(e) =>
                            setFormByHead((prev) => ({
                              ...prev,
                              [headKey]: e.target.value as SaAllocateChoice,
                            }))
                          }
                        >
                          {CHOICE_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                              {SA_ALLOCATE_CHOICE_LABEL[f]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary text-xs"
                        disabled={pending || choice === "unallocated"}
                        onClick={() => {
                          if (choice === "unallocated") return;
                          allocate(year.label, head.field, headKey, choice);
                        }}
                      >
                        {busyKey === headKey
                          ? "Allocating…"
                          : choice === "unallocated"
                            ? "Unallocated"
                            : `Allocate to ${shortFormLabel(choice)}`}
                      </button>
                      <button
                        type="button"
                        className="px-1 text-ink-soft"
                        aria-label={headOpen ? "Collapse" : "Expand"}
                        onClick={() =>
                          setOpenHeads((prev) => ({
                            ...prev,
                            [headKey]: !headOpen,
                          }))
                        }
                      >
                        {headOpen ? "▾" : "›"}
                      </button>
                    </div>
                    {headOpen ? (
                      <div className="border-t border-line/80">
                        <div className="px-3 pt-2">
                          <label
                            className="sr-only"
                            htmlFor={`sa-head-search-${headKey}`}
                          >
                            Search transactions
                          </label>
                          <input
                            id={`sa-head-search-${headKey}`}
                            type="search"
                            className="input w-full text-sm"
                            placeholder="Search this list…"
                            value={headSearch[headKey] ?? ""}
                            onChange={(e) =>
                              setHeadSearch((prev) => ({
                                ...prev,
                                [headKey]: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <ul className="max-h-48 space-y-1 overflow-auto px-3 py-2 text-sm">
                          {head.rows
                            .slice()
                            .sort((a, b) => b.dated.localeCompare(a.dated))
                            .filter((row) => {
                              const q = (headSearch[headKey] ?? "")
                                .trim()
                                .toLowerCase();
                              if (!q) return true;
                              return (
                                row.description.toLowerCase().includes(q) ||
                                row.dated.includes(q) ||
                                gbp(row.amountPence)
                                  .toLowerCase()
                                  .includes(q)
                              );
                            })
                            .map((row) => (
                              <li
                                key={row.id}
                                className="flex justify-between gap-3 border-b border-line/50 py-1 last:border-0"
                              >
                                <span className="min-w-0">
                                  <span className="mono text-xs text-ink-soft">
                                    {row.dated}
                                  </span>{" "}
                                  <span className="text-ink">
                                    {row.description}
                                  </span>
                                </span>
                                <span
                                  className={`mono shrink-0 ${
                                    row.amountPence < 0
                                      ? "text-danger"
                                      : "text-ok"
                                  }`}
                                >
                                  {gbp(row.amountPence)}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {review.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
                  <p className="text-sm font-semibold text-ink">
                    Needs review (not mapped to a form box yet)
                  </p>
                  <p className="text-xs text-ink-soft">
                    {review.length} transaction
                    {review.length === 1 ? "" : "s"} ·{" "}
                    {gbp(
                      review.reduce((s, t) => s + t.amountPence, 0),
                    )}{" "}
                    — reassign in books before allocating.
                  </p>
                </div>
              ) : null}

              {heads.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-xs text-ink-soft">
                    {
                      heads.filter((h) => {
                        const c = choiceFor(
                          `${year.label}:${h.field}`,
                          h.field,
                          h.rows,
                        );
                        return c !== "unallocated";
                      }).length
                    }{" "}
                    of {heads.length} head
                    {heads.length === 1 ? "" : "s"} will allocate · rest stay
                    unallocated
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    disabled={pending}
                    onClick={() => allocateAllYear(year.label, heads)}
                  >
                    {busyKey === `all:${year.label}`
                      ? "Allocating all…"
                      : "Allocate all heads"}
                  </button>
                </div>
              ) : null}
            </div>
          </details>
        );
      })}

      {byYear.unassigned.length > 0 ? (
        <p className="text-xs text-ink-soft">
          {byYear.unassigned.length} line
          {byYear.unassigned.length === 1 ? "" : "s"} could not be dated into a
          tax year.
        </p>
      ) : null}

      {emailActivity.length > 0 ? (
        <div className="rounded-xl border border-line bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
            Email activity
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {emailActivity.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 py-1.5 last:border-0"
              >
                <span className="text-ink">
                  Missing statements email · {row.taxYear} → {row.toEmail}
                </span>
                <span className="mono shrink-0 text-xs text-ink-soft">
                  {formatSentAt(row.sentAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {emailDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => !pending && setEmailDraft(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Email client for missing bank statements"
            className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl text-ink">Email client</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Confirm the address and wording, then send.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xl leading-none text-ink-soft hover:bg-sand hover:text-ink"
                aria-label="Close"
                disabled={pending}
                onClick={() => setEmailDraft(null)}
              >
                ×
              </button>
            </div>

            <FormErrorBanner error={emailModalError} />

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="font-semibold text-ink">To</span>
                <input
                  type="email"
                  className="input mt-1 w-full"
                  value={emailDraft.toEmail}
                  disabled={pending}
                  onChange={(e) =>
                    setEmailDraft((d) =>
                      d ? { ...d, toEmail: e.target.value } : d,
                    )
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Subject</span>
                <input
                  type="text"
                  className="input mt-1 w-full"
                  value={emailDraft.subject}
                  disabled={pending}
                  onChange={(e) =>
                    setEmailDraft((d) =>
                      d ? { ...d, subject: e.target.value } : d,
                    )
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-ink">Message</span>
                <textarea
                  className="input mt-1 min-h-[14rem] w-full resize-y font-normal"
                  value={emailDraft.message}
                  disabled={pending}
                  onChange={(e) =>
                    setEmailDraft((d) =>
                      d ? { ...d, message: e.target.value } : d,
                    )
                  }
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() => setEmailDraft(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending}
                onClick={sendEmailFromPopup}
              >
                {busyKey === "email-send" ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
