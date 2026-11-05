"use client";

import { useMemo, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import {
  draftCt600FromTrialBalance,
  uploadTrialBalance,
  updateTrialBalanceMappings,
} from "@/server/actions/trial-balance";
import {
  defaultMappings,
  parseTrialBalanceRows,
  trialBalanceToCt600Figures,
  type TbMapTarget,
  type TrialBalance,
} from "@/server/trial-balance/map";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const MAP_OPTIONS: { value: TbMapTarget; label: string }[] = [
  { value: "turnover", label: "Turnover / sales" },
  { value: "cost_of_sales", label: "Cost of sales" },
  { value: "admin_expenses", label: "Admin expenses" },
  { value: "other_income", label: "Other income" },
  { value: "tangible_assets", label: "Tangible assets" },
  { value: "cash", label: "Cash at bank" },
  { value: "debtors", label: "Debtors" },
  { value: "creditors", label: "Creditors" },
  { value: "corporation_tax", label: "Corporation tax (charge / payable)" },
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-soft">
              Edit debit/credit or remapping below, then apply again. Changes stay
              on this screen until you re-upload.
            </p>
            <button
              type="button"
              className="rounded-lg border border-sea px-3 py-1.5 text-sm font-semibold text-sea hover:bg-sea/5"
              onClick={() => {
                setTb((prev) => {
                  if (!prev) return prev;
                  let n = prev.lines.length + 1;
                  let accountCode = `ADJ${n}`;
                  while (prev.lines.some((l) => l.accountCode === accountCode)) {
                    n += 1;
                    accountCode = `ADJ${n}`;
                  }
                  const line = {
                    accountCode,
                    accountName: "Corporation tax",
                    debitPence: 0,
                    creditPence: 0,
                    suggestedMap: "corporation_tax" as TbMapTarget,
                  };
                  setMaps((m) => ({ ...m, [accountCode]: "corporation_tax" }));
                  return { ...prev, lines: [...prev.lines, line] };
                });
              }}
            >
              Add debit / credit line
            </button>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-sand text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Debit</th>
                  <th className="px-3 py-2">Credit</th>
                  <th className="px-3 py-2">Map to</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tb.lines.map((line, index) => (
                  <tr key={`${line.accountCode}-${index}`}>
                    <td className="px-3 py-2">
                      <input
                        className="input mono w-20 py-1 text-xs"
                        value={line.accountCode}
                        onChange={(e) => {
                          const accountCode =
                            e.target.value.trim() || line.accountCode;
                          setTb((prev) => {
                            if (!prev) return prev;
                            const lines = prev.lines.map((l, i) =>
                              i === index ? { ...l, accountCode } : l,
                            );
                            return { ...prev, lines };
                          });
                          setMaps((m) => {
                            const prevCode = line.accountCode;
                            if (prevCode === accountCode) return m;
                            const next = { ...m };
                            const mapped =
                              next[prevCode] ?? line.suggestedMap ?? "ignore";
                            delete next[prevCode];
                            next[accountCode] = mapped;
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full min-w-[8rem] py-1 text-xs"
                        value={line.accountName}
                        onChange={(e) => {
                          const accountName = e.target.value;
                          setTb((prev) => {
                            if (!prev) return prev;
                            const lines = prev.lines.map((l, i) =>
                              i === index ? { ...l, accountName } : l,
                            );
                            return { ...prev, lines };
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input mono w-28 py-1 text-xs"
                        inputMode="decimal"
                        value={
                          line.debitPence
                            ? (line.debitPence / 100).toFixed(2)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, "").trim();
                          const pounds = raw === "" ? 0 : Number.parseFloat(raw);
                          const debitPence = Number.isFinite(pounds)
                            ? Math.round(pounds * 100)
                            : 0;
                          setTb((prev) => {
                            if (!prev) return prev;
                            const lines = prev.lines.map((l, i) =>
                              i === index ? { ...l, debitPence } : l,
                            );
                            return { ...prev, lines };
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input mono w-28 py-1 text-xs"
                        inputMode="decimal"
                        value={
                          line.creditPence
                            ? (line.creditPence / 100).toFixed(2)
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, "").trim();
                          const pounds = raw === "" ? 0 : Number.parseFloat(raw);
                          const creditPence = Number.isFinite(pounds)
                            ? Math.round(pounds * 100)
                            : 0;
                          setTb((prev) => {
                            if (!prev) return prev;
                            const lines = prev.lines.map((l, i) =>
                              i === index ? { ...l, creditPence } : l,
                            );
                            return { ...prev, lines };
                          });
                        }}
                      />
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
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-ink-soft hover:text-ink"
                        aria-label={`Remove ${line.accountName || line.accountCode}`}
                        onClick={() => {
                          setTb((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              lines: prev.lines.filter((_, i) => i !== index),
                            };
                          });
                          setMaps((m) => {
                            const next = { ...m };
                            delete next[line.accountCode];
                            return next;
                          });
                        }}
                      >
                        Remove
                      </button>
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
