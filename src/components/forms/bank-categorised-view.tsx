"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_LABELS,
  WORKSPACE_CATEGORY_SECTIONS,
  type BankCategory,
} from "@/lib/bank-categories";
import { updateBankCategory } from "@/server/actions/bank";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

const PREVIEW_LIMIT = 25;

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function BankCategorisedView({
  clientId,
  transactions,
}: {
  clientId: string;
  transactions: Tx[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<BankCategory, Tx[]>();
    for (const tx of transactions) {
      const key = (tx.category as BankCategory) || "uncategorised";
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
          <p className="mono text-lg font-semibold text-ink">{summary.count}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Money in</p>
          <p className="mono text-lg font-semibold text-ok">{gbp(summary.income)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-ink-soft">Money out</p>
          <p className="mono text-lg font-semibold text-ink">
            {gbp(summary.expenses)}
          </p>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-6 pt-2">
        {WORKSPACE_CATEGORY_SECTIONS.map((category) => {
          const rows = grouped.get(category);
          if (!rows?.length) return null;
          const total = rows.reduce((s, t) => s + t.amountPence, 0);
          const showAll = expanded[category] ?? false;
          const visible = showAll ? rows : rows.slice(0, PREVIEW_LIMIT);

          return (
            <section
              key={category}
              className="overflow-hidden rounded-xl border border-line bg-white"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sand/50 px-4 py-3">
                <div>
                  <h4 className="font-semibold text-ink">
                    {CATEGORY_LABELS[category]}
                  </h4>
                  <p className="text-xs text-ink-soft">
                    {rows.length} transaction{rows.length === 1 ? "" : "s"} ·{" "}
                    <span className="mono font-medium text-ink">{gbp(total)}</span>
                  </p>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-ink-soft">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Move to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((t) => (
                      <tr key={t.id}>
                        <td className="mono px-3 py-2 whitespace-nowrap">
                          {t.dated}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2" title={t.description}>
                          {t.description}
                        </td>
                        <td className="mono px-3 py-2 whitespace-nowrap">
                          {gbp(t.amountPence)}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="max-w-[11rem] rounded border border-line bg-white px-2 py-1 text-xs"
                            value={t.category}
                            disabled={pending}
                            onChange={(e) =>
                              start(async () => {
                                await updateBankCategory(
                                  t.id,
                                  e.target.value as BankCategory,
                                );
                                router.refresh();
                              })
                            }
                          >
                            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <span className="ml-1 text-[10px] text-ink-soft">
                            {t.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
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
                      : `Show all ${rows.length} in ${CATEGORY_LABELS[category]}`}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
