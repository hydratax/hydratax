"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  WORKSPACE_CATEGORY_SECTIONS,
  buildCategoryLabelMap,
  isCustomCategoryId,
  isProvisionalReviewLabel,
  resolveCategoryLabel,
} from "@/lib/bank-categories";
import {
  mapProvisionalReviewHead,
  updateBankCategoriesBulk,
  updateBankCategory,
} from "@/server/actions/bank";
import {
  CategoryPicker,
} from "@/components/forms/category-picker";
import type { CustomCategoryRow } from "@/server/actions/custom-categories";
import {
  formatMissingMonthsSummary,
  formatMissingPeriodPhraseForAccounts,
  missingBankMonthsByTaxYear,
  missingBankMonthsInPeriod,
} from "@/lib/bank/missing-statement-months";
import {
  VAT_ALLOCATE_CHOICES,
  type VatAllocateChoice,
} from "@/lib/vat-box-allocate";
import { ManualCashTransactionCard } from "@/components/forms/manual-cash-transaction-card";
import {
  isManualBankSource,
  parseBankDescriptionMeta,
} from "@/lib/bank/manual-tx-meta";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
  source?: string | null;
};

const PREVIEW_LIMIT = 25;
const ALL_CATEGORIES = "__all__";
const NEEDS_CONFIRM = "__needs_confirm__";

function needsClientConfirm(tx: Tx) {
  return (
    tx.confidence === "low" ||
    tx.category === "expense_queries" ||
    tx.category === "uncategorised"
  );
}

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
  missingDesk = "CT",
  periodStart,
  periodEnd,
  vatAllocateByCategory,
  onVatAllocateChange,
}: {
  clientId: string;
  transactions: Tx[];
  customCategories: CustomCategoryRow[];
  /** Which desk the missing-statement note refers to. */
  missingDesk?: "SA" | "VAT" | "CT";
  /** When set (e.g. VAT quarter), missing months are scoped to this range only. */
  periodStart?: string | null;
  periodEnd?: string | null;
  /** When set, each head shows an SA-style VAT box allocation dropdown. */
  vatAllocateByCategory?: Record<string, VatAllocateChoice>;
  onVatAllocateChange?: (category: string, choice: VatAllocateChoice) => void;
}) {
  const router = useRouter();
  const [customCategories, setCustomCategories] =
    useState<CustomCategoryRow[]>(initialCustom);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [filterCategory, setFilterCategory] = useState<string>(ALL_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  /** Per-category search when a section’s transaction list is open */
  const [sectionSearch, setSectionSearch] = useState<Record<string, string>>(
    {},
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState("expense_queries");
  const [mapTarget, setMapTarget] = useState<Record<string, string>>({});
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
      .filter((t) => {
        const meta = parseBankDescriptionMeta(t.description);
        return (
          meta.description.toLowerCase().includes(searchTrimmed) ||
          (meta.notes ?? "").toLowerCase().includes(searchTrimmed)
        );
      })
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
      // Multi-select: changing the head on any selected row moves all selected.
      if (selectedIds.size > 1 && selectedIds.has(txId)) {
        const ids = [...selectedIds];
        await updateBankCategoriesBulk(ids, category);
        clearSelection();
      } else {
        await updateBankCategory(txId, category);
        if (selectedIds.has(txId)) clearSelection();
      }
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
    const needsConfirm = transactions.filter(needsClientConfirm).length;
    const reviewHeads = customCategories.filter((c) =>
      isProvisionalReviewLabel(c.label),
    ).length;
    return {
      income,
      expenses,
      count: transactions.length,
      needsConfirm,
      reviewHeads,
    };
  }, [transactions, customCategories]);

  const missingStatementsNote = useMemo(() => {
    const dates = transactions.map((t) => t.dated);
    if (
      periodStart &&
      periodEnd &&
      /^\d{4}-\d{2}-\d{2}$/.test(periodStart) &&
      /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
    ) {
      const row = missingBankMonthsInPeriod(dates, periodStart, periodEnd);
      if (!row?.missingMonths.length) return "";
      const phrase = formatMissingPeriodPhraseForAccounts(row, periodStart);
      if (!phrase) return "";
      return phrase.replace(/^Bank statements missing /i, "missing ");
    }
    const rows = missingBankMonthsByTaxYear(dates).filter(
      (r) => r.missingMonths.length > 0,
    );
    return formatMissingMonthsSummary(rows);
  }, [transactions, periodStart, periodEnd]);

  useEffect(() => {
    setCustomCategories(initialCustom);
  }, [initialCustom]);

  useEffect(() => {
    if (filterCategory === ALL_CATEGORIES || filterCategory === NEEDS_CONFIRM) {
      return;
    }
    setOpenSections((prev) => ({ ...prev, [filterCategory]: true }));
    sectionRefs.current[filterCategory]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [filterCategory]);

  const visibleSections = useMemo(() => {
    if (filterCategory === ALL_CATEGORIES) return sections;
    if (filterCategory === NEEDS_CONFIRM) {
      return sections.filter((c) =>
        (grouped.get(c) ?? []).some(needsClientConfirm),
      );
    }
    return sections.filter((c) => c === filterCategory);
  }, [sections, filterCategory, grouped]);

  const rowsForSection = (category: string, rows: Tx[]) => {
    if (filterCategory === NEEDS_CONFIRM) {
      return rows.filter(needsClientConfirm);
    }
    return rows;
  };

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
    const meta = parseBankDescriptionMeta(t.description);
    const manual =
      meta.manual || isManualBankSource(t.source);
    const displayDesc = meta.description;
    const noteText =
      meta.notes ||
      (manual ? "Cash / manual entry — allocate to a head for the practice boxes." : null);
    return (
      <tr
        key={t.id}
        className={`group ${
          isSelected
            ? "bg-sea/5"
            : manual
              ? "bg-amber-50/80 hover:bg-amber-50"
              : "hover:bg-sand/30"
        }`}
      >
        <td className="px-3 py-2 align-middle">
          <input
            type="checkbox"
            className="size-4 rounded border-line"
            checked={isSelected}
            aria-label={`Select ${displayDesc}`}
            onChange={(e) => toggleSelected(t.id, e.target.checked)}
          />
        </td>
        <td className="figures px-3 py-2 align-middle whitespace-nowrap text-ink-soft">
          {t.dated}
        </td>
        <td className="max-w-0 px-3 py-2 align-middle">
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span className="truncate" title={displayDesc}>
              {displayDesc}
            </span>
            {manual ? (
              <span className="abbr-info group/manual relative inline-flex shrink-0 align-middle">
                <span
                  tabIndex={0}
                  role="note"
                  className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-ink-soft/40 bg-white text-ink-soft transition hover:border-sea hover:text-sea focus-visible:border-sea focus-visible:text-sea focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea/30"
                  aria-label={`Cash / manual: ${displayDesc}`}
                >
                  <svg
                    viewBox="0 0 12 12"
                    width="8"
                    height="8"
                    aria-hidden="true"
                    className="block"
                  >
                    <circle cx="6" cy="3.1" r="1.05" fill="currentColor" />
                    <rect
                      x="5.15"
                      y="5"
                      width="1.7"
                      height="4.6"
                      rx="0.85"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg border border-line/80 bg-white px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-ink opacity-0 shadow-[0_12px_28px_-16px_rgba(15,40,45,0.45)] transition-opacity duration-150 group-hover/manual:opacity-100 group-focus-within/manual:opacity-100"
                >
                  <span className="block font-semibold text-ink">
                    Cash / manual
                  </span>
                  <span className="mt-0.5 block text-ink-soft">
                    {noteText}
                  </span>
                </span>
              </span>
            ) : null}
          </span>
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
            {t.confidence !== "high" && !manual ? (
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
      <div className="space-y-3 p-4">
        {missingStatementsNote ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-semibold">
              {missingDesk} · Missing bank statements
            </p>
            <p className="mt-0.5 text-amber-900/90">{missingStatementsNote}</p>
          </div>
        ) : null}
        <p className="text-sm text-ink-soft">
          No bank lines yet. Upload a statement, or add a cash / manual
          transaction below — then allocate heads to the practice boxes.
        </p>
        <ManualCashTransactionCard
          clientId={clientId}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {missingStatementsNote ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">
            {missingDesk} · Missing bank statements
          </p>
          <p className="mt-0.5 text-amber-900/90">{missingStatementsNote}</p>
        </div>
      ) : null}
      <div className="grid gap-3 border-b border-line bg-white px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">
            Needs confirmation
          </p>
          <p className="figures text-lg font-semibold text-ink">
            {summary.needsConfirm}
          </p>
        </div>
      </div>

      {summary.reviewHeads > 0 ? (
        <div className="mx-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">
            {summary.reviewHeads} provisional review head
            {summary.reviewHeads === 1 ? "" : "s"}
          </strong>
          {" — "}
          material unknown payees were grouped automatically. Open each{" "}
          <em>Review:</em> section and map the whole head to the correct
          accounts category (rules stick for next statements).
        </div>
      ) : null}

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
            <option value={NEEDS_CONFIRM}>
              Needs client confirmation ({summary.needsConfirm})
            </option>
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
          <span className="text-xs text-ink-soft">
            Pick a head — all selected move together
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
              onChange={(cat) => {
                setBulkCategory(cat);
                // Choosing a head with a selection moves everything in one go.
                const ids = [...selectedIds];
                if (!ids.length) return;
                start(async () => {
                  await updateBankCategoriesBulk(ids, cat);
                  clearSelection();
                  router.refresh();
                });
              }}
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
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
            const rows = rowsForSection(
              category,
              grouped.get(category) ?? [],
            );
            if (!rows.length) return null;
            const total = rows.reduce((s, t) => s + t.amountPence, 0);
            const isOpen = openSections[category] ?? false;
            const showAll = expanded[category] ?? false;
            const listQuery = (sectionSearch[category] ?? "")
              .trim()
              .toLowerCase();
            const filteredRows = listQuery
              ? rows.filter(
                  (t) =>
                    t.description.toLowerCase().includes(listQuery) ||
                    t.dated.includes(listQuery) ||
                    gbp(t.amountPence).toLowerCase().includes(listQuery),
                )
              : rows;
            const visible = showAll
              ? filteredRows
              : filteredRows.slice(0, PREVIEW_LIMIT);
            const sectionSelectedCount = filteredRows.filter((r) =>
              selectedIds.has(r.id),
            ).length;
            const allSectionSelected =
              filteredRows.length > 0 &&
              sectionSelectedCount === filteredRows.length;
            const someSectionSelected =
              sectionSelectedCount > 0 && !allSectionSelected;

            if (!rows.length && isCustomCategoryId(category)) return null;

            return (
              <section
                key={category}
                data-vat-head={category}
                ref={(el) => {
                  sectionRefs.current[category] = el;
                }}
                className="overflow-hidden rounded-xl border border-line bg-white"
              >
                <div
                  className={`flex flex-wrap items-center gap-2 bg-white px-4 py-3 ${isOpen ? "border-b border-line" : ""}`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition hover:opacity-90"
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
                            {isProvisionalReviewLabel(
                              sectionLabel(category, customCategories),
                            )
                              ? "review"
                              : "custom"}
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
                  {onVatAllocateChange ? (
                    <label className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                      <span className="sr-only">Allocate to VAT box</span>
                      <select
                        className="input max-w-[14rem] py-1.5 text-xs"
                        value={vatAllocateByCategory?.[category] ?? "default"}
                        disabled={pending || rows.length === 0}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onVatAllocateChange(
                            category,
                            e.target.value as VatAllocateChoice,
                          )
                        }
                      >
                        {VAT_ALLOCATE_CHOICES.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                {isOpen ? (
                  rows.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-ink-soft">
                      No transactions in this category yet.
                    </p>
                  ) : (
                    <>
                      {isProvisionalReviewLabel(
                        sectionLabel(category, customCategories),
                      ) ? (
                        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
                          <span className="text-sm text-ink">
                            Map entire head to
                          </span>
                          <CategoryPicker
                            value={mapTarget[category] ?? "admin_expenses"}
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
                            onChange={(cat) =>
                              setMapTarget((prev) => ({
                                ...prev,
                                [category]: cat,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-primary text-sm"
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              const toCategory =
                                mapTarget[category] ?? "admin_expenses";
                              start(async () => {
                                await mapProvisionalReviewHead({
                                  clientId,
                                  fromCategory: category,
                                  toCategory,
                                });
                                router.refresh();
                              });
                            }}
                          >
                            {pending ? "Mapping…" : "Map head"}
                          </button>
                        </div>
                      ) : null}
                      <div className="border-b border-line px-4 py-2.5">
                        <label className="sr-only" htmlFor={`tx-search-${category}`}>
                          Search in {sectionLabel(category, customCategories)}
                        </label>
                        <input
                          id={`tx-search-${category}`}
                          type="search"
                          className="input w-full text-sm"
                          placeholder="Search this list…"
                          value={sectionSearch[category] ?? ""}
                          onChange={(e) =>
                            setSectionSearch((prev) => ({
                              ...prev,
                              [category]: e.target.value,
                            }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        {listQuery ? (
                          <p className="mt-1.5 text-xs text-ink-soft">
                            Showing {filteredRows.length} of {rows.length}
                            {filteredRows.length === 0
                              ? " — no matches"
                              : ""}
                          </p>
                        ) : null}
                      </div>
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
                                      filteredRows,
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
                      {filteredRows.length > PREVIEW_LIMIT ? (
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
                              : `Show all ${filteredRows.length} in ${sectionLabel(category, customCategories)}`}
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

      <div className="border-t border-line pt-2">
        <ManualCashTransactionCard
          clientId={clientId}
          periodStart={periodStart}
          periodEnd={periodEnd}
          compact
        />
      </div>
    </div>
  );
}
