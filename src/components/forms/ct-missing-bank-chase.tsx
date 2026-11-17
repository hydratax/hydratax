"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatMissingPeriodPhraseForAccounts,
  missingBankMonthsInPeriod,
  missingPeriodIsoBoundsForAccounts,
} from "@/lib/bank/missing-statement-months";
import {
  previewMissingCtBankStatementsEmail,
  requestMissingCtBankStatements,
} from "@/server/actions/ct-bank-missing-request";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";

type EmailDraft = {
  periodPhrase: string;
  periodStart: string;
  periodEnd: string;
  toEmail: string;
  subject: string;
  message: string;
};

type EmailActivity = {
  id: string;
  sentAt: string;
  toEmail: string;
  periodPhrase: string;
};

/**
 * bankbee — company accounts period: missing bank months + email chase
 * (same confirm-popup flow as SA).
 */
export function CtMissingBankChase({
  clientId,
  periodStart,
  periodEnd,
  datedIsos,
  clientEmail,
}: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  datedIsos: string[];
  clientEmail?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activity, setActivity] = useState<EmailActivity[]>([]);

  const coverage = useMemo(
    () => missingBankMonthsInPeriod(datedIsos, periodStart, periodEnd),
    [datedIsos, periodStart, periodEnd],
  );
  const phrase = coverage
    ? formatMissingPeriodPhraseForAccounts(coverage, periodStart)
    : null;
  const bounds = coverage
    ? missingPeriodIsoBoundsForAccounts(coverage, periodStart)
    : null;

  if (!coverage?.missingMonths.length || !phrase || !bounds) return null;

  function openPopup() {
    setError(null);
    setOk(null);
    setModalError(null);
    start(async () => {
      try {
        const res = await previewMissingCtBankStatementsEmail({
          clientId,
          periodStart: bounds!.startIso,
          periodEnd: bounds!.endIso,
          periodPhrase: phrase!,
          toEmail: clientEmail || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setEmailDraft({
          periodPhrase: phrase!,
          periodStart: bounds!.startIso,
          periodEnd: bounds!.endIso,
          toEmail: res.toEmail,
          subject: res.subject,
          message: res.message,
        });
      } catch (err) {
        setError(messageFromUnknown(err, "Could not open email draft"));
      }
    });
  }

  function send() {
    if (!emailDraft) return;
    const draft = emailDraft;
    setModalError(null);
    start(async () => {
      try {
        if (!draft.toEmail.trim()) {
          setModalError("Confirm the client email address.");
          return;
        }
        const res = await requestMissingCtBankStatements({
          clientId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          periodPhrase: draft.periodPhrase,
          toEmail: draft.toEmail.trim(),
          subject: draft.subject,
          message: draft.message,
        });
        if (!res.ok) {
          setModalError(res.error);
          return;
        }
        setEmailDraft(null);
        setOk(res.message);
        setActivity((prev) => [
          {
            id: crypto.randomUUID(),
            sentAt: res.sentAt,
            toEmail: res.toEmail,
            periodPhrase: draft.periodPhrase,
          },
          ...prev,
        ]);
        router.refresh();
      } catch (err) {
        setModalError(messageFromUnknown(err, "Could not send email"));
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

  return (
    <div className="space-y-3">
      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <p className="font-semibold">Missing bank statements</p>
        <p className="mt-0.5 break-words text-amber-900/90">{phrase}</p>
        <p className="mt-1 text-xs text-amber-900/80">
          Accounts period {periodStart} → {periodEnd} ·{" "}
          {coverage.missingMonths.length} month
          {coverage.missingMonths.length === 1 ? "" : "s"} missing
        </p>
        <div className="mt-2">
          <button
            type="button"
            className="btn btn-secondary text-xs"
            disabled={pending}
            onClick={openPopup}
          >
            {pending && !emailDraft
              ? "Opening…"
              : "Email client for these statements"}
          </button>
        </div>
      </div>

      {activity.length > 0 ? (
        <div className="rounded-xl border border-line bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
            Email activity
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {activity.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 py-1.5 last:border-0"
              >
                <span className="text-ink">
                  CT bank chase → {row.toEmail}
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
                  Confirm the address and wording for this accounts period,
                  then send.
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
            <FormErrorBanner error={modalError} />
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="font-semibold text-ink">To</span>
                <input
                  type="email"
                  className="input mt-1 w-full"
                  required
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
                  required
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
                  className="input mt-1 min-h-[14rem] w-full resize-y"
                  required
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
                onClick={send}
              >
                {pending ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
