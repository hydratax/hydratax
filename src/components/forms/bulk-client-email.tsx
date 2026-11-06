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
import { formatDueShort } from "@/lib/filing-due";

type AccountsProps = {
  mode: "accounts";
  candidates: BulkEmailCandidate[];
  nextMonthLabel: string;
  monthAfterLabel: string;
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

function statusLabel(status: BulkSaEmailCandidate["status"]) {
  if (status === "accepted") return "Accepted";
  if (status === "submitted") return "Submitted";
  if (status === "draft") return "Draft";
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
  const [windowFilter, setWindowFilter] = useState<
    "both" | "next_month" | "month_after"
  >("both");
  const [statusFilter, setStatusFilter] = useState<
    "outstanding" | "all" | "submitted"
  >("outstanding");
  const [subject, setSubject] = useState(props.defaultSubject);
  const [message, setMessage] = useState(props.defaultMessage);

  const accountsVisible = useMemo(() => {
    if (props.mode !== "accounts") return [];
    if (windowFilter === "both") return props.candidates;
    return props.candidates.filter((c) => c.dueWindow === windowFilter);
  }, [props, windowFilter]);

  const saVisible = useMemo(() => {
    if (props.mode !== "sa") return [];
    if (statusFilter === "all") return props.candidates;
    if (statusFilter === "submitted") {
      return props.candidates.filter(
        (c) => c.status === "submitted" || c.status === "accepted",
      );
    }
    return props.candidates.filter(
      (c) => c.status === "none" || c.status === "draft",
    );
  }, [props, statusFilter]);

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
              .filter(
                (c) =>
                  c.contactEmail &&
                  (c.status === "none" || c.status === "draft"),
              )
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

  return (
    <div className="space-y-6">
      <div className="panel p-5 text-sm text-ink-soft">
        <p>
          Sends from <strong className="text-ink">{props.senderEmail}</strong>.
          Replies come back to your inbox.
        </p>
        {props.mode === "accounts" ? (
          <p className="mt-2">
            Limited companies with annual accounts due in{" "}
            <strong className="text-ink">{props.nextMonthLabel}</strong> or{" "}
            <strong className="text-ink">{props.monthAfterLabel}</strong>.
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
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["both", "Both months"],
              ["next_month", props.nextMonthLabel],
              ["month_after", props.monthAfterLabel],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`filing-filter ${windowFilter === id ? "is-active" : ""}`}
              onClick={() => setWindowFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["outstanding", "Still to file"],
              ["submitted", "Submitted"],
              ["all", "Everyone"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`filing-filter ${statusFilter === id ? "is-active" : ""}`}
              onClick={() => setStatusFilter(id)}
            >
              {label}
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
                    {props.mode === "sa" ? "Filing due" : "Accounts due"}
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
                          href={`/clients/${c.slug}`}
                          className="font-semibold text-sea hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-ink-soft">
                          {c.dueWindow === "next_month"
                            ? props.nextMonthLabel
                            : props.monthAfterLabel}
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
                        : "No clients with accounts due in the selected month window."}
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
