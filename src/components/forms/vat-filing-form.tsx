"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  prepareVatReturn,
  submitPreparedVatReturn,
} from "@/server/actions/vat";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { money } from "@/lib/format";

type Obligation = {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: string;
};

type Boxes = {
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
};

export function VatFilingForm({
  clientId,
  obligations,
}: {
  clientId: string;
  obligations: Obligation[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"prepare" | "review" | "done">("prepare");
  const [selected, setSelected] = useState(obligations[0]?.periodKey ?? "");
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const obligation = obligations.find((o) => o.periodKey === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["Prepare", "prepare"],
            ["Review", "review"],
            ["Submit", "done"],
          ] as const
        ).map(([label, key], i) => {
          const done =
            (key === "prepare" && step !== "prepare") ||
            (key === "review" && step === "done");
          const active =
            (step === "prepare" && key === "prepare") ||
            (step === "review" && key === "review") ||
            (step === "done" && key === "done");
          return (
            <span
              key={label}
              className="filing-step"
              data-active={active || undefined}
              data-done={done || undefined}
            >
              <span>{i + 1}</span>
              {label}
            </span>
          );
        })}
      </div>

      <div>
        <label className="label">Obligation</label>
        <select
          className="input"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setStep("prepare");
            setBoxes(null);
          }}
        >
          {obligations.map((o) => (
            <option key={o.periodKey} value={o.periodKey}>
              {o.periodKey}: {o.start} → {o.end} (due {o.due}) [{o.status}]
            </option>
          ))}
        </select>
      </div>

      {step === "prepare" && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !obligation}
          onClick={() =>
            start(async () => {
              if (!obligation) return;
              const draft = await prepareVatReturn({
                clientId,
                periodKey: obligation.periodKey,
                periodStart: obligation.start,
                periodEnd: obligation.end,
              });
              setBoxes(draft.boxes as Boxes);
              setStep("review");
              router.refresh();
            })
          }
        >
          Prepare return from books
        </button>
      )}

      {boxes && step !== "prepare" && (
        <div className="panel p-4">
          <h3 className="font-semibold">VAT boxes</h3>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {(
              [
                ["Box 1 VAT due on sales", boxes.vatDueSales],
                ["Box 2 VAT due on acquisitions", boxes.vatDueAcquisitions],
                ["Box 3 Total VAT due", boxes.totalVatDue],
                ["Box 4 VAT reclaimed", boxes.vatReclaimedCurrPeriod],
                ["Box 5 Net VAT", boxes.netVatDue],
                ["Box 6 Sales ex VAT", boxes.totalValueSalesExVAT],
                ["Box 7 Purchases ex VAT", boxes.totalValuePurchasesExVAT],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2 border-b border-line/60 py-1">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="mono">{money(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {step === "review" && obligation && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const fraudMetadata = gatherFraudMetadata();
              const res = await submitPreparedVatReturn({
                clientId,
                periodKey: obligation.periodKey,
                periodStart: obligation.start,
                periodEnd: obligation.end,
                fraudMetadata,
              });
              setMessage(
                `Submitted · ${(res as { hmrcFormBundleNumber?: string }).hmrcFormBundleNumber ?? "accepted"}`,
              );
              setStep("done");
              router.refresh();
            })
          }
        >
          Submit to HMRC
        </button>
      )}

      {message && <p className="text-sm font-semibold text-ok">{message}</p>}
    </div>
  );
}
