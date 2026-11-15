"use client";

import { PendingLink } from "@/components/pending-link";

export type SecretarialCompanyCardProps = {
  href: string;
  name: string;
  companyNumber: string | null;
  status: string | null;
  addressSnippet: string | null;
  confirmationDue: string | null;
};

function statusTone(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (!s) return "badge badge-muted";
  if (s === "active") return "badge";
  if (s.includes("dissolv") || s.includes("liquidat") || s === "removed") {
    return "badge badge-muted";
  }
  return "badge badge-muted";
}

export function SecretarialCompanyCard(props: SecretarialCompanyCardProps) {
  return (
    <PendingLink
      href={props.href}
      className="service-tile group relative flex h-full min-h-[9.5rem] flex-col overflow-hidden"
      pendingLabel={`Opening ${props.name}…`}
    >
      {(pending) => (
        <>
          <span className="service-tile__sheen" aria-hidden />
          <div className="relative z-[1] flex h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sea/20 bg-sea/10 text-sea">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 21h18" />
                  <path d="M5 21V8l7-4 7 4v13" />
                  <path d="M9 21v-6h6v6" />
                </svg>
              </span>
              <span
                className={`open-chip open-chip--sm shrink-0 ${
                  pending ? "is-pending" : ""
                }`}
              >
                {pending ? "…" : "Open"}
              </span>
            </div>
            <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
              Limited company
            </p>
            <p className="display mt-1 text-lg leading-snug text-ink md:text-xl">
              {props.name}
            </p>
            <p className="mt-1 mono text-xs text-ink-soft">
              {props.companyNumber
                ? `Company no. ${props.companyNumber}`
                : "No company number on file"}
            </p>
            {props.addressSnippet ? (
              <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-soft">
                {props.addressSnippet}
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              {props.status ? (
                <span className={statusTone(props.status)}>
                  {props.status}
                </span>
              ) : null}
              {props.confirmationDue ? (
                <span className="text-xs text-ink-soft">
                  CS due {props.confirmationDue}
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}
    </PendingLink>
  );
}
