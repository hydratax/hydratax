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
      className={`service-tile group relative flex h-full min-h-[8.5rem] flex-col overflow-hidden ${
        props.locked ? "service-tile--locked" : ""
      }`}
      pendingLabel={props.pendingLabel}
    >
      {(pending) => (
        <>
          <span className="service-tile__sheen" aria-hidden />
          <div className="relative z-[1] flex h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
                {props.moduleLabel}
              </p>
              {props.locked ? (
                <span className="badge badge-muted shrink-0">Locked</span>
              ) : (
                <span
                  className={`open-chip open-chip--sm shrink-0 ${
                    pending ? "is-pending" : ""
                  }`}
                >
                  {pending ? "…" : props.cta}
                </span>
              )}
            </div>
            <p className="display mt-2 text-lg leading-snug text-ink md:text-xl">
              {props.title}
            </p>
            <p className="mt-auto pt-2 text-sm leading-snug text-ink-soft">
              {props.blurb}
            </p>
            {props.locked ? (
              <span
                className={`open-chip open-chip--sm mt-3 inline-flex w-fit ${
                  pending ? "is-pending" : ""
                }`}
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
