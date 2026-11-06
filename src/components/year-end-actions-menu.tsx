"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { downloadCt600Draft } from "@/server/actions/ct600";

export type YearEndFiledContext = {
  clientId: string;
  /** CT600 draft/return for the filed period — required for downloads */
  returnId: string;
  periodStart: string;
  periodEnd: string;
  companyNumber?: string | null;
};

type DraftFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

function saveFiles(files: DraftFile[]) {
  for (const file of files) {
    const bin = atob(file.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Action sheet for a year-end that is already filed:
 * download CT600, accounts, computation, or start an amended return.
 */
export function YearEndFiledActionsMenu({
  filed,
  className,
  label = "Filed actions",
}: {
  filed: YearEndFiledContext;
  className?: string;
  label?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  const amendHref = `/clients/${encodeURIComponent(filed.clientId)}/year-end?mode=both${
    filed.companyNumber
      ? `&company=${encodeURIComponent(filed.companyNumber)}`
      : ""
  }&start=${encodeURIComponent(filed.periodStart)}&end=${encodeURIComponent(filed.periodEnd)}&amend=1`;

  function download(kind: "ct600" | "accounts" | "computation") {
    setError(null);
    start(async () => {
      try {
        const pack = await downloadCt600Draft(
          filed.returnId,
          filed.clientId,
          kind,
        );
        saveFiles(pack.files as DraftFile[]);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
      }
    });
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
              className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                    Already filed
                  </p>
                  <h2
                    id={titleId}
                    className="display mt-0.5 text-xl text-ink sm:text-2xl"
                  >
                    Year-end actions
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Period ending {filed.periodEnd}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 px-3 py-2 text-sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="space-y-1 px-2 py-2 sm:px-3 sm:py-3">
                <ActionButton
                  disabled={pending}
                  onClick={() => download("ct600")}
                  title="Download CT600"
                  blurb="Corporation Tax return PDF for this period."
                />
                <ActionButton
                  disabled={pending}
                  onClick={() => download("accounts")}
                  title="Download Year End Accounts"
                  blurb="Statutory accounts pack for Companies House."
                />
                <ActionButton
                  disabled={pending}
                  onClick={() => download("computation")}
                  title="Download CT Computation"
                  blurb="Tax computation supporting the CT600."
                />
                <Link
                  href={amendHref}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl border border-line px-3.5 py-3 transition hover:border-sea/50 hover:bg-sea/5"
                >
                  <p className="font-semibold text-ink">
                    Submit amended return
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-ink-soft">
                    Open year-end again to correct and re-file.
                  </p>
                </Link>
                {error && (
                  <p className="px-2 py-2 text-sm text-danger">{error}</p>
                )}
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
        {pending ? "Preparing…" : label}
        <span className="ml-1.5 opacity-80" aria-hidden>
          ▾
        </span>
      </button>
      {sheet}
    </>
  );
}

function ActionButton({
  title,
  blurb,
  onClick,
  disabled,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full rounded-xl border border-line bg-white px-3.5 py-3 text-left transition hover:border-sea/50 hover:shadow-md disabled:opacity-50"
    >
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-sm leading-snug text-ink-soft">{blurb}</p>
    </button>
  );
}
