"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  WORKSPACE_CATEGORY_SECTIONS,
  buildCategoryLabelMap,
  isCustomCategoryId,
  resolveCategoryLabel,
} from "@/lib/bank-categories";
import {
  updateBankCategoriesBulk,
  updateBankCategory,
} from "@/server/actions/bank";
import {
  CategoryPicker,
} from "@/components/forms/category-picker";
import type { CustomCategoryRow } from "@/server/actions/custom-categories";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

const PREVIEW_LIMIT = 25;
const ALL_CATEGORIES = "__all__";

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function categorySections(
  transactions: Tx[],
  labelMap: Record<string, string>,
): string[] {
  const extra: string[] = [];
  const seen = new Set<string>(WORKSPACE_CATEGORY_SECTIONS);
  for (const tx of transactions) {
    const key = tx.category || "uncategorised";
    if (!seen.has(key)) {
      extra.push(key);
      seen.add(key);
    }
  }
  const customKeys = Object.keys(labelMap)
    .filter(isCustomCategoryId)
    .filter((k) => !seen.has(k));
  return [...WORKSPACE_CATEGORY_SECTIONS, ...extra, ...customKeys];
}

function sectionLabel(category: string, custom: CustomCategoryRow[]) {
  return resolveCategoryLabel(category, custom);
}

export function BankCategorisedView({
  clientId,
  transactions,
  customCategories: initialCustom,
}: {
  clientId: string;
  transactions: Tx[];
  customCategories: CustomCategoryRow[];
}) {
  const router = useRouter();
  const [customCategories, setCustomCategories] =
    useState<CustomCategoryRow[]>(initialCustom);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [filterCategory, setFilterCategory] = useState<string>(ALL_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState("expense_queries");
  const [pending, start] = useTransition();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  const labelMap = useMemo(
    () => buildCategoryLabelMap(customCategories),
    [customCategories],
  );

  const selectedCount = selectedIds.size;
  const searchTrimmed = searchQuery.trim().toLowerCase();
  const isSearching = searchTrimmed.length > 0;

  const searchMatches = useMemo(() => {
    if (!isSearching) return [];
    return transactions
      .filter((t) => t.description.toLowerCase().includes(searchTrimmed))
      .sort((a, b) => b.dated.localeCompare(a.dated));
  }, [transactions, searchTrimmed, isSearching]);

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSectionSelected(rows: Tx[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllSearchMatches() {
    setSelectedIds(new Set(searchMatches.map((t) => t.id)));
  }

  function applyBulkMove() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    start(async () => {
      await updateBankCategoriesBulk(ids, bulkCategory);
      clearSelection();
      router.refresh();
    });
  }

  function onCategoryChange(txId: string, category: string) {
    start(async () => {
      await updateBankCategory(txId, category);
      router.refresh();
    });
  }

  const sections = useMemo(
    () => categorySections(transactions, labelMap),
    [transactions, labelMap],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const tx of transactions) {
      const key = tx.category || "uncategorised";
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.dated.localeCompare(a.dated));
    }
    return map;
  }, [transactions]);

  const summary = useMemo(() => {
    const income = transactions
      .filter((t) => t.amountPence > 0)
      .reduce((s, t) => s + t.amountPence, 0);
    const expenses = transactions
      .filter((t) => t.amountPence < 0)
      .reduce((s, t) => s + Math.abs(t.amountPence), 0);
    return { income, expenses, count: transactions.length };
  }, [transactions]);

  useEffect(() => {
    setCustomCategories(initialCustom);
  }, [initialCustom]);

  useEffect(() => {
    if (filterCategory === ALL_CATEGORIES) return;
    setOpenSections((prev) => ({ ...prev, [filterCategory]: true }));
    sectionRefs.current[filterCategory]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [filterCategory]);

  const visibleSections = useMemo(() => {
    if (filterCategory === ALL_CATEGORIES) return sections;
    return sections.filter((c) => c === filterCategory);
  }, [sections, filterCategory]);

  const searchSelectedCount = searchMatches.filter((t) =>
    selectedIds.has(t.id),
  ).length;
  const allSearchSelected =
    searchMatches.length > 0 && searchSelectedCount === searchMatches.length;
  const someSearchSelected =
    searchSelectedCount > 0 && !allSearchSelected;

  const tableHead = (
    <thead className="text-xs uppercase text-ink-soft">
      <tr>
        <th className="w-10 px-3 py-2" />
        <th className="w-[6.5rem] px-3 py-2">Date</th>
        <th className="min-w-0 px-3 py-2">Description</th>
        <th className="w-[7.5rem] px-3 py-2 text-right">Amount</th>
        <th className="w-[14rem] px-3 py-2">Category</th>
      </tr>
    </thead>
  );

  function renderRow(t: Tx, showCurrentCategory = false) {
    const isSelected = selectedIds.has(t.id);
    return (
      <tr
        key={t.id}
        className={`group ${isSelected ? "bg-sea/5" : "hover:bg-sand/30"}`}
      >
        <td className="px-3 py-2 align-middle">
          <input
            type="checkbox"
            className="size-4 rounded border-line"
            checked={isSelected}
            aria-label={`Select ${t.description}`}
            onChange={(e) => toggleSelected(t.id, e.target.checked)}
          />
        </td>
        <td className="figures px-3 py-2 align-middle whitespace-nowrap text-ink-soft">
          {t.dated}
        </td>
        <td
          className="max-w-0 truncate px-3 py-2 align-middle"
          title={t.description}
        >
          {t.description}
        </td>
        <td
          className={`figures px-3 py-2 text-right align-middle tabular-nums ${
            t.amountPence >= 0 ? "text-ok" : "text-ink"
          }`}
        >
          {gbp(t.amountPence)}
        </td>
        <td className="px-3 py-2 align-middle">
          <div className="flex min-w-0 items-center gap-2">
            {showCurrentCategory ? (
              <span className="hidden shrink-0 text-xs text-ink-soft sm:inline">
                {sectionLabel(t.category, customCategories)}
              </span>
            ) : null}
            <CategoryPicker
              value={t.category}
              disabled={pending}
              clientId={clientId}
              customCategories={customCategories}
              onCustomAdded={(row) =>
                setCustomCategories((prev) =>
                  prev.some((c) => c.id === row.id)
                    ? prev
                    : [...prev, row].sort((a, b) =>
                        a.label.localeCompare(b.label),
                      ),
                )
              }
              onChange={(cat) => onCategoryChange(t.id, cat)}
            />
            {t.confidence !== "high" ? (
              <span
                className="hidden shrink-0 text-[10px] text-ink-soft lg:inline"
                title="Auto-categorisation confidence"
              >
                {t.confidence}
              </span>
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  if (!transactions.length) {
    return (
      <p className="p-6 text-sm text-ink-soft">
        No bank lines yet. Upload a CSV or Excel export — transactions will appear
        here grouped by category (fuel, insurance, salaries, etc.).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 border-b border-line bg-sand/40 px-4 py-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Lines</p>
          <p className="figures text-lg font-semibold text-ink">
            {summary.count}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Money in</p>
          <p className="figures text-lg font-semibold text-ok">
            {gbp(summary.income)}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Money out</p>
          <p className="figures text-lg font-semibold text-ink">
            {gbp(summary.expenses)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 pb-4">
        <label className="flex min-w-[16rem] flex-[2] flex-col gap-1 text-sm">
          <span className="text-xs font-bold uppercase text-ink-soft">
            Search transactions
          </span>
          <input
            ref={searchInputRef}
            type="search"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            placeholder="e.g. Decrn, Arshad Mahmood, Esso…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-xs font-bold uppercase text-ink-soft">
            Show category
          </span>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            value={filterCategory}
            disabled={isSearching}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value={ALL_CATEGORIES}>All categories</option>
            {sections.map((category) => {
              const count = grouped.get(category)?.length ?? 0;
              if (!count && !isCustomCategoryId(category)) return null;
              return (
                <option key={category} value={category}>
                  {sectionLabel(category, customCategories)} ({count})
                </option>
              );
            })}
          </select>
        </label>
        {isSearching ? (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => {
              setSearchQuery("");
              searchInputRef.current?.focus();
            }}
          >
            Clear search
          </button>
        ) : filterCategory !== ALL_CATEGORIES ? (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setFilterCategory(ALL_CATEGORIES)}
          >
            Show all
          </button>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <div className="mx-4 flex flex-wrap items-center gap-3 rounded-xl border border-sea/30 bg-sea/10 px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            {selectedCount} selected
          </span>
          <label className="flex min-w-[14rem] flex-1 items-center gap-2 text-sm">
            <span className="shrink-0 text-ink-soft">Move to</span>
            <CategoryPicker
              value={bulkCategory}
              disabled={pending}
              clientId={clientId}
              customCategories={customCategories}
              onCustomAdded={(row) =>
                setCustomCategories((prev) =>
                  prev.some((c) => c.id === row.id)
                    ? prev
                    : [...prev, row].sort((a, b) =>
                        a.label.localeCompare(b.label),
                      ),
                )
              }
              onChange={setBulkCategory}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending}
            onClick={applyBulkMove}
          >
            {pending ? "Moving…" : "Apply to selected"}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={clearSelection}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {isSearching ? (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sand/50 px-4 py-3">
            <div>
              <h4 className="font-semibold text-ink">
                Search results for “{searchQuery.trim()}”
              </h4>
              <p className="text-xs text-ink-soft">
                {searchMatches.length} match
                {searchMatches.length === 1 ? "" : "es"} across all categories
              </p>
            </div>
            {searchMatches.length > 0 ? (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => {
                  if (allSearchSelected) clearSelection();
                  else selectAllSearchMatches();
                }}
              >
                {allSearchSelected
                  ? "Deselect all matches"
                  : `Select all ${searchMatches.length} matches`}
              </button>
            ) : null}
          </div>
          {searchMatches.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-soft">
              No transactions match that description. Try a shorter name or
              fragment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="bank-tx-table w-full table-fixed text-left text-sm">
                {tableHead}
                <tbody className="divide-y divide-line">
                  <tr className="sr-only">
                    <td colSpan={5}>
                      <input
                        type="checkbox"
                        checked={allSearchSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSearchSelected;
                        }}
                        aria-label="Select all search matches"
                        onChange={(e) =>
                          toggleSectionSelected(
                            searchMatches,
                            e.target.checked,
                          )
                        }
                      />
                    </td>
                  </tr>
                  {searchMatches.map((t) => renderRow(t, true))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 px-4 pb-6 pt-2">
          {visibleSections.map((category) => {
            const rows = grouped.get(category) ?? [];
            const total = rows.reduce((s, t) => s + t.amountPence, 0);
            const isOpen = openSections[category] ?? false;
            const showAll = expanded[category] ?? false;
            const visible = showAll ? rows : rows.slice(0, PREVIEW_LIMIT);
            const sectionSelectedCount = rows.filter((r) =>
              selectedIds.has(r.id),
            ).length;
            const allSectionSelected =
              rows.length > 0 && sectionSelectedCount === rows.length;
            const someSectionSelected =
              sectionSelectedCount > 0 && !allSectionSelected;

            if (!rows.length && isCustomCategoryId(category)) return null;

            return (
              <section
                key={category}
                ref={(el) => {
                  sectionRefs.current[category] = el;
                }}
                className="overflow-hidden rounded-xl border border-line bg-white"
              >
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 bg-sand/50 px-4 py-3 text-left transition hover:bg-sand/80 ${isOpen ? "border-b border-line" : ""}`}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpenSections((prev) => ({
                      ...prev,
                      [category]: !isOpen,
                    }))
                  }
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-ink">
                      {sectionLabel(category, customCategories)}
                      {isCustomCategoryId(category) ? (
                        <span className="ml-2 text-xs font-normal uppercase tracking-wide text-violet-600">
                          custom
                        </span>
                      ) : null}
                    </h4>
                    <p className="text-xs text-ink-soft">
                      {rows.length} transaction
                      {rows.length === 1 ? "" : "s"}
                      {rows.length > 0 ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="figures font-medium text-ink">
                            {gbp(total)}
                          </span>
                        </>
                      ) : (
                        " · empty"
                      )}
                      {category === "expense_queries" ? (
                        <span className="ml-1">
                          — unclear lines; roll to trade debtors until
                          reallocated
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-ink-soft transition-transform"
                    aria-hidden
                    style={{
                      transform: isOpen ? "rotate(180deg)" : undefined,
                    }}
                  >
                    ▼
                  </span>
                </button>

                {isOpen ? (
                  rows.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-ink-soft">
                      No transactions in this category yet.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="bank-tx-table w-full table-fixed text-left text-sm">
                          <thead className="text-xs uppercase text-ink-soft">
                            <tr>
                              <th className="w-10 px-3 py-2">
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-line"
                                  checked={allSectionSelected}
                                  ref={(el) => {
                                    if (el) {
                                      el.indeterminate = someSectionSelected;
                                    }
                                  }}
                                  aria-label={`Select all in ${sectionLabel(category, customCategories)}`}
                                  onChange={(e) =>
                                    toggleSectionSelected(
                                      rows,
                                      e.target.checked,
                                    )
                                  }
                                />
                              </th>
                              <th className="w-[6.5rem] px-3 py-2">Date</th>
                              <th className="min-w-0 px-3 py-2">Description</th>
                              <th className="w-[7.5rem] px-3 py-2 text-right">
                                Amount
                              </th>
                              <th className="w-[14rem] px-3 py-2">Category</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {visible.map((t) => renderRow(t))}
                          </tbody>
                        </table>
                      </div>
                      {rows.length > PREVIEW_LIMIT ? (
                        <div className="border-t border-line px-4 py-2">
                          <button
                            type="button"
                            className="text-sm font-semibold text-sea"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [category]: !showAll,
                              }))
                            }
                          >
                            {showAll
                              ? "Show fewer"
                              : `Show all ${rows.length} in ${sectionLabel(category, customCategories)}`}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
