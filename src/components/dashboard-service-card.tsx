"use client";

import { PendingLink } from "@/components/pending-link";
import type { ServiceModule } from "@/lib/entitlements";

function ServiceIcon({
  module,
  className,
}: {
  module?: ServiceModule | string;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (module) {
    case "vat":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10M7 12h6M7 16h8" />
          <path d="M16 14l2 2 3-4" />
        </svg>
      );
    case "corporation_tax":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v2h4M9 13V11h3" />
        </svg>
      );
    case "self_assessment":
      return (
        <svg {...common}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "payroll":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 11h8M8 15h5" />
          <circle cx="16.5" cy="15.5" r="2.5" />
        </svg>
      );
    case "companies_house":
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M5 21V8l7-4 7 4v13" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M7 8h10M7 12h6" />
        </svg>
      );
  }
}

export function DashboardServiceCard(props: {
  href: string;
  moduleLabel: string;
  title: string;
  blurb: string;
  locked?: boolean;
  cta: string;
  pendingLabel: string;
  module?: ServiceModule | string;
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sea/20 bg-sea/10 text-sea">
                <ServiceIcon module={props.module} className="h-5 w-5" />
              </span>
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
            <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
              {props.moduleLabel}
            </p>
            <p className="display mt-1 text-lg leading-snug text-ink md:text-xl">
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
