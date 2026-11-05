"use client";

import { useState } from "react";

export function DocumentInboxCard({
  inboxEmail,
  clientName,
}: {
  inboxEmail: string;
  clientName: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="panel gloss-card space-y-3 p-5">
      <div>
        <h3 className="display text-xl text-ink">Document inbox</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Bookkeeping can email bank statements, invoices, or ID scans to this
          address — they land in {clientName}&apos;s documents automatically.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="mono break-all rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
          {inboxEmail}
        </code>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inboxEmail);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              /* ignore */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        Attach the file to the email. Images are stored as PDF. Subject line is
        optional.
      </p>
    </div>
  );
}
