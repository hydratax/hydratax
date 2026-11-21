"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  sendBulkClientEmails,
  sendBulkSaEmails,
  type BulkEmailCandidate,
  type BulkSaEmailCandidate,
} from "@/server/actions/client-communications";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import {
  calendarYearReminderMonths,
  formatDueShort,
  type CalendarReminderMonth,
} from "@/lib/filing-due";
import {
  SA_DESK_FILTERS,
  matchesSaDeskFilter,
  mergeSaWorkStage,
  normalizeWorkStage,
  type SaDeskFilter,
} from "@/lib/client-work-stage";
import {
  ctStatusLabel,
  matchesCtFilter,
  type CtClientFilter,
} from "@/lib/ct-client-status";

type AccountsProps = {
  mode: "accounts";
  candidates: BulkEmailCandidate[];
  months: CalendarReminderMonth[];
  years: number[];
  defaultMonthKey: string;
  defaultYear: number;
  defaultSubject: string;
  defaultMessage: string;
  senderEmail: string;
};

type SaProps = {
  mode: "sa";
  candidates: BulkSaEmailCandidate[];
  taxYear: string;
  filingDue: string;
  defaultSubject: string;
  defaultMessage: string;
  senderEmail: string;
};

type Props = AccountsProps | SaProps;

const CT_FILTERS: Array<{ id: CtClientFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not started" },
  { id: "drafted", label: "Drafted" },
  { id: "ready", label: "Ready to file" },
  { id: "submitted", label: "Submitted" },
  { id: "accepted", label: "Accepted" },
];

function statusLabel(status: BulkSaEmailCandidate["status"]) {
  if (status === "accepted") return "Accepted";
  if (status === "submitted") return "Submitted";
  if (status === "draft") return "Drafted";
  return "Not started";
}

export function BulkClientEmailForm(props: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    results: Array<{ name: string; ok: boolean; error?: string }>;
  } | null>(null);
  const [saStatusFilter, setSaStatusFilter] = useState<SaDeskFilter>("all");
  const [ctStatusFilter, setCtStatusFilter] = useState<CtClientFilter>("all");
  const [subject, setSubject] = useState(props.defaultSubject);
  const [message, setMessage] = useState(props.defaultMessage);

  const accountsMonthsInitial =
    props.mode === "accounts" ? props.months : [];
  const accountsDefaultYear =
    props.mode === "accounts" ? props.defaultYear : new Date().getFullYear();
  const accountsYears = props.mode === "accounts" ? props.years : [];
  const [year, setYear] = useState(accountsDefaultYear);
  const months = useMemo(() => {
    if (props.mode !== "accounts") return [];
    return year === accountsDefaultYear
      ? accountsMonthsInitial
      : calendarYearReminderMonths(new Date(year, 0, 1));
  }, [props.mode, year, accountsDefaultYear, accountsMonthsInitial]);
  const [monthKey, setMonthKey] = useState(() => {
    if (props.mode !== "accounts") return "";
    return (
      props.months.find((m) => m.key === props.defaultMonthKey)?.key ??
      props.months[0]?.key ??
      ""
    );
  });
  const month = months.find((m) => m.key === monthKey) ?? months[0];

  const accountsVisible = useMemo(() => {
    if (props.mode !== "accounts") return [];
    return props.candidates.filter((c) => {
      if (monthKey && c.dueMonthKey !== monthKey) return false;
      return matchesCtFilter(
        {
          status: c.ctStatus,
          periodLabel: null,
          dueIso: c.accountsDue,
          dueLabel: null,
          urgency: "ok",
          filed: c.ctStatus === "submitted" || c.ctStatus === "accepted",
        },
        ctStatusFilter,
      );
    });
  }, [props, monthKey, ctStatusFilter]);

  const saVisible = useMemo(() => {
    if (props.mode !== "sa") return [];
    return props.candidates.filter((c) => {
      const filing =
        c.status === "accepted"
          ? "accepted"
          : c.status === "submitted"
            ? "submitted"
            : c.status === "draft"
              ? "draft"
              : null;
      const stage = mergeSaWorkStage(
        normalizeWorkStage(c.workStage),
        filing,
      );
      return matchesSaDeskFilter(stage, saStatusFilter, filing);
    });
  }, [props, saStatusFilter]);

  const visibleIds =
    props.mode === "accounts"
      ? accountsVisible.map((c) => c.clientId)
      : saVisible.map((c) => c.id);

  const withEmail =
    props.mode === "accounts"
      ? accountsVisible.filter((c) => c.contactEmail)
      : saVisible.filter((c) => c.contactEmail);
  const missingEmail =
    props.mode === "accounts"
      ? accountsVisible.filter((c) => !c.contactEmail)
      : saVisible.filter((c) => !c.contactEmail);

  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        props.mode === "accounts"
          ? props.candidates
              .filter((c) => c.contactEmail)
              .map((c) => c.clientId)
          : props.candidates
              .filter((c) => c.contactEmail)
              .map((c) => c.id),
      ),
  );

  const selectedReady = [...selected].filter((id) =>
    withEmail.some((c) =>
      props.mode === "accounts"
        ? (c as BulkEmailCandidate).clientId === id
        : (c as BulkSaEmailCandidate).id === id,
    ),
  );

  function switchMonth(key: string) {
    setMonthKey(key);
    const m = months.find((x) => x.key === key);
    if (m && props.mode === "accounts") {
      setSubject(`CT600 due — {{client_name}} · ${m.label}`);
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
      setSubject(`CT600 due — {{client_name}} · ${keep.label}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="panel p-5 text-sm text-ink-soft">
        <p>
          Sends from <strong className="text-ink">{props.senderEmail}</strong>.
          Replies come back to your inbox.
        </p>
        {props.mode === "accounts" ? (
          <p className="mt-2">
            Limited companies with a CT600 filing deadline in the selected
            month. Deadlines are 12 months after the accounting period ends.
          </p>
        ) : (
          <p className="mt-2">
            Self Assessment people for tax year{" "}
            <strong className="text-ink">{props.taxYear}</strong> (6 April to 5
            April). Online filing deadline{" "}
            <strong className="text-ink">
              {formatDueShort(props.filingDue) ?? props.filingDue}
            </strong>
            .
          </p>
        )}
      </div>

      {props.mode === "accounts" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {accountsYears.map((y) => (
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
            {CT_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filing-filter ${ctStatusFilter === f.id ? "is-active" : ""}`}
                onClick={() => setCtStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {SA_DESK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`filing-filter ${saStatusFilter === f.id ? "is-active" : ""}`}
              onClick={() => setSaStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-line bg-sand/60 px-4 py-3">
            <p className="font-semibold text-ink">
              {visibleIds.length} listed · {withEmail.length} ready to email
            </p>
            {props.mode === "accounts" && month ? (
              <p className="mt-1 text-sm text-ink-soft">
                CT600 due · {month.label}
              </p>
            ) : null}
            {missingEmail.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                {missingEmail.length} missing email — add it on the person or
                client record.
              </p>
            )}
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-sand/90 text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all with email"
                      checked={
                        withEmail.length > 0 &&
                        withEmail.every((c) =>
                          selected.has(
                            props.mode === "accounts"
                              ? (c as BulkEmailCandidate).clientId
                              : (c as BulkSaEmailCandidate).id,
                          ),
                        )
                      }
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const ids = withEmail.map((c) =>
                            props.mode === "accounts"
                              ? (c as BulkEmailCandidate).clientId
                              : (c as BulkSaEmailCandidate).id,
                          );
                          if (e.target.checked) ids.forEach((id) => next.add(id));
                          else ids.forEach((id) => next.delete(id));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-4 py-2">
                    {props.mode === "sa" ? "Person" : "Client"}
                  </th>
                  <th className="px-4 py-2">
                    {props.mode === "sa" ? "Filing due" : "CT600 due"}
                  </th>
                  <th className="px-4 py-2">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {props.mode === "accounts" &&
                  accountsVisible.map((c) => (
                    <tr
                      key={c.clientId}
                      className={!c.contactEmail ? "opacity-60" : ""}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          disabled={!c.contactEmail || pending}
                          checked={selected.has(c.clientId)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.clientId);
                              else next.delete(c.clientId);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/clients/${c.slug}/corporation-tax`}
                          className="font-semibold text-sea hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-ink-soft">
                          {ctStatusLabel(c.ctStatus)}
                        </p>
                      </td>
                      <td className="mono px-4 py-2">
                        {formatDueShort(c.accountsDue) ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c.contactEmail ?? (
                          <span className="text-ink-soft">No email</span>
                        )}
                      </td>
                    </tr>
                  ))}

                {props.mode === "sa" &&
                  saVisible.map((c) => (
                    <tr
                      key={c.id}
                      className={!c.contactEmail ? "opacity-60" : ""}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          disabled={!c.contactEmail || pending}
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.id);
                              else next.delete(c.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={c.href}
                          className="font-semibold text-sea hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-ink-soft">
                          {c.taxYear} · {statusLabel(c.status)}
                        </p>
                      </td>
                      <td className="mono px-4 py-2">
                        {formatDueShort(c.filingDue) ?? c.filingDue}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c.contactEmail ?? (
                          <span className="text-ink-soft">No email</span>
                        )}
                      </td>
                    </tr>
                  ))}

                {visibleIds.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-ink-soft"
                    >
                      {props.mode === "sa"
                        ? "No Self Assessment people in this filter."
                        : "No clients with a CT600 deadline in the selected month."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setSummary(null);
            if (!selectedReady.length) {
              setError("Select at least one person with an email address.");
              return;
            }
            start(async () => {
              try {
                if (props.mode === "sa") {
                  const res = await sendBulkSaEmails({
                    ids: selectedReady,
                    subject,
                    messageTemplate: message,
                  });
                  setSummary(res);
                } else {
                  const res = await sendBulkClientEmails({
                    clientIds: selectedReady,
                    subject,
                    messageTemplate: message,
                  });
                  setSummary(res);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Send failed");
              }
            });
          }}
        >
          <div>
            <h2 className="display text-2xl text-ink">Compose</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {props.mode === "sa" ? (
                <>
                  Use {"{{client_name}}"}, {"{{tax_year}}"}, {"{{filing_due}}"},{" "}
                  {"{{practice_name}}"}, {"{{sender_name}}"}.
                </>
              ) : (
                <>
                  Use {"{{client_name}}"}, {"{{accounts_due}}"},{" "}
                  {"{{company_number}}"}, {"{{practice_name}}"},{" "}
                  {"{{sender_name}}"}.
                </>
              )}
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
              rows={12}
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>

          <FormErrorBanner error={error} />

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending || selectedReady.length === 0}
          >
            {pending
              ? "Sending…"
              : `Send to ${selectedReady.length} ${
                  selectedReady.length === 1 ? "person" : "people"
                }`}
          </button>
        </form>
      </div>

      {summary && (
        <div className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">
              Sent {summary.sent}
              {summary.failed ? ` · failed ${summary.failed}` : ""}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Each message is recorded under Communications.
            </p>
          </div>
          {summary.failed > 0 && (
            <ul className="divide-y divide-line text-sm">
              {summary.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.name} className="px-4 py-2 text-danger">
                    {r.name}: {r.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
