"use client";

import { useMemo, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import {
  draftCt600FromTrialBalance,
  uploadTrialBalance,
  updateTrialBalanceMappings,
} from "@/server/actions/trial-balance";
import {
import { FormErrorBanner } from "@/components/forms/form-error-banner";
  defaultMappings,
  parseTrialBalanceRows,
  trialBalanceToCt600Figures,
  type TbMapTarget,
  type TrialBalance,
} from "@/server/trial-balance/map";

const MAP_OPTIONS: { value: TbMapTarget; label: string }[] = [
  { value: "turnover", label: "Turnover / sales" },
  { value: "cost_of_sales", label: "Cost of sales" },
  { value: "admin_expenses", label: "Admin expenses" },
  { value: "other_income", label: "Other income" },
  { value: "tangible_assets", label: "Tangible assets" },
  { value: "cash", label: "Cash at bank" },
  { value: "debtors", label: "Debtors" },
  { value: "creditors", label: "Creditors" },
  { value: "share_capital", label: "Share capital" },
  { value: "retained_earnings", label: "Retained earnings / P&L" },
  { value: "vat_output", label: "VAT on sales (Box 1)" },
  { value: "vat_input", label: "VAT on purchases (Box 4)" },
  { value: "sales_net", label: "Sales net (Box 6)" },
  { value: "purchases_net", label: "Purchases net (Box 7)" },
  { value: "ignore", label: "Ignore" },
];

function sheetToRows(file: ArrayBuffer): Record<string, unknown>[] {
  const book = XLSX.read(file, { type: "array" });
  const first = book.SheetNames[0];
  if (!first) throw new Error("Workbook has no sheets");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[first], {
    defval: "",
    raw: false,
  });
}

function moneyPence(n: number) {
  return (n / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });
}

function localTrialBalance(input: {
  purpose: "vat" | "ct600" | "general";
  periodStart: string;
  periodEnd: string;
  filename: string;
  rows: Record<string, unknown>[];
}): TrialBalance {
  const lines = parseTrialBalanceRows(input.rows);
  if (lines.length === 0) {
    throw new Error("No trial balance lines found — check column headers");
  }
  return {
    id: crypto.randomUUID(),
    clientId: "local",
    practiceId: "local",
    purpose: input.purpose,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    filename: input.filename,
    lines,
    mappings: defaultMappings(lines),
    createdAt: new Date().toISOString(),
  };
}

export type Ct600TbFigures = ReturnType<typeof trialBalanceToCt600Figures>;

export function TrialBalanceUpload({
  clientId,
  purpose,
  periodStart,
  periodEnd,
  onReady,
  applyLabel,
  onApplyFigures,
}: {
  /** Practice client. When omitted, the file is parsed locally (not stored). */
  clientId?: string | null;
  purpose: "vat" | "ct600" | "general";
  periodStart: string;
  periodEnd: string;
  onReady?: (tb: TrialBalance) => void;
  /** When set, shows a primary button that maps the TB into CT600 figures */
  applyLabel?: string;
  onApplyFigures?: (payload: {
    tb: TrialBalance;
    figures: Ct600TbFigures;
  }) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [maps, setMaps] = useState<Record<string, TbMapTarget>>({});

  const persisted = Boolean(clientId);
  const totals = useMemo(() => {
    if (!tb) return { debit: 0, credit: 0 };
    return tb.lines.reduce(
      (acc, l) => ({
        debit: acc.debit + l.debitPence,
        credit: acc.credit + l.creditPence,
      }),
      { debit: 0, credit: 0 },
    );
  }, [tb]);

  return (
    <div className="space-y-4">
      <label className="panel flex cursor-pointer flex-col items-center gap-2 border-dashed p-8 text-center hover:border-sea">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            start(async () => {
              try {
                const rows = sheetToRows(await file.arrayBuffer());
                const uploaded = clientId
                  ? await uploadTrialBalance({
                      clientId,
                      purpose,
                      periodStart,
                      periodEnd,
                      filename: file.name,
                      rows,
                    })
                  : localTrialBalance({
                      purpose,
                      periodStart,
                      periodEnd,
                      filename: file.name,
                      rows,
                    });
                setTb(uploaded);
                setMaps(uploaded.mappings);
                onReady?.(uploaded);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Upload failed",
                );
              }
            });
          }}
        />
        <span className="font-semibold text-ink">
          {pending ? "Uploading…" : "Upload MTD trial balance"}
        </span>
        <span className="text-sm text-ink-soft">
          Excel / CSV · columns: account_code, account_name, debit, credit
        </span>
      </label>

      <FormErrorBanner error={error} />

      {tb && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-ink-soft">
              {tb.filename} · {tb.lines.length} lines · Dr{" "}
              <span className="mono">{moneyPence(totals.debit)}</span> · Cr{" "}
              <span className="mono">{moneyPence(totals.credit)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {persisted && (
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      try {
                        const updated = await updateTrialBalanceMappings({
                          trialBalanceId: tb.id,
                          mappings: maps,
                        });
                        setTb(updated);
                        onReady?.(updated);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not save mappings",
                        );
                      }
                    })
                  }
                >
                  Save mappings
                </button>
              )}
              {applyLabel && onApplyFigures && (
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      try {
                        let figures: Ct600TbFigures;
                        let next = { ...tb, mappings: maps };
                        if (persisted && clientId) {
                          next = await updateTrialBalanceMappings({
                            trialBalanceId: tb.id,
                            mappings: maps,
                          });
                          setTb(next);
                          onReady?.(next);
                          const drafted = await draftCt600FromTrialBalance(
                            next.id,
                          );
                          figures = drafted.figures;
                        } else {
                          setTb(next);
                          onReady?.(next);
                          figures = trialBalanceToCt600Figures(
                            next,
                            clientId || "local",
                          );
                        }
                        onApplyFigures({ tb: next, figures });
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not apply trial balance",
                        );
                      }
                    })
                  }
                >
                  {applyLabel}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-sand text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Debit</th>
                  <th className="px-3 py-2">Credit</th>
                  <th className="px-3 py-2">Map to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tb.lines.map((line) => (
                  <tr key={line.accountCode}>
                    <td className="mono px-3 py-2">{line.accountCode}</td>
                    <td className="px-3 py-2">{line.accountName}</td>
                    <td className="mono px-3 py-2">
                      {line.debitPence ? moneyPence(line.debitPence) : "—"}
                    </td>
                    <td className="mono px-3 py-2">
                      {line.creditPence ? moneyPence(line.creditPence) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input py-1 text-xs"
                        value={maps[line.accountCode] ?? "ignore"}
                        onChange={(e) =>
                          setMaps((m) => ({
                            ...m,
                            [line.accountCode]: e.target.value as TbMapTarget,
                          }))
                        }
                      >
                        {MAP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
