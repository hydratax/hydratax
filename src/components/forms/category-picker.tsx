"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BANK_CATEGORIES,
  CATEGORY_LABELS,
  buildCategoryLabelMap,
  isCustomCategoryId,
} from "@/lib/bank-categories";
import {
  createCustomBankCategory,
  type CustomCategoryRow,
} from "@/server/actions/custom-categories";

type Props = {
  value: string;
  onChange: (category: string) => void;
  customCategories: CustomCategoryRow[];
  onCustomAdded?: (row: CustomCategoryRow) => void;
  clientId?: string;
  disabled?: boolean;
  compact?: boolean;
};

type PanelPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

export function CategoryPicker({
  value,
  onChange,
  customCategories,
  onCustomAdded,
  clientId,
  disabled,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const labelMap = useMemo(
    () => buildCategoryLabelMap(customCategories),
    [customCategories],
  );

  const displayLabel = labelMap[value] ?? value;

  const builtInOptions = useMemo(
    () =>
      BANK_CATEGORIES.map((id) => ({
        id,
        label: CATEGORY_LABELS[id],
        group: "standard" as const,
      })),
    [],
  );

  const customOptions = useMemo(
    () =>
      customCategories.map((c) => ({
        id: `custom:${c.id}`,
        label: c.label,
        group: "custom" as const,
      })),
    [customCategories],
  );

  const allOptions = useMemo(
    () => [...builtInOptions, ...customOptions],
    [builtInOptions, customOptions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [allOptions, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setAdding(false);
    setNewLabel("");
    setError(null);
    setPos(null);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const preferredWidth = Math.min(Math.max(rect.width, 280), 360);
    const left = Math.min(
      Math.max(8, rect.right - preferredWidth),
      window.innerWidth - preferredWidth - 8,
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      220,
      Math.min(420, openUp ? spaceAbove : spaceBelow),
    );
    setPos({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left,
      width: preferredWidth,
      maxHeight,
      openUp,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, adding]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    // Capture scroll from any overflow ancestor (table sections).
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (adding) addInputRef.current?.focus();
      else searchRef.current?.focus();
    });
  }, [open, adding]);

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createCustomBankCategory({ label, clientId });
      if (!result.ok) {
        setError(result.error || "Could not save category.");
        return;
      }
      const row = {
        id: result.id.slice("custom:".length),
        label: result.label,
      };
      onCustomAdded?.(row);
      onChange(result.id);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category.");
    } finally {
      setBusy(false);
    }
  }

  const panel =
    open && mounted && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="category-picker-panel fixed z-[200] flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl"
            style={{
              top: pos.openUp ? undefined : pos.top,
              bottom: pos.openUp
                ? window.innerHeight - pos.top
                : undefined,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
            role="presentation"
          >
            <div className="shrink-0 border-b border-zinc-100 p-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories…"
                className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/40"
              />
            </div>

            <ul
              role="listbox"
              className="category-picker-list min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 text-sm"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-zinc-500">
                  No matches
                  {query.trim() ? " — add a custom category below" : ""}
                </li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === opt.id}
                      onClick={() => {
                        onChange(opt.id);
                        close();
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left hover:bg-zinc-50 ${
                        value === opt.id ? "bg-zinc-100 font-medium" : ""
                      } ${opt.group === "custom" ? "text-violet-900" : ""}`}
                    >
                      {opt.label}
                      {opt.group === "custom" ? (
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-violet-400">
                          custom
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="shrink-0 border-t border-zinc-100 p-2">
              {adding ? (
                <div className="flex flex-col gap-2">
                  <input
                    ref={addInputRef}
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="New category name"
                    maxLength={80}
                    className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreate();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setAdding(false);
                        setError(null);
                      }
                    }}
                  />
                  {error ? (
                    <p className="text-xs text-danger">{error}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !newLabel.trim()}
                      onClick={() => void handleCreate()}
                      className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setNewLabel("");
                        setError(null);
                      }}
                      className="rounded-md px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAdding(true);
                    setNewLabel(query.trim());
                    setError(null);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-violet-700 hover:bg-violet-50"
                >
                  <span className="text-lg leading-none">+</span>
                  Add custom category
                  {query.trim() ? (
                    <span className="truncate text-violet-500">
                      “{query.trim()}”
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="category-picker relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else setOpen(true);
        }}
        className={`category-picker-trigger flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm shadow-sm transition hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 disabled:opacity-50 ${
          compact ? "max-w-[200px]" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {panel}
    </div>
  );
}

export function isValidCategoryValue(
  value: string,
  customCategories: CustomCategoryRow[],
): boolean {
  if (isCustomCategoryId(value)) {
    const uuid = value.slice("custom:".length);
    return customCategories.some((c) => c.id === uuid);
  }
  return (BANK_CATEGORIES as readonly string[]).includes(value);
}
