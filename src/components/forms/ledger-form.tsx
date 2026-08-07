"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLedgerEntry } from "@/server/actions/ledger";

export function LedgerForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await addLedgerEntry({
              clientId,
              type: String(fd.get("type")) as "income" | "expense",
              description: String(fd.get("description") || ""),
              amountPounds: String(fd.get("amountPounds") || ""),
              vatRateBps: Number(fd.get("vatRateBps")) as 0 | 500 | 2000,
              dated: String(fd.get("dated") || ""),
              category: String(fd.get("category") || "") || undefined,
            });
            e.currentTarget.reset();
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
    >
      <div>
        <label className="label">Type</label>
        <select name="type" className="input" defaultValue="income">
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <div>
        <label className="label">Date</label>
        <input name="dated" type="date" className="input" required />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <input name="description" className="input" required />
      </div>
      <div>
        <label className="label">Net amount (£)</label>
        <input
          name="amountPounds"
          className="input mono"
          placeholder="1000.00"
          required
        />
      </div>
      <div>
        <label className="label">VAT rate</label>
        <select name="vatRateBps" className="input" defaultValue="2000">
          <option value="2000">20%</option>
          <option value="500">5%</option>
          <option value="0">0%</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Category</label>
        <input name="category" className="input" placeholder="Sales" />
      </div>
      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add entry"}
        </button>
      </div>
    </form>
  );
}
