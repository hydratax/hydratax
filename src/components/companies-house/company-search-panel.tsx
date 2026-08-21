"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type SearchItem = {
  company_number: string;
  title: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  address_snippet?: string;
};

export function CompanySearchPanel({
  heading = "Companies House search",
  description,
  variant = "card",
  /**
   * Where selecting a company goes.
   * - `hub` (default): /companies-house/company/[number]
   * - `accounts`: /companies-house/accounts-ixbrl?company=[number]
   */
  selectTarget = "hub",
}: {
  heading?: string;
  description?: string | null;
  /** `hero` — bare search on dark background; `card` — panel chrome */
  variant?: "card" | "hero";
  selectTarget?: "hub" | "accounts";
}) {
  const router = useRouter();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      setOpen(false);
      setSearching(false);
      setHint(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/companies-house/search?q=${encodeURIComponent(query)}`,
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
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function openCompany(number: string) {
    setOpen(false);
    setNavigating(true);
    setError(null);
    const href =
      selectTarget === "accounts"
        ? `/companies-house/accounts-ixbrl?company=${encodeURIComponent(number)}`
        : `/companies-house/company/${encodeURIComponent(number)}`;
    router.push(href);
  }

  const isHero = variant === "hero";
  const busy = searching || navigating;

  return (
    <div
      className={
        isHero
          ? "space-y-5 overflow-visible"
          : "panel space-y-4 overflow-visible p-5"
      }
    >
      <div>
        <h1
          className={
            isHero
              ? "display text-3xl text-white sm:text-4xl md:text-5xl"
              : "display text-2xl text-ink"
          }
        >
          {heading}
        </h1>
        {description !== null && description !== undefined && (
          <p
            className={
              isHero
                ? "mt-2 text-sm text-white/65"
                : "mt-1 text-sm text-ink-soft"
            }
          >
            {description}
          </p>
        )}
        {!isHero && description === undefined && (
          <p className="mt-1 text-sm text-ink-soft">
            Start typing a company name — pick from the list to open the profile.
          </p>
        )}
      </div>

      <div className="relative" ref={wrapRef}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (items.length > 0 || hint) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && items[0]) {
              e.preventDefault();
              openCompany(items[0].company_number);
            }
          }}
          placeholder="Company name or number…"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          className={
            isHero
              ? "w-full rounded-xl border border-white/20 bg-white px-4 py-3.5 pr-28 text-base text-ink shadow-lg"
              : "w-full rounded-lg border border-line px-3 py-2.5 pr-24 text-sm"
          }
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-soft">
          {busy ? "Opening…" : "Companies House"}
        </span>

        {open && (searching || items.length > 0 || hint) && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
          >
            {searching && items.length === 0 && !hint && (
              <li className="px-4 py-3 text-sm text-ink-soft">
                Searching Companies House…
              </li>
            )}
            {hint && items.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-soft">{hint}</li>
            )}
            {items.map((item) => (
              <li key={item.company_number} role="option">
                <button
                  type="button"
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-sea/5"
                  onClick={() => openCompany(item.company_number)}
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
      </div>

      <FormErrorBanner
        error={error}
        className={isHero ? "border-red-300 bg-red-950/40 text-red-100" : undefined}
      />
    </div>
  );
}
