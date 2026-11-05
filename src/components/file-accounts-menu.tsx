"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  companyNumber: string;
  /** Practice client desk — routes into /clients/[id]/year-end */
  clientId?: string;
  companyName?: string;
  periodEndLabel?: string;
  /** Compact trigger for cards; defaults to full-width primary */
  className?: string;
  /** Button label */
  label?: string;
  /** Open the sheet immediately (e.g. public CH accounts landing) */
  defaultOpen?: boolean;
};

/**
 * File Accounts opens a Hydra-styled action sheet:
 * Accounts only, CT600 only, or file both — then Enter Details.
 * Works for practice clients and public Companies House company hubs.
 */
export function FileAccountsMenu({
  clientId,
  companyNumber,
  companyName,
  periodEndLabel,
  className,
  label = "File Accounts",
  defaultOpen = false,
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const company = encodeURIComponent(companyNumber);
  const base = clientId
    ? `/clients/${encodeURIComponent(clientId)}/year-end`
    : `/companies-house/accounts-ixbrl`;

  function hrefFor(mode: string) {
    if (clientId) return `${base}?mode=${mode}&company=${company}`;
    return `${base}?company=${company}&mode=${mode}`;
  }

  const sheet =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                    Year-end filing
                  </p>
                  <h2 id={titleId} className="display mt-0.5 text-xl text-ink sm:text-2xl">
                    File Accounts
                  </h2>
                  {(companyName || periodEndLabel) && (
                    <p className="mt-0.5 truncate text-sm text-ink-soft">
                      {[
                        companyName,
                        periodEndLabel && `Period end ${periodEndLabel}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 px-3 py-2 text-sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
                <ActionCard
                  href={hrefFor("both")}
                  title="File both"
                  blurb="CT600 and Companies House accounts for this year-end, together."
                  primary
                  onNavigate={() => setOpen(false)}
                />
                <ActionCard
                  href={hrefFor("accounts")}
                  title="Accounts only"
                  blurb="Companies House annual accounts only — no CT600 in this step."
                  onNavigate={() => setOpen(false)}
                />
                <ActionCard
                  href={hrefFor("ct600")}
                  title="CT600 only"
                  blurb="Corporation tax return to HMRC only — no accounts in this step."
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={
          className
            ? `btn btn-primary text-sm shadow-md ${className}`
            : "btn btn-primary w-full text-sm shadow-md"
        }
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {sheet}
    </>
  );
}

/** Inline three-card chooser (no modal) — used on public CH accounts pages. */
export function FileAccountsChooser({
  companyNumber,
  clientId,
  companyName,
}: {
  companyNumber: string;
  clientId?: string;
  companyName?: string;
}) {
  const company = encodeURIComponent(companyNumber);
  const base = clientId
    ? `/clients/${encodeURIComponent(clientId)}/year-end`
    : `/companies-house/accounts-ixbrl`;

  function hrefFor(mode: string) {
    if (clientId) {
      return `${base}?mode=${mode}&company=${company}`;
    }
    return `${base}?company=${company}&mode=${mode}`;
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Year-end filing
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">
          File Accounts
        </h1>
        {companyName && (
          <p className="mt-2 text-sm text-ink-soft">
            {companyName} · {companyNumber}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-soft">
          Choose what you would like to file for this period.
        </p>
      </div>
      <div className="space-y-2">
        <ActionCard
          href={hrefFor("both")}
          title="File both"
          blurb="CT600 and Companies House accounts for this year-end, together."
          primary
          onNavigate={() => undefined}
        />
        <ActionCard
          href={hrefFor("accounts")}
          title="Accounts only"
          blurb="Companies House annual accounts only — no CT600 in this step."
          onNavigate={() => undefined}
        />
        <ActionCard
          href={hrefFor("ct600")}
          title="CT600 only"
          blurb="Corporation tax return to HMRC only — no accounts in this step."
          onNavigate={() => undefined}
        />
      </div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  blurb,
  primary,
  onNavigate,
}: {
  href: string;
  title: string;
  blurb: string;
  primary?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block rounded-xl border px-3.5 py-3 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
        primary
          ? "border-sea/40 bg-sea/5 hover:border-sea"
          : "border-line bg-white hover:border-sea/50"
      }`}
    >
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-sm leading-snug text-ink-soft">{blurb}</p>
      <span
        className={`mt-2 inline-flex text-sm font-semibold ${
          primary ? "text-sea" : "text-ink-soft"
        }`}
      >
        Continue →
      </span>
    </Link>
  );
}
