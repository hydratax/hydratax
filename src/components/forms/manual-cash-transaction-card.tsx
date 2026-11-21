"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UkDateField } from "@/components/forms/uk-date-field";
import { addManualBankTransaction } from "@/server/actions/bank";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampIso(iso: string, min?: string | null, max?: string | null) {
  let v = iso;
  if (min && v < min) v = min;
  if (max && v > max) v = max;
  return v;
}

/**
 * Cash / manual transaction card — available on VAT, SA and company books.
 * Lines land in the shared ledger and can be allocated to practice boxes.
 */
export function ManualCashTransactionCard({
  clientId,
  periodStart,
  periodEnd,
  defaultDirection = "out",
  compact = false,
}: {
  clientId: string;
  /** When set (e.g. VAT quarter), default and clamp the date into this range. */
  periodStart?: string | null;
  periodEnd?: string | null;
  defaultDirection?: "in" | "out";
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [dated, setDated] = useState(() =>
    clampIso(todayIso(), periodStart, periodEnd),
  );
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">(defaultDirection);

  function reset() {
    setDescription("");
    setNotes("");
    setAmount("");
    setDated(clampIso(todayIso(), periodStart, periodEnd));
    setDirection(defaultDirection);
  }

  function submit() {
    const pounds = Number.parseFloat(amount.replace(/[£,\s]/g, ""));
    if (!description.trim() || !Number.isFinite(pounds) || pounds <= 0) return;
    const iso = clampIso(dated, periodStart, periodEnd);
    start(async () => {
      const res = await addManualBankTransaction({
        clientId,
        dated: iso,
        description: description.trim(),
        notes: notes.trim() || undefined,
        amountPounds: pounds,
        direction,
      });
      if (!res.ok) return;
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className={compact ? "px-3 py-2" : "px-4 py-3"}>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          onClick={() => setOpen(true)}
        >
          Add cash / manual transaction
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-line bg-white ${
        compact ? "mx-2 my-2 p-3" : "mx-0 my-0 p-4"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
            Cash / manual
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Add a dated line (cash, cheque, or missing bank entry). Allocate it
            to a head below, then fill the practice boxes.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink">
          Date
          <UkDateField
            className="input mt-1 w-full text-sm"
            value={dated}
            onChange={(iso) =>
              setDated(clampIso(iso, periodStart, periodEnd))
            }
          />
        </label>
        <label className="block text-xs font-semibold text-ink">
          Direction
          <select
            className="input mt-1 w-full text-sm"
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value === "in" ? "in" : "out")
            }
          >
            <option value="out">Money out (expense)</option>
            <option value="in">Money in (income)</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink sm:col-span-2">
          Description
          <input
            className="input mt-1 w-full text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Cash sale · Petty cash fuel"
            maxLength={200}
          />
        </label>
        <label className="block text-xs font-semibold text-ink sm:col-span-2">
          Notes
          <textarea
            className="input mt-1 w-full text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional detail — shown when the i mark is hovered"
            maxLength={2000}
          />
        </label>
        <label className="block text-xs font-semibold text-ink">
          Amount (£)
          <input
            className="input mt-1 w-full text-sm"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="btn btn-primary w-full text-sm"
            disabled={
              pending ||
              !description.trim() ||
              !amount.trim() ||
              !/^\d{4}-\d{2}-\d{2}$/.test(dated)
            }
            onClick={submit}
          >
            {pending ? "Adding…" : "Add transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
