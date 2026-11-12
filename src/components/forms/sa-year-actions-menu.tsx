"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  yearLabel: string;
  pending?: boolean;
  showUploadReturn?: boolean;
  showUploadSa302?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadReturn: () => void;
  onUploadSa302: () => void;
};

/**
 * Compact actions menu for one SA tax-year row (Edit / uploads / Delete).
 * Menu is portalled so sibling year cards cannot clip it.
 */
export function SaYearActionsMenu({
  yearLabel,
  pending,
  showUploadReturn,
  showUploadSa302,
  onEdit,
  onDelete,
  onUploadReturn,
  onUploadSa302,
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
      const width = 248;
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

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${yearLabel}`}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[200] w-[15.5rem] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-black/5"
          >
            <div className="border-b border-line bg-sand/40 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sea">
                Tax year
              </p>
              <p className="display text-lg leading-tight text-ink">
                {yearLabel}
              </p>
            </div>

            <div className="p-1.5">
              <MenuItem
                title="Edit"
                blurb="Open the SA100 desk for this year"
                onClick={() => run(onEdit)}
              />
              {showUploadReturn ? (
                <MenuItem
                  title="Upload SA100"
                  blurb="Attach a submitted SA100 PDF"
                  onClick={() => run(onUploadReturn)}
                />
              ) : null}
              {showUploadSa302 ? (
                <MenuItem
                  title="Upload SA302"
                  blurb="Attach the tax calculation"
                  onClick={() => run(onUploadSa302)}
                />
              ) : null}
            </div>

            <div className="border-t border-line p-1.5">
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => run(onDelete)}
                className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-red-50 disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-danger">Delete</span>
                <span className="mt-0.5 text-xs leading-snug text-ink-soft">
                  Remove this year from the list
                </span>
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-sea/40 hover:bg-sea/5 hover:text-sea disabled:opacity-50 ${
          open ? "border-sea/50 bg-sea/5 text-sea" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        Actions
        <span
          className={`text-[10px] opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {menu}
    </>
  );
}

function MenuItem({
  title,
  blurb,
  onClick,
}: {
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-sea/5"
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="mt-0.5 text-xs leading-snug text-ink-soft">{blurb}</span>
    </button>
  );
}
