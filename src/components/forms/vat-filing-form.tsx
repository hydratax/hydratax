"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  prepareVatReturn,
  submitPreparedVatReturn,
} from "@/server/actions/vat";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { money } from "@/lib/format";
import { TrialBalanceUpload } from "@/components/forms/trial-balance-upload";
import { VAT_BOX_DEFINITIONS, VAT_FILING_STEPS } from "@/lib/hmrc/filing-guides";
import type { TrialBalance } from "@/server/trial-balance/map";

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
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(obligations[0]?.periodKey ?? "");
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const obligation = obligations.find((o) => o.periodKey === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VAT_FILING_STEPS.map((s, i) => (
          <span
            key={s.id}
            className="filing-step"
            data-active={step === i || undefined}
            data-done={step > i || undefined}
          >
            <span>{i + 1}</span>
            {s.label}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <label className="label">Obligation</label>
          <select
            className="input"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setBoxes(null);
              setTb(null);
            }}
          >
            {obligations.map((o) => (
              <option key={o.periodKey} value={o.periodKey}>
                {o.periodKey}: {o.start} → {o.end} (due {o.due}) [{o.status}]
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!obligation}
            onClick={() => setStep(1)}
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && obligation && (
        <div className="space-y-4">
          <TrialBalanceUpload
            clientId={clientId}
            purpose="vat"
            periodStart={obligation.start}
            periodEnd={obligation.end}
            onReady={setTb}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(0)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const draft = await prepareVatReturn({
                    clientId,
                    periodKey: obligation.periodKey,
                    periodStart: obligation.start,
                    periodEnd: obligation.end,
                  });
                  setBoxes(draft.boxes as Boxes);
                  setStep(3);
                  router.refresh();
                })
              }
            >
              Use books instead
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !tb}
              onClick={() => setStep(2)}
            >
              Map &amp; continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && obligation && tb && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Mappings saved on the trial balance. Prepare nine-box draft from
            mapped accounts.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const draft = await prepareVatReturn({
                    clientId,
                    periodKey: obligation.periodKey,
                    periodStart: obligation.start,
                    periodEnd: obligation.end,
                    trialBalanceId: tb.id,
                  });
                  setBoxes(draft.boxes as Boxes);
                  setStep(3);
                  router.refresh();
                })
              }
            >
              Prepare VAT boxes
            </button>
          </div>
        </div>
      )}

      {step >= 3 && boxes && (
        <div className="panel p-4">
          <h3 className="font-semibold">Nine VAT boxes</h3>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {VAT_BOX_DEFINITIONS.map((def) => (
              <div
                key={def.id}
                className="flex justify-between gap-2 border-b border-line/60 py-1"
              >
                <dt className="text-ink-soft">{def.label}</dt>
                <dd className="mono">{money(boxes[def.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {step === 3 && obligation && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep(tb ? 2 : 1)}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep(4)}
          >
            Confirm figures
          </button>
        </div>
      )}

      {step === 4 && obligation && (
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
              setStep(5);
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
