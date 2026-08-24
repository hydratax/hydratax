"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClientInvoice,
  createInvoiceLineTemplate,
  deleteInvoiceLineTemplate,
  setInvoiceStatus,
} from "@/server/actions/invoices";
import type {
  MemoryInvoice,
  MemoryInvoiceLineTemplate,
} from "@/server/demo/store";
import { money } from "@/lib/format";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

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

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function penceToPoundsInput(pence: number) {
  return (pence / 100).toFixed(2);
}

function lineTotals(lines: LineDraft[]) {
  let net = 0;
  let vat = 0;
  for (const line of lines) {
    const unit = Math.round(
      Number.parseFloat(line.unitPricePounds || "0") * 100,
    );
    if (!Number.isFinite(unit)) continue;
    const qty = Number(line.quantity) || 0;
    const lineNet = Math.round(unit * qty);
    const rate = Number(line.vatRateBps) / 10_000;
    net += lineNet;
    vat += Math.round(lineNet * rate);
  }
  return { net, vat, gross: net + vat };
}

export function InvoiceWorkspace({
  clientId,
  clientName,
  clientEmail,
  invoices,
  templates,
}: {
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  invoices: MemoryInvoice[];
  templates: MemoryInvoiceLineTemplate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(() =>
    addDays(new Date().toISOString().slice(0, 10), 14),
  );
  const [duePreset, setDuePreset] = useState<"7" | "14" | "30" | "custom">(
    "14",
  );
  const [status, setCreateStatus] = useState<"draft" | "sent" | "due">("due");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const totals = useMemo(() => lineTotals(lines), [lines]);

  function applyPreset(preset: "7" | "14" | "30" | "custom") {
    setDuePreset(preset);
    if (preset !== "custom") {
      setDueDate(addDays(issueDate, Number(preset)));
    }
  }

  function applyTemplate(t: MemoryInvoiceLineTemplate) {
    const draft: LineDraft = {
      description: t.description,
      quantity: String(t.quantity || 1),
      unitPricePounds: penceToPoundsInput(t.unitPricePence),
      vatRateBps: String(t.vatRateBps) as LineDraft["vatRateBps"],
    };
    setLines((rows) => {
      const onlyBlank =
        rows.length === 1 &&
        !rows[0].description.trim() &&
        Number(rows[0].unitPricePounds) === 0;
      return onlyBlank ? [draft] : [...rows, draft];
    });
  }

  function copyLastInvoice() {
    const last = [...invoices].sort((a, b) =>
      b.issueDate.localeCompare(a.issueDate),
    )[0];
    if (!last?.lines.length) {
      setError("No previous invoice to copy lines from.");
      return;
    }
    setLines(
      last.lines.map((l) => ({
        description: l.description,
        quantity: String(l.quantity),
        unitPricePounds: penceToPoundsInput(l.unitPricePence),
        vatRateBps: String(l.vatRateBps) as LineDraft["vatRateBps"],
      })),
    );
    if (last.notes) setNotes(last.notes);
    if (last.paymentInstructions) {
      setPaymentInstructions(last.paymentInstructions);
    }
    setError(null);
  }

  function resetForm() {
    setLines([emptyLine()]);
    setNotes("");
    setReference("");
    setCreateStatus("due");
    const today = new Date().toISOString().slice(0, 10);
    setIssueDate(today);
    setDuePreset("14");
    setDueDate(addDays(today, 14));
  }

  return (
    <div className="space-y-8">
      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            try {
              await createClientInvoice({
                clientId,
                issueDate,
                dueDate,
                notes: notes || undefined,
                reference: reference || undefined,
                paymentInstructions: paymentInstructions || undefined,
                status,
                lines: lines.map((l) => ({
                  description: l.description,
                  quantity: Number(l.quantity),
                  unitPricePounds: l.unitPricePounds,
                  vatRateBps: Number(l.vatRateBps) as 0 | 500 | 2000,
                })),
              });
              resetForm();
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl text-ink">Create invoice</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Bill to{" "}
              <span className="font-semibold text-ink">{clientName}</span>
              {clientEmail ? ` · ${clientEmail}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-sea"
            onClick={copyLastInvoice}
          >
            Copy last invoice lines
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">
            Issue date
            <input
              type="date"
              className="input mt-1 font-normal"
              value={issueDate}
              required
              onChange={(e) => {
                const next = e.target.value;
                setIssueDate(next);
                if (duePreset !== "custom") {
                  setDueDate(addDays(next, Number(duePreset)));
                }
              }}
            />
          </label>
          <label className="text-sm font-semibold">
            Payment terms
            <select
              className="input mt-1 font-normal"
              value={duePreset}
              onChange={(e) =>
                applyPreset(e.target.value as typeof duePreset)
              }
            >
              <option value="7">Net 7</option>
              <option value="14">Net 14</option>
              <option value="30">Net 30</option>
              <option value="custom">Custom due date</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Due date
            <input
              type="date"
              className="input mt-1 font-normal"
              value={dueDate}
              required
              onChange={(e) => {
                setDuePreset("custom");
                setDueDate(e.target.value);
              }}
            />
          </label>
          <label className="text-sm font-semibold">
            Status
            <select
              className="input mt-1 font-normal"
              value={status}
              onChange={(e) =>
                setCreateStatus(e.target.value as typeof status)
              }
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="due">Due</option>
            </select>
          </label>
        </div>

        <label className="block text-sm font-semibold">
          PO / reference
          <input
            className="input mt-1 font-normal"
            value={reference}
            placeholder="Optional purchase order or reference"
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

        {templates.length > 0 && (
          <div className="rounded-lg border border-line bg-white/60 p-3">
            <p className="text-sm font-semibold text-ink">Line templates</p>
            <p className="mt-1 text-xs text-ink-soft">
              Click a template to add description, amount and VAT.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md border border-line px-2 py-1 text-left text-sm hover:border-sea hover:text-sea"
                    onClick={() => applyTemplate(t)}
                  >
                    <span className="font-semibold">
                      {t.label || t.description}
                    </span>
                    <span className="mono ml-2 text-ink-soft">
                      {money(t.unitPricePence)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="px-1 text-xs font-semibold text-danger"
                    title="Delete template"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        try {
                          await deleteInvoiceLineTemplate(t.id);
                          router.refresh();
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "Failed",
                          );
                        }
                      })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
                            vatRateBps: e.target
                              .value as LineDraft["vatRateBps"],
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
              <div className="flex flex-col gap-1 sm:col-span-1">
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="text-sm font-semibold text-danger"
                    onClick={() =>
                      setLines((rows) => rows.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs font-semibold text-sea"
                  disabled={pending || !line.description.trim()}
                  title="Save as reusable template"
                  onClick={() =>
                    start(async () => {
                      try {
                        await createInvoiceLineTemplate({
                          label: line.description.slice(0, 80),
                          description: line.description,
                          quantity: Number(line.quantity) || 1,
                          unitPricePounds: line.unitPricePounds,
                          vatRateBps: Number(line.vatRateBps) as
                            | 0
                            | 500
                            | 2000,
                        });
                        router.refresh();
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : "Failed",
                        );
                      }
                    })
                  }
                >
                  Save
                </button>
              </div>
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

        <div className="grid gap-3 rounded-lg border border-line bg-mist/40 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Net
            </p>
            <p className="mono mt-1 text-lg font-semibold">
              {money(totals.net)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              VAT
            </p>
            <p className="mono mt-1 text-lg font-semibold">
              {money(totals.vat)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Total
            </p>
            <p className="mono mt-1 text-xl font-semibold text-ink">
              {money(totals.gross)}
            </p>
          </div>
        </div>

        <label className="block text-sm font-semibold">
          Notes
          <textarea
            className="input mt-1 min-h-[4rem] font-normal"
            placeholder="Payment terms, project notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <label className="block text-sm font-semibold">
          Payment instructions
          <textarea
            className="input mt-1 min-h-[4rem] font-normal"
            placeholder="Bank name, sort code, account number, payment reference…"
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
          />
        </label>

        <FormErrorBanner error={error} />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending
            ? "Saving…"
            : status === "draft"
              ? "Save draft"
              : "Generate invoice"}
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
                    {inv.reference ? ` · Ref ${inv.reference}` : ""}
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
                  <div className="mt-2 flex flex-col items-end gap-1">
                    <Link
                      href={`/clients/${clientId}/invoices/${inv.id}/print`}
                      className="text-sm font-semibold text-sea"
                      target="_blank"
                    >
                      Print / PDF
                    </Link>
                    {inv.status === "draft" && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-sea"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await setInvoiceStatus(inv.id, "sent");
                            router.refresh();
                          })
                        }
                      >
                        Mark sent
                      </button>
                    )}
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
                    {inv.status !== "void" && inv.status !== "paid" && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            await setInvoiceStatus(inv.id, "void");
                            router.refresh();
                          })
                        }
                      >
                        Void
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
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
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
