"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  previewHref: string;
  downloadHref: string;
  pending?: boolean;
  canEmail?: boolean;
  canMarkSent?: boolean;
  canMarkPaid?: boolean;
  canVoid?: boolean;
  onEmail: () => void;
  onMarkSent: () => void;
  onMarkPaid: () => void;
  onVoid: () => void;
};

/**
 * Single closed dropdown for invoice row actions
 * (preview, PDF, email, status).
 */
export function InvoiceRowActionsMenu({
  previewHref,
  downloadHref,
  pending,
  canEmail = true,
  canMarkSent = false,
  canMarkPaid = false,
  canVoid = false,
  onEmail,
  onMarkSent,
  onMarkPaid,
  onVoid,
}: Props) {
  const menuId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const width = 220;
      const left = Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      );
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const itemClass =
    "block w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-sea/5 disabled:opacity-50";

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="btn btn-secondary px-3 py-1.5 text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        Actions ▾
      </button>
      {mounted && open && pos
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="fixed z-[80] w-[220px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
              style={{ top: pos.top, left: pos.left }}
            >
              <a
                role="menuitem"
                href={downloadHref}
                target="_blank"
                rel="noreferrer"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                Download PDF
              </a>
              <Link
                role="menuitem"
                href={previewHref}
                target="_blank"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                Preview
              </Link>
              {canEmail ? (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  disabled={pending}
                  onClick={() => run(onEmail)}
                >
                  Email
                </button>
              ) : null}
              {canMarkSent ? (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  disabled={pending}
                  onClick={() => run(onMarkSent)}
                >
                  Mark sent
                </button>
              ) : null}
              {canMarkPaid ? (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  disabled={pending}
                  onClick={() => run(onMarkPaid)}
                >
                  Mark paid
                </button>
              ) : null}
              {canVoid ? (
                <button
                  type="button"
                  role="menuitem"
                  className={`${itemClass} text-danger`}
                  disabled={pending}
                  onClick={() => run(onVoid)}
                >
                  Void
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
