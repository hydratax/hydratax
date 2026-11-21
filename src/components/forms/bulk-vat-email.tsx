"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  sendBulkVatEmails,
  type BulkVatEmailCandidate,
  type VatReminderMonth,
} from "@/server/actions/client-communications";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { calendarYearReminderMonths } from "@/lib/filing-due";
import {
  matchesVatFilter,
  vatStatusLabel,
  type VatClientFilter,
} from "@/lib/vat-client-status";

const VAT_FILTERS: Array<{ id: VatClientFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "drafted", label: "Drafted" },
  { id: "emailed", label: "Emailed to client" },
  { id: "completed", label: "Completed" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
];

export function BulkVatEmailForm({
  candidates,
  months: initialMonths,
  years,
  defaultMonthKey,
  defaultYear,
  defaultSubject,
  defaultMessage,
  senderEmail,
}: {
  candidates: BulkVatEmailCandidate[];
  months: VatReminderMonth[];
  years: number[];
  defaultMonthKey: string;
  defaultYear: number;
  defaultSubject: string;
  defaultMessage: string;
  senderEmail: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    results: Array<{ name: string; ok: boolean; error?: string }>;
  } | null>(null);
  const [year, setYear] = useState(defaultYear);
  const months = useMemo(
    () =>
      year === defaultYear
        ? initialMonths
        : calendarYearReminderMonths(new Date(year, 0, 1)),
    [year, defaultYear, initialMonths],
  );
  const [monthKey, setMonthKey] = useState(
    () =>
      initialMonths.find((m) => m.key === defaultMonthKey)?.key ??
      initialMonths[0]?.key ??
      "",
  );
  const month = months.find((m) => m.key === monthKey) ?? months[0]!;
  const [statusFilter, setStatusFilter] = useState<VatClientFilter>("all");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((c) =>
        matchesVatFilter(
          {
            status: c.vatStatus,
            nextDueIso: null,
            nextDueLabel: null,
            periodLabel: null,
          },
          statusFilter,
        ),
      ),
    [candidates, statusFilter],
  );

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        candidates.filter((c) => c.contactEmail).map((c) => c.clientId),
      ),
  );
  const [addId, setAddId] = useState("");

  const selectedRows = useMemo(
    () => filteredCandidates.filter((c) => selected.has(c.clientId)),
    [filteredCandidates, selected],
  );
  const availableToAdd = useMemo(
    () => filteredCandidates.filter((c) => !selected.has(c.clientId)),
    [filteredCandidates, selected],
  );
  const ready = selectedRows.filter((c) => c.contactEmail);

  function switchMonth(key: string) {
    setMonthKey(key);
    const m = months.find((x) => x.key === key);
    if (m) {
      setSubject(`VAT return — {{client_name}} · ${m.label}`);
    }
  }

  function switchYear(nextYear: number) {
    setYear(nextYear);
    const nextMonths = calendarYearReminderMonths(new Date(nextYear, 0, 1));
    const keep =
      nextMonths.find((m) => m.key.slice(5) === monthKey.slice(5)) ??
      nextMonths[0];
    if (keep) {
      setMonthKey(keep.key);
      setSubject(`VAT return — {{client_name}} · ${keep.label}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="panel p-5 text-sm text-ink-soft">
        <p>
          Sends from <strong className="text-ink">{senderEmail}</strong>. Replies
          come back to your inbox.
        </p>
        <p className="mt-2">
          Monthly reminder list for quarterly VAT returns. Review who will
          receive the email, remove anyone who should not, then send.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={`filing-filter ${year === y ? "is-active" : ""}`}
            onClick={() => switchYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`filing-filter ${monthKey === m.key ? "is-active" : ""}`}
            onClick={() => switchMonth(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {VAT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filing-filter ${statusFilter === f.id ? "is-active" : ""}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-line bg-sand/60 px-4 py-3">
            <p className="font-semibold text-ink">
              Recipients · {selectedRows.length} selected · {ready.length} with
              email
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {month?.label} quarterly VAT reminder
              {statusFilter !== "all"
                ? ` · ${VAT_FILTERS.find((f) => f.id === statusFilter)?.label}`
                : ""}
            </p>
          </div>

          <ul className="max-h-[360px] divide-y divide-line overflow-auto">
            {selectedRows.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink-soft">
                No recipients yet — add a VAT client below, or clear the status
                filter.
              </li>
            ) : (
              selectedRows.map((c) => (
                <li
                  key={c.clientId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${c.slug}/vat`}
                      className="font-semibold text-sea hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {c.vrn ? `VRN ${c.vrn}` : "VAT registered"}
                      {c.contactEmail ? ` · ${c.contactEmail}` : " · No email"}
                      {` · ${vatStatusLabel(c.vatStatus)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={pending}
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        next.delete(c.clientId);
                        return next;
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>

          {availableToAdd.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3">
              <label className="min-w-[12rem] flex-1 text-sm font-semibold">
                Add client
                <select
                  className="input mt-1.5 w-full"
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {availableToAdd.map((c) => (
                    <option key={c.clientId} value={c.clientId}>
                      {c.name}
                      {!c.contactEmail ? " (no email)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!addId}
                onClick={() => {
                  if (!addId) return;
                  setSelected((prev) => new Set(prev).add(addId));
                  setAddId("");
                }}
              >
                Add
              </button>
            </div>
          ) : null}
        </div>

        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setSummary(null);
            const ids = ready.map((c) => c.clientId);
            if (!ids.length) {
              setError("Select at least one client with an email address.");
              return;
            }
            start(async () => {
              try {
                const res = await sendBulkVatEmails({
                  clientIds: ids,
                  subject,
                  messageTemplate: message,
                  periodEnd: month.periodEnd,
                });
                setSummary(res);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Send failed");
              }
            });
          }}
        >
          <div>
            <h2 className="display text-2xl text-ink">Compose</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Use {"{{client_name}}"}, {"{{accounts_due}}"},{" "}
              {"{{practice_name}}"}, {"{{sender_name}}"}.
            </p>
          </div>

          <label className="block text-sm font-semibold">
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>

          <label className="block text-sm font-semibold">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={10}
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>

          <FormErrorBanner error={error} />

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending || ready.length === 0}
          >
            {pending
              ? "Sending…"
              : `Send to ${ready.length} client${ready.length === 1 ? "" : "s"}`}
          </button>
        </form>
      </div>

      {summary ? (
        <div className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">
              Sent {summary.sent}
              {summary.failed ? ` · failed ${summary.failed}` : ""}
            </p>
          </div>
          {summary.failed > 0 ? (
            <ul className="divide-y divide-line text-sm">
              {summary.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.name} className="px-4 py-2 text-danger">
                    {r.name}: {r.error}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
