"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BANK_CATEGORIES,
  CATEGORY_LABELS,
  type BankCategory,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const result = await createCustomBankCategory({ label, clientId });
      if (!result.ok) return;
      const row = { id: result.id.slice("custom:".length), label: result.label };
      onCustomAdded?.(row);
      onChange(result.id);
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="category-picker relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
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

      {open ? (
        <div className="category-picker-panel absolute right-0 z-50 mt-1 flex w-[min(100vw-2rem,320px)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 p-2">
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
            className="category-picker-list max-h-56 overflow-y-auto overscroll-contain py-1 text-sm"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-zinc-500">No matches</li>
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

          <div className="border-t border-zinc-100 p-2">
            {adding ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="New category name"
                  maxLength={80}
                  className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                    if (e.key === "Escape") setAdding(false);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !newLabel.trim()}
                    onClick={() => void handleCreate()}
                    className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewLabel("");
                    }}
                    className="rounded-md px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-violet-700 hover:bg-violet-50"
              >
                <span className="text-lg leading-none">+</span>
                Add custom category
              </button>
            )}
          </div>
        </div>
      ) : null}
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
