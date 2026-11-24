"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createCt600Amendment,
  downloadCt600Draft,
} from "@/server/actions/ct600";
import { emailClientArtifact } from "@/server/actions/email-artifacts";

export type YearEndFiledContext = {
  clientId: string;
  /** CT600 draft/return for the filed period — required for downloads */
  returnId: string;
  periodStart: string;
  periodEnd: string;
  companyNumber?: string | null;
  /** Client contact email for the Email action */
  contactEmail?: string | null;
  companyName?: string | null;
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
 * download CT600, accounts, computation, email pack, or start an amended return.
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
  const companyLabel = filed.companyName?.trim() || "your company";
  const defaultSubject = `Year-end pack — ${companyLabel} (to ${filed.periodEnd})`;
  const defaultBody = `Please find attached the Corporation Tax return, accounts and computation for the period ending ${filed.periodEnd}.\n\nKind regards`;

  const [open, setOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [toEmail, setToEmail] = useState(filed.contactEmail ?? "");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (emailOpen) setEmailOpen(false);
        else setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, emailOpen]);

  useEffect(() => {
    if (!open) return;
    setToEmail(filed.contactEmail ?? "");
    setSubject(defaultSubject);
    setBody(defaultBody);
    setEmailOpen(false);
  }, [open, filed.contactEmail, defaultSubject, defaultBody]);

  function amendReturn() {
    start(async () => {
      try {
        const res = await createCt600Amendment({
          clientId: filed.clientId,
          sourceReturnId: filed.returnId,
        });
        if (!res.ok) return;
        setOpen(false);
        const qs = new URLSearchParams({
          mode: "both",
          start: res.periodStart,
          end: res.periodEnd,
          returnId: res.returnId,
          ar: String(res.amendmentIndex),
        });
        if (filed.companyNumber) qs.set("company", filed.companyNumber);
        router.push(
          `/clients/${encodeURIComponent(filed.clientId)}/year-end?${qs.toString()}`,
        );
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  function download(kind: "ct600" | "accounts" | "computation") {
    start(async () => {
      try {
        const pack = await downloadCt600Draft(
          filed.returnId,
          filed.clientId,
          kind,
        );
        saveFiles(pack.files as DraftFile[]);
        setOpen(false);
      } catch {
        /* freeze */
      }
    });
  }

  function sendEmail() {
    const to = toEmail.trim();
    const subj = subject.trim();
    const msg = body.trim();
    if (!to || !subj || !msg) return;
    start(async () => {
      try {
        await emailClientArtifact({
          clientId: filed.clientId,
          toEmail: to,
          subject: subj,
          message: msg,
          artifact: {
            type: "ct_pack",
            returnId: filed.returnId,
            kind: "both",
          },
        });
        setEmailOpen(false);
        setOpen(false);
      } catch {
        /* freeze */
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
              className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
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

              <div className="space-y-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3">
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
                {!emailOpen ? (
                  <ActionButton
                    disabled={pending}
                    onClick={() => setEmailOpen(true)}
                    title="Email year-end pack"
                    blurb="Review and edit the email before sending."
                  />
                ) : (
                  <div className="rounded-xl border border-line px-3.5 py-3">
                    <p className="font-semibold text-ink">Email year-end pack</p>
                    <label className="mt-2 block text-xs text-ink-soft">
                      Client email
                      <input
                        type="email"
                        className="input mt-1 w-full text-sm"
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        placeholder="client@example.com"
                        autoFocus
                      />
                    </label>
                    <label className="mt-2 block text-xs text-ink-soft">
                      Subject
                      <input
                        type="text"
                        className="input mt-1 w-full text-sm"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </label>
                    <label className="mt-2 block text-xs text-ink-soft">
                      Message
                      <textarea
                        className="input mt-1 min-h-[8rem] w-full resize-y text-sm"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <p className="mt-1.5 text-[0.7rem] text-ink-soft">
                      CT600, accounts and computation PDFs are attached
                      automatically.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary text-xs"
                        disabled={
                          pending ||
                          !toEmail.trim() ||
                          !subject.trim() ||
                          !body.trim()
                        }
                        onClick={sendEmail}
                      >
                        {pending ? "Sending…" : "Send"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={pending}
                        onClick={() => setEmailOpen(false)}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
                <ActionButton
                  disabled={pending}
                  onClick={amendReturn}
                  title="Amend Return"
                  blurb="Create an editable AR copy of this period’s CT600 and accounts (AR1–AR5)."
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
