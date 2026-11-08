"use client";

import { useState } from "react";

export function TaskInboxBanner({ inboxEmail }: { inboxEmail: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-white/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sea">
            Tasks email
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Forward documents and queries here.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary shrink-0 px-2.5 py-1 text-xs"
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
      <code className="mono mt-2 block truncate rounded-md border border-line bg-paper px-2.5 py-1.5 text-[11px] leading-snug text-ink-soft sm:text-xs">
        {inboxEmail}
      </code>
    </div>
  );
}
