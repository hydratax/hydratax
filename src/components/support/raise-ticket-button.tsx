"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  submitSupportTicket,
  type SupportTicketState,
} from "@/server/actions/support-ticket";

const initial: SupportTicketState | null = null;

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
      <path d="M3 15v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      <path d="M3 9a2.5 2.5 0 0 0 0 6" />
      <path d="M21 9a2.5 2.5 0 0 1 0 6" />
      <path d="M9 7v10" strokeDasharray="2 3" />
    </svg>
  );
}

function TicketDialogBody({
  pageUrl,
  onClose,
}: {
  pageUrl: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [state, action, pending] = useActionState(submitSupportTicket, initial);
  const titleId = useId();
  const descId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [state]);

  function onFileChange(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="max-h-[min(92dvh,40rem)] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
            Support
          </p>
          <h2
            id={titleId}
            className="display mt-1 text-xl font-semibold text-ink"
          >
            Raise a ticket
          </h2>
          <p id={descId} className="mt-1 text-sm text-ink-soft">
            Attach a screenshot of the issue screen and a short description. We
            reply by email to you.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-lg leading-none text-ink-soft hover:bg-sand hover:text-ink"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {state?.ok ? (
        <div className="mt-4 space-y-4" role="status">
          <p className="rounded-lg border border-sea/25 bg-sea/5 px-3 py-3 text-sm text-ink">
            {state.message}
          </p>
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      ) : (
        <form
          action={action}
          className="mt-4 grid gap-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="pageUrl" value={pageUrl} />

          <label className="block text-sm font-semibold text-ink">
            What’s going wrong?
            <textarea
              name="description"
              required
              minLength={10}
              rows={4}
              className="input mt-1.5 min-h-[6.5rem] w-full resize-y font-normal"
              placeholder="e.g. Year-end save fails when I open the CT pack…"
            />
          </label>

          <label className="block text-sm font-semibold text-ink">
            Screenshot
            <input
              ref={fileRef}
              name="screenshot"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              required
              className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border file:border-line file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:border-sea"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Screenshot preview"
              className="max-h-40 w-full rounded-lg border border-line bg-sand object-contain"
            />
          ) : null}

          {state && !state.ok ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary text-sm disabled:opacity-60"
            >
              {pending ? "Sending…" : "Raise ticket"}
            </button>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function RaiseTicketButton({
  variant = "header",
}: {
  /** header = compact nav control; menu = full-width mobile row */
  variant?: "header" | "menu";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPageUrl(window.location.href);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function openDialog() {
    setDialogKey((k) => k + 1);
    setOpen(true);
  }

  const triggerClass =
    variant === "menu"
      ? "inline-flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-ink hover:bg-sand"
      : "inline-flex items-center gap-1.5 self-center rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-semibold leading-none text-ink-soft hover:border-sea hover:text-sea";

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <TicketDialogBody
              key={dialogKey}
              pageUrl={pageUrl}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        onClick={openDialog}
        aria-haspopup="dialog"
      >
        <TicketIcon className="h-4 w-4 shrink-0" />
        Raise ticket
      </button>
      {modal}
    </>
  );
}
