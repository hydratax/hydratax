"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
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

  return (
    <>
      <button
        type="button"
        className={className ?? "btn btn-primary w-full text-sm"}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                  Year-end filing
                </p>
                <h2 id={titleId} className="display mt-1 text-2xl text-ink">
                  File Accounts
                </h2>
                {(companyName || periodEndLabel) && (
                  <p className="mt-1 text-sm text-ink-soft">
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
                className="btn btn-secondary shrink-0 px-3 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <ActionCard
                href={hrefFor("accounts")}
                title="Accounts only"
                blurb="Prepare Companies House annual accounts for this company without filing CT600 here."
                onNavigate={() => setOpen(false)}
              />
              <ActionCard
                href={hrefFor("ct600")}
                title="CT600 only"
                blurb="Prepare and submit the CT600 to HMRC for this company without filing accounts here."
                onNavigate={() => setOpen(false)}
              />
              <ActionCard
                href={hrefFor("both")}
                title="File both"
                blurb="Prepare CT600 and Companies House accounts together for this year-end period."
                primary
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
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
      <div className="space-y-3">
        <ActionCard
          href={hrefFor("accounts")}
          title="Accounts only"
          blurb="Prepare Companies House annual accounts for this company without filing CT600 here."
          onNavigate={() => undefined}
        />
        <ActionCard
          href={hrefFor("ct600")}
          title="CT600 only"
          blurb="Prepare and submit the CT600 to HMRC for this company without filing accounts here."
          onNavigate={() => undefined}
        />
        <ActionCard
          href={hrefFor("both")}
          title="File both"
          blurb="Prepare CT600 and Companies House accounts together for this year-end period."
          primary
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
      className={`block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
        primary
          ? "border-sea/40 bg-sea/5 hover:border-sea"
          : "border-line bg-white hover:border-sea/50"
      }`}
    >
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
      <span
        className={`mt-3 inline-flex text-sm font-semibold ${
          primary ? "text-sea" : "text-ink-soft"
        }`}
      >
        Continue →
      </span>
    </Link>
  );
}
