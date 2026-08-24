"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  sendBulkClientEmails,
  type BulkEmailCandidate,
} from "@/server/actions/client-communications";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { formatDueShort } from "@/lib/filing-due";

type Props = {
  candidates: BulkEmailCandidate[];
  nextMonthLabel: string;
  monthAfterLabel: string;
  defaultSubject: string;
  defaultMessage: string;
  senderEmail: string;
};

export function BulkClientEmailForm({
  candidates,
  nextMonthLabel,
  monthAfterLabel,
  defaultSubject,
  defaultMessage,
  senderEmail,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    results: Array<{ name: string; ok: boolean; error?: string }>;
  } | null>(null);
  const [windowFilter, setWindowFilter] = useState<"both" | "next_month" | "month_after">(
    "both",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        candidates.filter((c) => c.contactEmail).map((c) => c.clientId),
      ),
  );
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);

  const visible = useMemo(() => {
    if (windowFilter === "both") return candidates;
    return candidates.filter((c) => c.dueWindow === windowFilter);
  }, [candidates, windowFilter]);

  const withEmail = visible.filter((c) => c.contactEmail);
  const missingEmail = visible.filter((c) => !c.contactEmail);

  return (
    <div className="space-y-6">
      <div className="panel p-5 text-sm text-ink-soft">
        <p>
          Sends from <strong className="text-ink">{senderEmail}</strong> — not
          the HydraTax system address. Replies go to your inbox. Your email
          domain must be verified in Resend for live delivery.
        </p>
        <p className="mt-2">
          Only limited companies with annual accounts due in{" "}
          <strong className="text-ink">{nextMonthLabel}</strong> or{" "}
          <strong className="text-ink">{monthAfterLabel}</strong> are listed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["both", "Both months"],
            ["next_month", nextMonthLabel],
            ["month_after", monthAfterLabel],
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

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-line bg-sand/60 px-4 py-3">
            <p className="font-semibold text-ink">
              {visible.length} relevant · {withEmail.length} ready to email
            </p>
            {missingEmail.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                {missingEmail.length} missing contact email — add on each client
                overview or re-import with email column.
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
                        withEmail.every((c) => selected.has(c.clientId))
                      }
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            withEmail.forEach((c) => next.add(c.clientId));
                          } else {
                            withEmail.forEach((c) => next.delete(c.clientId));
                          }
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Accounts due</th>
                  <th className="px-4 py-2">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((c) => (
                  <tr key={c.clientId} className={!c.contactEmail ? "opacity-60" : ""}>
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
                          ? nextMonthLabel
                          : monthAfterLabel}
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
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                      No clients with accounts due in the selected month window.
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
            const ids = [...selected].filter((id) =>
              visible.some((c) => c.clientId === id && c.contactEmail),
            );
            if (!ids.length) {
              setError("Select at least one client with an email address.");
              return;
            }
            start(async () => {
              try {
                const res = await sendBulkClientEmails({
                  clientIds: ids,
                  subject,
                  messageTemplate: message,
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
              Use {"{{client_name}}"}, {"{{accounts_due}}"}, {"{{company_number}}"},{" "}
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
              rows={12}
              className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
            />
          </label>

          <FormErrorBanner error={error} />

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending || selected.size === 0}
          >
            {pending
              ? "Sending…"
              : `Send to ${selected.size} client${selected.size === 1 ? "" : "s"}`}
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
              Each message is recorded under the client&apos;s Communications tab.
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
