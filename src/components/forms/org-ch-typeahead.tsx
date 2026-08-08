"use client";

import { useEffect, useId, useRef, useState } from "react";

type SearchItem = {
  company_number: string;
  title: string;
  company_status?: string;
  company_type?: string;
  address_snippet?: string;
};

export function OrgChTypeahead({
  name = "orgSearch",
  placeholder,
  required,
  enabled,
}: {
  name?: string;
  placeholder: string;
  required?: boolean;
  /** When false, behaves as a plain text field (no CH lookup). */
  enabled: boolean;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setOpen(false);
      setHint(null);
      return;
    }

    const q = query.trim();
    if (q.length < 1) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      setHint(null);
      return;
    }

    // Don't re-search right after a pick
    if (selectedNumber && query.includes(selectedNumber)) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/companies-house/search?q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as {
          items?: SearchItem[];
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setItems([]);
          setHint(data.error ?? "Search failed");
          setOpen(true);
          return;
        }
        setItems(data.items ?? []);
        setHint(data.message ?? null);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setItems([]);
          setHint("Could not reach Companies House");
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, selectedNumber]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(item: SearchItem) {
    const label = `${item.title} (${item.company_number})`;
    setQuery(label);
    setSelectedNumber(item.company_number);
    setItems([]);
    setOpen(false);
    setHint(null);
  }

  return (
    <div className="relative mt-4" ref={wrapRef}>
      <span className="pointer-events-none absolute left-3 top-3.5 z-10 text-ink-soft">
        ⌕
      </span>
      <input
        name={name}
        value={query}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        role="combobox"
        className="w-full rounded-lg border border-line bg-white py-3 pl-9 pr-24 text-sm"
        placeholder={placeholder}
        required={required}
        onChange={(e) => {
          setSelectedNumber(null);
          setQuery(e.target.value);
        }}
        onFocus={() => {
          if (enabled && items.length > 0) setOpen(true);
        }}
      />
      {enabled && (
        <span className="pointer-events-none absolute right-3 top-3.5 text-xs font-semibold text-ink-soft">
          {loading ? "Searching…" : "Companies House"}
        </span>
      )}

      {enabled && open && (loading || items.length > 0 || hint) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {loading && items.length === 0 && !hint && (
            <li className="px-4 py-3 text-sm text-ink-soft">Searching Companies House…</li>
          )}
          {hint && items.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-soft">{hint}</li>
          )}
          {items.map((item) => (
            <li key={item.company_number} role="option">
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-sand"
                onClick={() => pick(item)}
              >
                <span className="font-semibold text-ink">{item.title}</span>
                <span className="mono text-xs text-ink-soft">
                  {item.company_number}
                  {item.company_status ? ` · ${item.company_status}` : ""}
                </span>
                {item.address_snippet && (
                  <span className="text-xs text-ink-soft">
                    {item.address_snippet}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {enabled && (
        <input type="hidden" name="companyNumber" value={selectedNumber ?? ""} />
      )}
    </div>
  );
}
