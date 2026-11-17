"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { emailClientArtifact } from "@/server/actions/email-artifacts";

export type SaTaxYearActionsContext = {
  clientId: string;
  clientName: string;
  contactEmail?: string | null;
  taxYearLabel: string;
  /** Status badge line, e.g. Submitted / Due soon */
  statusLabel?: string | null;
  /** Stored SA100 return id (desk draft), if any */
  returnId?: string | null;
  /** Uploaded document ids for filed PDFs */
  sa100DocumentId?: string | null;
  sa302DocumentId?: string | null;
};

function defaultSaSubject(clientName: string, taxYear: string) {
  return `SA100 & SA302 — ${clientName} (${taxYear})`;
}

function defaultSaMessage(taxYear: string) {
  return `Please find attached your Self Assessment return (SA100) and tax calculation (SA302) for ${taxYear}.\n\nKind regards`;
}

/**
 * Popup actions for one Self Assessment tax year — same sheet style as year-end.
 */
export function SaTaxYearActionsMenu({
  ctx,
  onOpenReturn,
  onUploadSa100,
  onUploadSa302,
  onDelete,
  className,
  label = "Actions",
}: {
  ctx: SaTaxYearActionsContext;
  onOpenReturn: () => void;
  onUploadSa100: () => void;
  onUploadSa302: () => void;
  onDelete: () => void;
  className?: string;
  label?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [toEmail, setToEmail] = useState(ctx.contactEmail ?? "");
  const [subject, setSubject] = useState(
    defaultSaSubject(ctx.clientName, ctx.taxYearLabel),
  );
  const [body, setBody] = useState(defaultSaMessage(ctx.taxYearLabel));
  const [mounted, setMounted] = useState(false);
  const [pending, start] = useTransition();

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
    setToEmail(ctx.contactEmail ?? "");
    setSubject(defaultSaSubject(ctx.clientName, ctx.taxYearLabel));
    setBody(defaultSaMessage(ctx.taxYearLabel));
    setEmailOpen(false);
  }, [open, ctx.contactEmail, ctx.clientName, ctx.taxYearLabel]);

  const canEmailUploaded = Boolean(
    ctx.sa100DocumentId || ctx.sa302DocumentId,
  );
  const canEmailDraft = Boolean(
    ctx.returnId && !String(ctx.returnId).startsWith("doc-"),
  );
  const canEmail = canEmailUploaded || canEmailDraft;

  function sendEmail() {
    const to = toEmail.trim();
    const subj = subject.trim();
    const msg = body.trim();
    if (!to || !subj || !msg || !canEmail) return;
    start(async () => {
      try {
        if (canEmailUploaded) {
          const documentIds = [
            ...(ctx.sa100DocumentId
              ? [
                  {
                    kind: "sa100" as const,
                    documentId: ctx.sa100DocumentId,
                  },
                ]
              : []),
            ...(ctx.sa302DocumentId
              ? [
                  {
                    kind: "sa302" as const,
                    documentId: ctx.sa302DocumentId,
                  },
                ]
              : []),
          ];
          await emailClientArtifact({
            clientId: ctx.clientId,
            toEmail: to,
            subject: subj,
            message: msg,
            artifact: {
              type: "sa_filed_pdfs",
              taxYear: ctx.taxYearLabel,
              documentIds,
            },
          });
        } else if (ctx.returnId) {
          await emailClientArtifact({
            clientId: ctx.clientId,
            toEmail: to,
            subject: subj,
            message: msg,
            artifact: {
              type: "sa_pdf",
              returnId: ctx.returnId,
              docs: ["sa100", "sa302"],
            },
          });
        }
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
                  {ctx.statusLabel ? (
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                      {ctx.statusLabel}
                    </p>
                  ) : null}
                  <h2
                    id={titleId}
                    className="display mt-0.5 text-xl text-ink sm:text-2xl"
                  >
                    Self Assessment actions
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Tax year {ctx.taxYearLabel}
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
                  onClick={() => {
                    setOpen(false);
                    onOpenReturn();
                  }}
                  title="Open return"
                  blurb="Continue or review the SA100 for this tax year."
                />
                <ActionButton
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    onUploadSa100();
                  }}
                  title="Upload SA100"
                  blurb="Attach the filed Self Assessment return PDF."
                />
                <ActionButton
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    onUploadSa302();
                  }}
                  title="Upload SA302"
                  blurb="Attach the tax calculation PDF."
                />
                {canEmail ? (
                  !emailOpen ? (
                    <ActionButton
                      disabled={pending}
                      onClick={() => setEmailOpen(true)}
                      title="Email SA100 & SA302"
                      blurb="Review and edit the email before sending."
                    />
                  ) : (
                    <div className="rounded-xl border border-line px-3.5 py-3">
                      <p className="font-semibold text-ink">
                        Email SA100 &amp; SA302
                      </p>
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
                        SA100 and SA302 PDFs are attached automatically.
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
                  )
                ) : (
                  <ActionButton
                    disabled
                    onClick={() => undefined}
                    title="Email SA100 & SA302"
                    blurb="Upload SA100/SA302 or save a return to email."
                  />
                )}
                <ActionButton
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                  title="Delete"
                  blurb="Remove this tax year draft or uploads from the desk."
                  danger
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
          className ??
          "border-l border-sea/30 px-2.5 py-2 text-sea hover:bg-sea/5"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Actions for ${ctx.taxYearLabel}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {label === "▾" ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden
            className="mx-auto"
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          label
        )}
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
  danger,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-50 ${
        danger
          ? "border-line bg-white hover:border-danger/40 hover:bg-danger/5"
          : "border-line bg-white hover:border-sea/50 hover:shadow-md"
      }`}
    >
      <p
        className={`font-semibold ${danger ? "text-red-700" : "text-ink"}`}
      >
        {title}
      </p>
      <p className="mt-0.5 text-sm leading-snug text-ink-soft">{blurb}</p>
    </button>
  );
}
