"use client";

import { PendingLink } from "@/components/pending-link";

export function DashboardServiceCard(props: {
  href: string;
  moduleLabel: string;
  title: string;
  blurb: string;
  locked?: boolean;
  cta: string;
  pendingLabel: string;
}) {
  return (
    <PendingLink
      href={props.href}
      className={`panel panel-interactive relative block p-4 ${
        props.locked ? "opacity-90" : ""
      }`}
      pendingLabel={props.pendingLabel}
    >
      {(pending) => (
        <>
          {props.locked ? (
            <span className="badge badge-muted absolute right-3 top-3">
              Locked
            </span>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                {props.moduleLabel}
              </p>
              <p className="display mt-1 text-xl text-ink">{props.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{props.blurb}</p>
              {props.locked ? (
                <span
                  className={`mt-3 inline-flex open-chip ${pending ? "is-pending" : ""}`}
                >
                  {pending ? "Opening…" : props.cta}
                </span>
              ) : null}
            </div>
            {!props.locked ? (
              <span
                className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
              >
                {pending ? "Opening…" : props.cta}
              </span>
            ) : null}
          </div>
        </>
      )}
    </PendingLink>
  );
}
