"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  submitSupportTicket,
  type SupportTicketState,
} from "@/server/actions/support-ticket";

const initial: SupportTicketState | null = null;

const MODULES = [
  "Corporation Tax",
  "Accounts",
  "VAT",
  "Payroll",
  "Self Assessment",
  "Companies House",
  "Bank",
  "Other",
];

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
  defaultName,
  defaultEmail,
}: {
  pageUrl: string;
  onClose: () => void;
  defaultName?: string | null;
  defaultEmail?: string | null;
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
      className="max-h-[min(92dvh,44rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-xl"
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
            New ticket
          </h2>
          <p id={descId} className="mt-1 text-sm text-ink-soft">
            Brief description, error text, steps tried, and optional screenshot
            or Loom link.
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

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-ink">
        Include what you expected vs what happened, any error message, and how
        urgent it is.
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
          className="mt-4 grid gap-3 sm:grid-cols-2"
          encType="multipart/form-data"
        >
          <input type="hidden" name="pageUrl" value={pageUrl} />

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Subject*
            <input
              name="subject"
              required
              minLength={3}
              className="input mt-1.5 w-full font-normal"
              placeholder="e.g. Cannot email year-end accounts"
            />
          </label>

          <label className="block text-sm font-semibold text-ink">
            Name
            <input
              name="name"
              className="input mt-1.5 w-full font-normal"
              defaultValue={defaultName ?? ""}
              readOnly={Boolean(defaultName)}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Email*
            <input
              name="email"
              type="email"
              className="input mt-1.5 w-full font-normal"
              defaultValue={defaultEmail ?? ""}
              readOnly={Boolean(defaultEmail)}
            />
          </label>

          <label className="block text-sm font-semibold text-ink">
            Help topic
            <select name="helpTopic" className="input mt-1.5 w-full font-normal">
              <option value="Support">Support</option>
              <option value="Bug">Bug</option>
              <option value="How-to">How-to</option>
              <option value="Billing">Billing</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-ink">
            Module
            <select name="module" className="input mt-1.5 w-full font-normal">
              {MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Message*
            <textarea
              name="description"
              required
              minLength={10}
              rows={5}
              className="input mt-1.5 min-h-[7rem] w-full resize-y font-normal"
              placeholder="What went wrong, steps to reproduce, and any error text…"
            />
          </label>

          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Attachments (optional)
            <input
              ref={fileRef}
              name="screenshot"
              type="file"
              accept=".doc,.docx,.pdf,.jpg,.png,.jpeg,.txt,.xls,.xlsx,.csv,image/png,image/jpeg,image/webp,image/gif"
              className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border file:border-line file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:border-sea"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            <span className="mt-1 block text-xs font-normal text-ink-soft">
              .doc, .docx, .pdf, .jpg, .png, .jpeg, .txt, .xls, .xlsx, .csv
            </span>
          </label>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Attachment preview"
              className="max-h-40 w-full rounded-lg border border-line bg-sand object-contain sm:col-span-2"
            />
          ) : null}

          {state && !state.ok ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger sm:col-span-2"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary text-sm disabled:opacity-60"
            >
              {pending ? "Sending…" : "Submit"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
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
  userEmail,
  userName,
}: {
  variant?: "header" | "menu";
  userEmail?: string | null;
  userName?: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [pageUrl, setPageUrl] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    setPageUrl(window.location.href);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDialogOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [dialogOpen]);

  function openDialog() {
    setMenuOpen(false);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  const triggerClass =
    variant === "menu"
      ? "inline-flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-ink hover:bg-sand"
      : "inline-flex items-center gap-1.5 self-center rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-semibold leading-none text-ink-soft hover:border-sea hover:text-sea";

  const modal =
    dialogOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDialogOpen(false);
            }}
          >
            <TicketDialogBody
              key={dialogKey}
              pageUrl={pageUrl}
              onClose={() => setDialogOpen(false)}
              defaultEmail={userEmail}
              defaultName={userName}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className={triggerClass}
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <TicketIcon className="h-4 w-4 shrink-0" />
        Tickets
        <span className="opacity-60" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className={
            variant === "menu"
              ? "mt-1 space-y-1 rounded-lg border border-line bg-white p-2 shadow-md"
              : "absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg"
          }
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sand"
            onClick={openDialog}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sea text-white">
              <TicketIcon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                New ticket
              </span>
              <span className="block text-xs text-ink-soft">
                Create new ticket
              </span>
            </span>
          </button>
          <Link
            href="/settings/tickets"
            role="menuitem"
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sand"
            onClick={() => setMenuOpen(false)}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sea/15 text-sea">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                View tickets
              </span>
              <span className="block text-xs text-ink-soft">
                View all tickets
              </span>
            </span>
          </Link>
        </div>
      ) : null}
      {modal}
    </div>
  );
}
