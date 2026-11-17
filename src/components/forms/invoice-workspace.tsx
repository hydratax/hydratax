"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createClientInvoice,
  deleteInvoiceLineTemplate,
  sendClientInvoiceEmail,
  setInvoiceStatus,
} from "@/server/actions/invoices";
import type {
  MemoryInvoice,
  MemoryInvoiceLineTemplate,
} from "@/server/demo/store";
import { money } from "@/lib/format";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import {
  isInvoiceOverdue,
  openInvoiceTotals,
} from "@/lib/invoices/totals";
import { computeInvoiceTotals } from "@/lib/invoices/compute-totals";
import { messageFromUnknown } from "@/lib/action-error";

type LineDraft = {
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRateBps: "0" | "500" | "2000";
};

type TermsPreset =
  | "due_on_receipt"
  | "net_7"
  | "net_14"
  | "net_30"
  | "custom";

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

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function penceToPoundsInput(pence: number) {
  return (pence / 100).toFixed(2);
}

function termsLabel(preset: TermsPreset): string {
  if (preset === "due_on_receipt") return "Due on Receipt";
  if (preset === "net_7") return "Net 7";
  if (preset === "net_14") return "Net 14";
  if (preset === "net_30") return "Net 30";
  return "Custom";
}

function lineDraftTotals(lines: LineDraft[]) {
  let net = 0;
  let vat = 0;
  let qty = 0;
  for (const line of lines) {
    const unit = Math.round(
      Number.parseFloat(line.unitPricePounds || "0") * 100,
    );
    if (!Number.isFinite(unit)) continue;
    const q = Number(line.quantity) || 0;
    const lineNet = Math.round(unit * q);
    const rate = Number(line.vatRateBps) / 10_000;
    net += lineNet;
    vat += Math.round(lineNet * rate);
    qty += q;
  }
  return { net, vat, qty };
}

export function InvoiceWorkspace({
  clientId,
  clientName,
  clientEmail,
  invoices,
  templates,
  initialLine,
  defaultPaymentInstructions = "",
  brandingIncomplete = false,
  stripeConnected = false,
  previewInvoiceNumber = "INV-000001",
}: {
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  invoices: MemoryInvoice[];
  templates: MemoryInvoiceLineTemplate[];
  initialLine?: LineDraft | null;
  defaultPaymentInstructions?: string;
  brandingIncomplete?: boolean;
  /** Practice has Stripe Connect linked */
  stripeConnected?: boolean;
  previewInvoiceNumber?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState(clientEmail ?? "");
  const dueTotals = useMemo(() => openInvoiceTotals(invoices), [invoices]);
  const [lines, setLines] = useState<LineDraft[]>([
    initialLine ?? emptyLine(),
  ]);
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [termsPreset, setTermsPreset] =
    useState<TermsPreset>("due_on_receipt");
  const [orderNumber, setOrderNumber] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountPounds, setDiscountPounds] = useState("");
  const [shippingPounds, setShippingPounds] = useState("");
  const [adjustmentPounds, setAdjustmentPounds] = useState("");
  const [termsConditions, setTermsConditions] = useState("");
  const [enableOnlinePay, setEnableOnlinePay] = useState(false);
  const [notes, setNotes] = useState("Thanks for your business.");
  const [paymentInstructions, setPaymentInstructions] = useState(
    defaultPaymentInstructions,
  );
  const [showNumberHint, setShowNumberHint] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  /** First Save and send → scroll here; second press emails this invoice. */
  const [armedSendInvoiceId, setArmedSendInvoiceId] = useState<string | null>(
    null,
  );
  const sendRecipientRef = useRef<HTMLDivElement>(null);

  const lineMaths = useMemo(() => lineDraftTotals(lines), [lines]);
  const totals = useMemo(() => {
    const discountPct = Number.parseFloat(discountPercent || "0");
    const discountAmt = Number.parseFloat(discountPounds || "0");
    return computeInvoiceTotals({
      lineNetPence: lineMaths.net,
      lineVatPence: lineMaths.vat,
      discountPence:
        Number.isFinite(discountAmt) && discountAmt > 0
          ? Math.round(discountAmt * 100)
          : 0,
      discountPercentBps:
        discountAmt > 0
          ? null
          : Number.isFinite(discountPct) && discountPct > 0
            ? Math.round(discountPct * 100)
            : null,
      shippingPence: Math.round(
        (Number.parseFloat(shippingPounds || "0") || 0) * 100,
      ),
      adjustmentPence: Math.round(
        (Number.parseFloat(adjustmentPounds || "0") || 0) * 100,
      ),
    });
  }, [
    lineMaths,
    discountPercent,
    discountPounds,
    shippingPounds,
    adjustmentPounds,
  ]);

  function applyTerms(preset: TermsPreset, fromIssue = issueDate) {
    setTermsPreset(preset);
    if (preset === "due_on_receipt") {
      setDueDate(fromIssue);
    } else if (preset === "net_7") {
      setDueDate(addDays(fromIssue, 7));
    } else if (preset === "net_14") {
      setDueDate(addDays(fromIssue, 14));
    } else if (preset === "net_30") {
      setDueDate(addDays(fromIssue, 30));
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

  function applyDescriptionSuggestion(index: number, description: string) {
    const match = templates.find(
      (t) => t.description.toLowerCase() === description.trim().toLowerCase(),
    );
    setLines((rows) =>
      rows.map((r, idx) => {
        if (idx !== index) return r;
        if (!match) return { ...r, description };
        return {
          description: match.description,
          quantity: String(match.quantity || 1),
          unitPricePounds: penceToPoundsInput(match.unitPricePence),
          vatRateBps: String(match.vatRateBps) as LineDraft["vatRateBps"],
        };
      }),
    );
  }

  function scrollToSendRecipient() {
    sendRecipientRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const input = sendRecipientRef.current?.querySelector("input");
    if (input instanceof HTMLInputElement) {
      window.setTimeout(() => input.focus(), 280);
    }
  }

  function applyBulkLines() {
    const parsed = bulkText
      .split(/\n/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => {
        const parts = row.split(/[\t,]/).map((p) => p.trim());
        return {
          description: parts[0] || "",
          quantity: parts[1] || "1",
          unitPricePounds: parts[2] || "0.00",
          vatRateBps: "2000" as const,
        };
      })
      .filter((r) => r.description);
    if (!parsed.length) {
      setError("Paste lines as description, qty, rate (one per row).");
      return;
    }
    setLines((rows) => {
      const onlyBlank =
        rows.length === 1 &&
        !rows[0].description.trim() &&
        Number(rows[0].unitPricePounds) === 0;
      return onlyBlank ? parsed : [...rows, ...parsed];
    });
    setBulkText("");
    setShowBulk(false);
    setError(null);
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
    if (last.termsConditions) setTermsConditions(last.termsConditions);
    setError(null);
  }

  function resetForm() {
    setLines([emptyLine()]);
    setNotes("Thanks for your business.");
    setOrderNumber("");
    setDiscountPercent("");
    setDiscountPounds("");
    setShippingPounds("");
    setAdjustmentPounds("");
    setTermsConditions("");
    setEnableOnlinePay(false);
    setArmedSendInvoiceId(null);
    setPaymentInstructions(defaultPaymentInstructions);
    const today = new Date().toISOString().slice(0, 10);
    setIssueDate(today);
    setTermsPreset("due_on_receipt");
    setDueDate(today);
  }

  function preparedLines() {
    return lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitPricePounds: l.unitPricePounds,
        vatRateBps: Number(l.vatRateBps) as 0 | 500 | 2000,
      }))
      .filter((l) => l.description.length > 0);
  }

  async function submitInvoice(
    status: "draft" | "sent" | "due",
    opts?: { keepArmed?: boolean },
  ) {
    setError(null);
    setOk(null);
    const linePayload = preparedLines();
    if (linePayload.length === 0) {
      throw new Error(
        "Add at least one item with a description in Item details before saving.",
      );
    }
    const invoice = await createClientInvoice({
      clientId,
      issueDate,
      dueDate,
      notes: notes || undefined,
      reference: orderNumber || undefined,
      paymentInstructions: paymentInstructions || undefined,
      status,
      orderNumber: orderNumber || undefined,
      paymentTerms: termsLabel(termsPreset),
      discountPounds: discountPounds || undefined,
      discountPercent: discountPercent || undefined,
      shippingPounds: shippingPounds || undefined,
      adjustmentPounds: adjustmentPounds || undefined,
      termsConditions: termsConditions || undefined,
      enableOnlinePay: enableOnlinePay && stripeConnected,
      lines: linePayload,
    });
    if (!opts?.keepArmed) {
      resetForm();
    } else {
      setLines([emptyLine()]);
      setOrderNumber("");
      setDiscountPercent("");
      setDiscountPounds("");
      setShippingPounds("");
      setAdjustmentPounds("");
      setEnableOnlinePay(false);
    }
    router.refresh();
    return invoice;
  }

  return (
    <div className="space-y-8 pb-24">
      {brandingIncomplete ? (
        <div className="rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          <p className="font-semibold">Personalise your invoices</p>
          <p className="mt-1 text-ink-soft">
            Logo, address and bank details are incomplete — invoices will show
            blank placeholders until you add practice branding.
          </p>
          <Link
            href="/settings/letterhead"
            className="mt-2 inline-flex font-semibold text-sea hover:underline"
          >
            Add branding in Practice branding →
          </Link>
        </div>
      ) : null}

      <div className="panel grid gap-4 p-5 sm:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Amount due
          </p>
          <p className="display mt-1 text-2xl text-ink">
            {money(dueTotals.amountDuePence)}
          </p>
          <p className="text-xs text-ink-soft">
            Open invoices (draft / sent / due)
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Overdue
          </p>
          <p className="display mt-1 text-2xl text-danger">
            {money(dueTotals.overduePence)}
          </p>
          <p className="text-xs text-ink-soft">
            {dueTotals.overdueCount} invoice
            {dueTotals.overdueCount === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Open count
          </p>
          <p className="display mt-1 text-2xl">{dueTotals.openCount}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Due soon
          </p>
          <p className="display mt-1 text-2xl text-violet">
            {dueTotals.dueSoonCount}
          </p>
        </div>
      </div>

      <form
        className="panel space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              await submitInvoice("due");
            } catch (err) {
              setError(
                messageFromUnknown(
                  err,
                  "Could not create the invoice. Check the lines and dates, then try again.",
                ),
              );
            }
          });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl text-ink">New invoice</h2>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold sm:col-span-2 lg:col-span-1">
            <span className="text-danger">*</span> Customer name
            <input
              className="input mt-1 font-normal"
              value={clientName}
              readOnly
              aria-readonly
            />
            <span className="mt-1 block text-xs font-normal text-ink-soft">
              Open another client card to invoice someone else.
            </span>
          </label>

          <label className="relative text-sm font-semibold">
            <span className="text-danger">*</span> Invoice #
            <div className="mt-1 flex gap-1">
              <input
                className="input flex-1 font-normal mono"
                value={previewInvoiceNumber}
                readOnly
              />
              <button
                type="button"
                className="btn btn-secondary px-3"
                title="Numbering settings"
                onClick={() => setShowNumberHint((v) => !v)}
              >
                ⚙
              </button>
            </div>
            {showNumberHint ? (
              <p className="mt-1 text-xs font-normal text-ink-soft">
                Auto-numbering uses your practice sequence (prefix + next).
                Ask an admin if you need the prefix or next number changed.
              </p>
            ) : null}
          </label>

          <label className="text-sm font-semibold">
            Order number
            <input
              className="input mt-1 font-normal"
              value={orderNumber}
              placeholder="Optional"
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          </label>

          <label className="text-sm font-semibold">
            <span className="text-danger">*</span> Invoice date
            <UkDateField className="input mt-1 font-normal" value={issueDate} required onChange={(iso) => {
                const next = iso;
                setIssueDate(next);
                if (termsPreset !== "custom") {
                  applyTerms(termsPreset, next);
                }
              }}
            />
          </label>

          <label className="text-sm font-semibold">
            Terms
            <select
              className="input mt-1 font-normal"
              value={termsPreset}
              onChange={(e) => applyTerms(e.target.value as TermsPreset)}
            >
              <option value="due_on_receipt">Due on Receipt</option>
              <option value="net_7">Net 7</option>
              <option value="net_14">Net 14</option>
              <option value="net_30">Net 30</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="text-sm font-semibold">
            <span className="text-danger">*</span> Due date
            <UkDateField className="input mt-1 font-normal" value={dueDate} required onChange={(iso) => {
                setTermsPreset("custom");
                setDueDate(iso);
              }}
            />
          </label>
        </div>

        {templates.length > 0 && (
          <div className="rounded-lg border border-line bg-white/60 p-3">
            <p className="text-sm font-semibold text-ink">
              Remembered items
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Products you have invoiced before — pick one or keep typing in
              Item details.
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

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid">
            <span className="col-span-5">Item details</span>
            <span className="col-span-2">Quantity</span>
            <span className="col-span-2">Rate</span>
            <span className="col-span-2">VAT</span>
            <span className="col-span-1 text-right">Amt</span>
          </div>
          {lines.map((line, i) => {
            const unit = Math.round(
              Number.parseFloat(line.unitPricePounds || "0") * 100,
            );
            const qty = Number(line.quantity) || 0;
            const lineNet = Number.isFinite(unit) ? Math.round(unit * qty) : 0;
            return (
              <div
                key={i}
                className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-12"
              >
                <input
                  className="input sm:col-span-5"
                  placeholder="Type or click to select an item"
                  value={line.description}
                  required
                  list={`invoice-templates-${clientId}`}
                  onChange={(e) =>
                    applyDescriptionSuggestion(i, e.target.value)
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
                  placeholder="0.00"
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
                  <option value="2000">20%</option>
                  <option value="500">5%</option>
                  <option value="0">0%</option>
                </select>
                <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                  <span className="mono text-sm font-semibold">
                    {money(lineNet)}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-danger"
                      onClick={() =>
                        setLines((rows) => rows.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <datalist id={`invoice-templates-${clientId}`}>
            {templates.map((t) => (
              <option key={t.id} value={t.description} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => setLines((rows) => [...rows, emptyLine()])}
            >
              + Add new row
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => setShowBulk((v) => !v)}
            >
              + Add items in bulk
            </button>
          </div>
          {showBulk ? (
            <div className="rounded-lg border border-line bg-mist/40 p-3">
              <p className="text-xs text-ink-soft">
                One line per row: description, quantity, rate (comma or tab).
              </p>
              <textarea
                className="input mt-2 min-h-[5rem] font-normal mono text-sm"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Bookkeeping · monthly,1,150.00"}
              />
              <button
                type="button"
                className="btn btn-primary mt-2 text-sm"
                onClick={applyBulkLines}
              >
                Add rows
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-semibold">
              Customer notes
              <textarea
                className="input mt-1 min-h-[4rem] font-normal"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <span className="mt-1 block text-xs font-normal text-ink-soft">
                Will be displayed on the invoice.
              </span>
            </label>
            <label className="block text-sm font-semibold">
              Terms &amp; conditions
              <textarea
                className="input mt-1 min-h-[4rem] font-normal"
                placeholder="Enter the terms and conditions of your business to be displayed in your transaction."
                value={termsConditions}
                onChange={(e) => setTermsConditions(e.target.value)}
              />
            </label>
            <div className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-soft">
              <p className="font-semibold text-ink">Attach file(s)</p>
              <p className="mt-1 text-xs">
                Upload up to 10 files (10MB each) from the client Documents tab
                for now. Direct invoice attachments ship next.
              </p>
              <Link
                href={`/clients/${clientId}`}
                className="mt-2 inline-flex font-semibold text-sea hover:underline"
              >
                Open client documents →
              </Link>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-mist/40 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Sub total</span>
              <span className="mono font-semibold">{money(totals.subtotalPence)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-soft">Discount</span>
              <div className="flex items-center gap-2">
                <input
                  className="input w-16 py-1 text-right font-normal"
                  placeholder="%"
                  value={discountPercent}
                  onChange={(e) => {
                    setDiscountPercent(e.target.value);
                    if (e.target.value) setDiscountPounds("");
                  }}
                />
                <span className="text-ink-soft">or £</span>
                <input
                  className="input w-24 py-1 text-right font-normal mono"
                  placeholder="0.00"
                  value={discountPounds}
                  onChange={(e) => {
                    setDiscountPounds(e.target.value);
                    if (e.target.value) setDiscountPercent("");
                  }}
                />
                <span className="mono w-20 text-right font-semibold">
                  {money(totals.discountPence)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-soft">Shipping charges</span>
              <input
                className="input w-28 py-1 text-right font-normal mono"
                placeholder="0.00"
                value={shippingPounds}
                onChange={(e) => setShippingPounds(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-soft">Adjustment</span>
              <input
                className="input w-28 py-1 text-right font-normal mono"
                placeholder="0.00"
                value={adjustmentPounds}
                onChange={(e) => setAdjustmentPounds(e.target.value)}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">VAT</span>
              <span className="mono font-semibold">{money(totals.vatPence)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <span className="font-semibold text-ink">Total (£)</span>
              <span className="mono text-xl font-semibold text-ink">
                {money(totals.totalPence)}
              </span>
            </div>
          </div>
        </div>

        <label className="block text-sm font-semibold">
          Payment instructions
          <textarea
            className="input mt-1 min-h-[3.5rem] font-normal"
            placeholder="Bank name, sort code, account number…"
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
          />
        </label>

        <div className="rounded-xl border border-sea/25 bg-sea/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Online card pay</p>
              <p className="mt-1 text-sm text-ink-soft">
                {stripeConnected
                  ? "Stripe is connected — enable online pay on this invoice."
                  : "Connect Stripe to take card payments. You create and manage the Stripe account; funds go to you."}
              </p>
              {!stripeConnected ? (
                <a
                  href="/api/stripe/connect/start"
                  className="btn btn-primary mt-3 text-sm"
                >
                  Connect Stripe
                </a>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--sea)]"
                checked={enableOnlinePay}
                disabled={!stripeConnected}
                onChange={(e) => setEnableOnlinePay(e.target.checked)}
              />
              Enable online pay
            </label>
          </div>
        </div>

        <div
          ref={sendRecipientRef}
          id="invoice-send-recipient"
          className={`rounded-xl border p-4 transition-shadow ${
            armedSendInvoiceId
              ? "border-sea bg-sea/5 shadow-[0_0_0_3px_rgba(45,122,120,0.15)]"
              : "border-line bg-mist/30"
          }`}
        >
          <h3 className="text-sm font-semibold text-ink">
            Receiver email
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            Save and send scrolls here first so you can check the address.
            Press Save and send again to email the invoice.
          </p>
          <label className="mt-3 block text-sm font-semibold">
            Send invoice to
            <input
              type="email"
              className="input mt-1 max-w-md font-normal"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="client@firm.co.uk"
              autoComplete="email"
            />
          </label>
          <p className="mt-2 text-xs text-ink-soft">
            From shows your practice name; replies go to your practice email in{" "}
            <Link
              href="/settings/letterhead"
              className="font-semibold text-sea hover:underline"
            >
              Practice branding
            </Link>
            .
          </p>
          {armedSendInvoiceId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-sea">
                Invoice saved — confirm the address, then press Confirm &amp;
                send.
              </p>
              <a
                href={`/clients/${clientId}/invoices/${armedSendInvoiceId}/print?download=1`}
                className="btn btn-secondary text-sm"
                target="_blank"
                rel="noreferrer"
              >
                Download PDF
              </a>
            </div>
          ) : null}
        </div>
      </form>

      <FormErrorBanner error={error} title="Couldn’t continue" />
      {ok ? <p className="text-sm font-semibold text-ok">{ok}</p> : null}

      <div className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">
            Invoices ({invoices.length})
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Outstanding: {money(dueTotals.amountDuePence)}
            {dueTotals.overdueCount
              ? ` · ${money(dueTotals.overduePence)} overdue`
              : ""}
          </p>
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
              className={`px-4 py-4 ${isInvoiceOverdue(inv) ? "client-card--overdue" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono font-semibold text-ink">
                    {inv.invoiceNumber}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Issued {inv.issueDate} · Due {inv.dueDate}
                    {isInvoiceOverdue(inv) ? " · Overdue" : ""}
                    {inv.reference ? ` · Ref ${inv.reference}` : ""}
                    {inv.subject ? ` · ${inv.subject}` : ""}
                  </p>
                  <ul className="mt-2 text-sm text-ink-soft">
                    {inv.lines.map((l, i) => (
                      <li key={i}>
                        {l.description} × {l.quantity}
                      </li>
                    ))}
                  </ul>
                  {inv.enableOnlinePay && inv.payToken ? (
                    <p className="mt-2 text-xs">
                      <a
                        href={`/pay/${inv.payToken}`}
                        className="font-semibold text-sea hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Pay link
                      </a>
                    </p>
                  ) : null}
                  {emailingId === inv.id ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-line bg-mist/40 p-3">
                      <label className="block text-xs font-semibold text-ink">
                        Send to
                        <input
                          type="email"
                          className="input mt-1 block w-full max-w-sm"
                          value={emailTo}
                          onChange={(e) => setEmailTo(e.target.value)}
                          placeholder="client@firm.co.uk"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              setError(null);
                              setOk(null);
                              try {
                                const res = await sendClientInvoiceEmail({
                                  invoiceId: inv.id,
                                  toEmail: emailTo,
                                });
                                if (!res.ok) {
                                  setError(res.error);
                                  return;
                                }
                                setOk(
                                  res.delivery === "logged"
                                    ? `Invoice saved, but email was not delivered — ask your admin to configure outbound email (Resend).`
                                    : `Invoice emailed to ${res.toEmail}.`,
                                );
                                setEmailingId(null);
                                router.refresh();
                              } catch (err) {
                                setError(
                                  messageFromUnknown(
                                    err,
                                    "Could not email invoice",
                                  ),
                                );
                              }
                            })
                          }
                        >
                          {pending ? "Sending…" : "Send email"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost text-sm"
                          onClick={() => setEmailingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="w-full sm:w-auto sm:text-right">
                  <p className="mono text-lg font-semibold">
                    {money(inv.totalPence)}
                  </p>
                  <span className={statusBadge(inv.status)}>{inv.status}</span>
                  <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
                    <a
                      href={`/clients/${clientId}/invoices/${inv.id}/print?download=1`}
                      className="btn btn-secondary px-3 py-1.5 text-sm"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                    <Link
                      href={`/clients/${clientId}/invoices/${inv.id}/print`}
                      className="btn btn-ghost px-3 py-1.5 text-sm"
                      target="_blank"
                    >
                      Preview
                    </Link>
                    {inv.status !== "void" ? (
                      <button
                        type="button"
                        className="btn btn-secondary px-3 py-1.5 text-sm"
                        disabled={pending}
                        onClick={() => {
                          setEmailingId(inv.id);
                          setEmailTo(clientEmail ?? "");
                          setError(null);
                          setOk(null);
                        }}
                      >
                        Email
                      </button>
                    ) : null}
                    {inv.status === "draft" && (
                      <button
                        type="button"
                        className="btn btn-ghost px-3 py-1.5 text-sm"
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
                        className="btn btn-ghost px-3 py-1.5 text-sm"
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
                        className="btn btn-ghost px-3 py-1.5 text-sm text-danger"
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

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(10,10,10,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await submitInvoice("draft");
                  setOk("Draft saved.");
                } catch (err) {
                  setError(
                    messageFromUnknown(err, "Could not save draft."),
                  );
                }
              })
            }
          >
            Save as draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                setOk(null);
                try {
                  if (armedSendInvoiceId) {
                    if (!emailTo.trim()) {
                      setError(
                        "Enter the receiver email address, then press Save and send again.",
                      );
                      scrollToSendRecipient();
                      return;
                    }
                    const res = await sendClientInvoiceEmail({
                      invoiceId: armedSendInvoiceId,
                      toEmail: emailTo.trim(),
                    });
                    if (!res.ok) {
                      setError(res.error);
                      scrollToSendRecipient();
                      return;
                    }
                    setArmedSendInvoiceId(null);
                    setOk(
                      res.delivery === "logged"
                        ? `Invoice saved, but email was not delivered — ask your admin to configure outbound email (Resend).`
                        : `Invoice emailed to ${res.toEmail}.`,
                    );
                    router.refresh();
                    return;
                  }

                  const invoice = await submitInvoice("draft", {
                    keepArmed: true,
                  });
                  setArmedSendInvoiceId(invoice.id);
                  setOk(
                    "Invoice saved. Check the receiver email, then press Confirm & send to deliver.",
                  );
                  scrollToSendRecipient();
                } catch (err) {
                  setError(
                    messageFromUnknown(err, "Could not save or send invoice."),
                  );
                }
              })
            }
          >
            {pending
              ? armedSendInvoiceId
                ? "Sending…"
                : "Saving…"
              : armedSendInvoiceId
                ? "Confirm & send"
                : "Save and send"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => {
              resetForm();
              setError(null);
              setOk(null);
            }}
          >
            Cancel
          </button>
          {armedSendInvoiceId ? (
            <a
              href={`/clients/${clientId}/invoices/${armedSendInvoiceId}/print?download=1`}
              className="btn btn-secondary text-sm"
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          ) : null}
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold text-ink">
              Total amount:{" "}
              <span className="mono">{money(totals.totalPence)}</span>
            </p>
            <p className="text-xs text-ink-soft">
              Total quantity: {lineMaths.qty}
            </p>
          </div>
        </div>
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
  const totals = openInvoiceTotals(invoices);

  return (
    <Link
      href={`/clients/${clientId}/invoices`}
      className={`panel panel-interactive block p-5 ${
        totals.overdueCount ? "border-danger/35 ring-1 ring-danger/15" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl">{title}</h2>
        <span className="open-chip">Open</span>
      </div>
      <p className="mt-2 display text-2xl text-ink">
        {money(totals.amountDuePence)}
      </p>
      <p className="text-sm text-ink-soft">Amount due on open invoices</p>
      {totals.overdueCount > 0 && (
        <p className="mt-2 text-sm text-danger">
          {totals.overdueCount} overdue · {money(totals.overduePence)}
        </p>
      )}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Open</dt>
          <dd className="display text-2xl">{totals.openCount}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Due</dt>
          <dd className="display text-2xl text-violet">{totals.dueSoonCount}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Overdue</dt>
          <dd className="display text-2xl text-danger">{totals.overdueCount}</dd>
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
    </Link>
  );
}
