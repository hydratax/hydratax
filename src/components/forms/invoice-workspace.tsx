"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClientInvoice,
  setInvoiceStatus,
} from "@/server/actions/invoices";
import type { MemoryInvoice } from "@/server/demo/store";
import { money } from "@/lib/format";

type LineDraft = {
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRateBps: "0" | "500" | "2000";
};

const emptyLine = (): LineDraft => ({
  description: "",
  quantity: "1",
  unitPricePounds: "0.00",
  vatRateBps: "2000",
});

function statusBadge(status: MemoryInvoice["status"]) {
  if (status === "paid") return "badge badge-ok";
  if (status === "due" || status === "sent") return "badge badge-due-soon";
  if (status === "void") return "badge badge-muted";
  return "badge badge-muted";
}

function isOverdue(inv: MemoryInvoice) {
  if (inv.status === "paid" || inv.status === "void") return false;
  return inv.dueDate < new Date().toISOString().slice(0, 10);
}

export function InvoiceWorkspace({
  clientId,
  invoices,
}: {
  clientId: string;
  invoices: MemoryInvoice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const today = new Date().toISOString().slice(0, 10);
  const dueDefault = new Date(Date.now() + 14 * 86400000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            try {
              await createClientInvoice({
                clientId,
                issueDate: String(fd.get("issueDate") || today),
                dueDate: String(fd.get("dueDate") || dueDefault),
                notes: String(fd.get("notes") || "") || undefined,
                status: "due",
                lines: lines.map((l) => ({
                  description: l.description,
                  quantity: Number(l.quantity),
                  unitPricePounds: l.unitPricePounds,
                  vatRateBps: Number(l.vatRateBps) as 0 | 500 | 2000,
                })),
              });
              setLines([emptyLine()]);
              e.currentTarget.reset();
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        <h2 className="display text-2xl text-ink">Create invoice</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Issue date
            <input
              name="issueDate"
              type="date"
              className="input mt-1 font-normal"
              defaultValue={today}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Due date
            <input
              name="dueDate"
              type="date"
              className="input mt-1 font-normal"
              defaultValue={dueDefault}
              required
            />
          </label>
        </div>

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-12"
            >
              <input
                className="input sm:col-span-5"
                placeholder="Description"
                value={line.description}
                required
                onChange={(e) =>
                  setLines((rows) =>
                    rows.map((r, idx) =>
                      idx === i ? { ...r, description: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                className="input sm:col-span-2"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="Qty"
                value={line.quantity}
                required
                onChange={(e) =>
                  setLines((rows) =>
                    rows.map((r, idx) =>
                      idx === i ? { ...r, quantity: e.target.value } : r,
                    ),
                  )
                }
              />
              <input
                className="input mono sm:col-span-2"
                placeholder="Unit £"
                value={line.unitPricePounds}
                required
                onChange={(e) =>
                  setLines((rows) =>
                    rows.map((r, idx) =>
                      idx === i
                        ? { ...r, unitPricePounds: e.target.value }
                        : r,
                    ),
                  )
                }
              />
              <select
                className="input sm:col-span-2"
                value={line.vatRateBps}
                onChange={(e) =>
                  setLines((rows) =>
                    rows.map((r, idx) =>
                      idx === i
                        ? {
                            ...r,
                            vatRateBps: e.target.value as LineDraft["vatRateBps"],
                          }
                        : r,
                    ),
                  )
                }
              >
                <option value="2000">VAT 20%</option>
                <option value="500">VAT 5%</option>
                <option value="0">VAT 0%</option>
              </select>
              {lines.length > 1 && (
                <button
                  type="button"
                  className="text-sm font-semibold text-danger sm:col-span-1"
                  onClick={() =>
                    setLines((rows) => rows.filter((_, idx) => idx !== i))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-sea"
            onClick={() => setLines((rows) => [...rows, emptyLine()])}
          >
            + Add line
          </button>
        </div>

        <label className="block text-sm font-semibold">
          Notes
          <textarea
            name="notes"
            className="input mt-1 min-h-[4rem] font-normal"
            placeholder="Payment terms…"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Generate invoice"}
        </button>
      </form>

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">
            Invoices ({invoices.length})
          </h2>
        </div>
        <ul className="divide-y divide-line">
          {invoices.length === 0 && (
            <li className="px-4 py-8 text-center text-ink-soft">
              No invoices yet.
            </li>
          )}
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className={`px-4 py-4 ${isOverdue(inv) ? "client-card--overdue" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono font-semibold text-ink">
                    {inv.invoiceNumber}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Issued {inv.issueDate} · Due {inv.dueDate}
                    {isOverdue(inv) ? " · Overdue" : ""}
                  </p>
                  <ul className="mt-2 text-sm text-ink-soft">
                    {inv.lines.map((l, i) => (
                      <li key={i}>
                        {l.description} × {l.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right">
                  <p className="mono text-lg font-semibold">
                    {money(inv.totalPence)}
                  </p>
                  <span className={statusBadge(inv.status)}>{inv.status}</span>
                  <div className="mt-2 flex flex-col gap-1">
                    {inv.status !== "paid" && inv.status !== "void" && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-sea"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await setInvoiceStatus(inv.id, "paid");
                            router.refresh();
                          })
                        }
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function InvoiceSummaryCards({
  clientId,
  invoices,
  title = "Invoices",
}: {
  clientId: string;
  invoices: MemoryInvoice[];
  title?: string;
}) {
  const open = invoices.filter(
    (i) => i.status === "due" || i.status === "sent" || i.status === "draft",
  );
  const overdue = open.filter(isOverdue);
  const dueSoon = open.filter((i) => !isOverdue(i));

  return (
    <div
      className={`panel p-5 ${
        overdue.length ? "border-danger/35 ring-1 ring-danger/15" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl">{title}</h2>
        <Link
          href={`/clients/${clientId}/invoices`}
          className="text-sm font-semibold text-sea"
        >
          Open →
        </Link>
      </div>
      {overdue.length > 0 && (
        <p className="mt-2 text-sm text-danger">
          {overdue.length} overdue invoice{overdue.length === 1 ? "" : "s"} need
          attention.
        </p>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <dt className="text-ink-soft">Open</dt>
          <dd className="display text-2xl">{open.length}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Due</dt>
          <dd className="display text-2xl text-violet">{dueSoon.length}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Overdue</dt>
          <dd className="display text-2xl text-danger">{overdue.length}</dd>
        </div>
      </dl>
      <ul className="mt-4 divide-y divide-line text-sm">
        {invoices.slice(0, 5).map((inv) => (
          <li key={inv.id} className="flex justify-between py-2">
            <span className="mono">{inv.invoiceNumber}</span>
            <span className="font-semibold">{money(inv.totalPence)}</span>
          </li>
        ))}
        {invoices.length === 0 && (
          <li className="py-3 text-ink-soft">No invoices yet.</li>
        )}
      </ul>
    </div>
  );
}
