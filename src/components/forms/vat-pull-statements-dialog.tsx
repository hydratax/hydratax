"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BANK_STATEMENT_DESK_LABEL,
  groupBankStatementsByDesk,
  type BankStatementDesk,
  type BankStatementDocSummary,
} from "@/lib/bank/statement-docs";

/**
 * Ask which Books statements to pull into the VAT return.
 * Defaults: Company tax + VAT checked; Self Assessment unchecked
 * (personal statements are only for sole-trader / explicit cases).
 */
export function VatPullStatementsDialog({
  open,
  statements,
  periodLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  statements: BankStatementDocSummary[];
  periodLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (selected: BankStatementDocSummary[]) => void;
}) {
  const groups = useMemo(
    () => groupBankStatementsByDesk(statements),
    [statements],
  );

  const defaultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of statements) {
      if (doc.desk === "ct" || doc.desk === "vat") ids.add(doc.id);
    }
    return ids;
  }, [statements]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(defaultIds),
  );

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(defaultIds));
  }, [open, defaultIds]);

  if (!open) return null;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDesk(desk: BankStatementDesk, docs: BankStatementDocSummary[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = docs.every((d) => next.has(d.id));
      for (const d of docs) {
        if (allOn) next.delete(d.id);
        else next.add(d.id);
      }
      return next;
    });
  }

  const selected = statements.filter((s) => selectedIds.has(s.id));
  const hasSaSelected = selected.some((s) => s.desk === "sa");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vat-pull-statements-title"
    >
      <div className="panel flex max-h-[min(90vh,36rem)] w-full max-w-lg flex-col overflow-hidden shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <h2
            id="vat-pull-statements-title"
            className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft"
          >
            Pull statements for VAT
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{periodLabel}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No bank statements in Books yet. Upload under VAT or Company tax
              first.
            </p>
          ) : (
            groups.map((group) => {
              const allOn = group.docs.every((d) => selectedIds.has(d.id));
              return (
                <section key={group.desk}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                      {group.label}
                    </h3>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-sea hover:underline"
                      onClick={() => toggleDesk(group.desk, group.docs)}
                    >
                      {allOn ? "Clear" : "Select all"}
                    </button>
                  </div>
                  {group.desk === "sa" ? (
                    <p className="mb-2 text-[11px] leading-snug text-ink-soft">
                      Personal Self Assessment statements — only select when
                      this is a sole trader (or similar) and the same account
                      is used for VAT.
                    </p>
                  ) : null}
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {group.docs.map((doc) => {
                      const checked = selectedIds.has(doc.id);
                      return (
                        <li key={doc.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-sea/5">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              onChange={() => toggle(doc.id)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-ink">
                                {doc.filename}
                              </span>
                              <span className="text-[10px] text-ink-soft">
                                {(doc.sizeBytes / 1024).toFixed(0)} KB
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
          {hasSaSelected ? (
            <p className="rounded-lg border border-line bg-paper px-3 py-2 text-[11px] leading-snug text-ink-soft">
              Self Assessment statements included — use only when personal
              banking is also the VAT trading account.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending || selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            {pending
              ? "Pulling…"
              : `Pull ${selected.length || ""} statement${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Re-export label map for callers that only need titles. */
export { BANK_STATEMENT_DESK_LABEL };
