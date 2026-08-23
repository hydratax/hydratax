"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminEmailStats,
  sendAdminEmail,
  type AdminEmailRecipientFilter,
  type AdminEmailTemplate,
} from "@/server/actions/admin-email";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

function formatBytes(bytes: number) {
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function EmailAdmin({
  initialStats,
}: {
  initialStats: Awaited<ReturnType<typeof getAdminEmailStats>>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [template, setTemplate] =
    useState<AdminEmailTemplate>("filing_reminder");
  const [filter, setFilter] =
    useState<AdminEmailRecipientFilter>("overdue_filings");
  const [pending, start] = useTransition();

  const usage = initialStats.r2Usage;
  const pct = usage
    ? Math.round((usage.bytesUsed / usage.bytesLimit) * 100)
    : null;

  return (
    <div className="space-y-8">
      {!initialStats.resendConfigured ? (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Add <code className="mono">RESEND_API_KEY</code> and{" "}
          <code className="mono">EMAIL_FROM</code> to send emails.
        </p>
      ) : null}

      <div className="panel grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">R2 storage</p>
          <p className="display mt-1 text-2xl text-ink">
            {usage ? formatBytes(usage.bytesUsed) : "—"}
          </p>
          <p className="text-sm text-ink-soft">
            {usage
              ? `of ${formatBytes(usage.bytesLimit)} (${pct}% · ${usage.documentCount} files)`
              : "Usage unavailable"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Alert thresholds</p>
          <p className="mt-1 text-sm text-ink-soft">80%, 90%, 95% → admins</p>
          <p className="text-sm text-ink-soft">
            {initialStats.adminEmails.join(", ") || "Set ADMIN_EMAIL"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Automated cron</p>
          <p className="mt-1 text-sm text-ink-soft">
            Filing reminders + R2 checks run daily at 09:00 UTC
          </p>
        </div>
      </div>

      <form
        className="panel space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setResult(null);
          const fd = new FormData(e.currentTarget);
          start(async () => {
            try {
              const res = await sendAdminEmail({
                template: (fd.get("template") as AdminEmailTemplate) ?? template,
                recipientFilter:
                  (fd.get("filter") as AdminEmailRecipientFilter) ?? filter,
                customEmails: String(fd.get("customEmails") ?? ""),
                subject: String(fd.get("subject") ?? ""),
                bodyText: String(fd.get("bodyText") ?? ""),
                bodyHtml: String(fd.get("bodyHtml") ?? ""),
                dryRun: fd.get("dryRun") === "on",
              });
              setResult(
                res.previewSubject
                  ? `Subject: “${res.previewSubject}” — ${res.sent} sent, ${res.skipped} skipped (${res.recipientCount} matched).`
                  : `${res.sent} sent, ${res.skipped} skipped.`,
              );
              if (res.errors.length) {
                setError(res.errors.slice(0, 3).join(" · "));
              }
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Send failed");
            }
          });
        }}
      >
        <h2 className="display text-2xl text-ink">Send email</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-ink">Template</span>
            <select
              name="template"
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
              value={template}
              onChange={(e) =>
                setTemplate(e.target.value as AdminEmailTemplate)
              }
            >
              <option value="filing_reminder">Filing reminders (TinyTax style)</option>
              <option value="custom">Custom message</option>
              <option value="trial_ending">Trial ending</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-ink">Recipients</span>
            <select
              name="filter"
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as AdminEmailRecipientFilter)
              }
            >
              <option value="overdue_filings">Practices with overdue filings</option>
              <option value="all_practices">All practice owners/admins</option>
              <option value="custom_list">Custom email list</option>
            </select>
          </label>
        </div>

        {filter === "custom_list" ? (
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-ink">Email addresses</span>
            <textarea
              name="customEmails"
              rows={3}
              placeholder="one@example.com, two@example.com"
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
            />
          </label>
        ) : null}

        {template === "custom" ? (
          <>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold text-ink">Subject</span>
              <input
                name="subject"
                className="w-full rounded-lg border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold text-ink">Message</span>
              <textarea
                name="bodyText"
                rows={6}
                className="w-full rounded-lg border border-line bg-white px-3 py-2"
              />
            </label>
            <input type="hidden" name="bodyHtml" value="" />
          </>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="dryRun" />
          Preview only (count recipients, do not send)
        </label>

        <FormErrorBanner error={error} />
        {result ? <p className="text-sm text-ok">{result}</p> : null}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Sending…" : "Send email"}
        </button>
      </form>
    </div>
  );
}
