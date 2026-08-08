"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCt600, submitCt600 } from "@/server/actions/ct600";
import { draftCt600FromTrialBalance } from "@/server/actions/trial-balance";
import { money } from "@/lib/format";
import { TrialBalanceUpload } from "@/components/forms/trial-balance-upload";
import { Ct600Questionnaire } from "@/components/forms/ct600-questionnaire";
import { CT600_FILING_STEPS } from "@/lib/hmrc/filing-guides";
import type { TrialBalance } from "@/server/trial-balance/map";

function penceToInput(n: number) {
  return (n / 100).toFixed(2);
}

export function Ct600Form({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [periodStart, setPeriodStart] = useState("2025-04-01");
  const [periodEnd, setPeriodEnd] = useState("2026-03-31");
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [figures, setFigures] = useState<Record<string, string> | null>(null);
  const [questionnaireOk, setQuestionnaireOk] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [taxable, setTaxable] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CT600_FILING_STEPS.map((s, i) => (
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Period start</label>
            <input
              type="date"
              className="input"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Period end</label>
            <input
              type="date"
              className="input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(1)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <TrialBalanceUpload
            clientId={clientId}
            purpose="ct600"
            periodStart={periodStart}
            periodEnd={periodEnd}
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
              className="btn btn-primary"
              disabled={!tb || pending}
              onClick={() =>
                start(async () => {
                  if (!tb) return;
                  setError(null);
                  try {
                    const drafted = await draftCt600FromTrialBalance(tb.id);
                    const f = drafted.figures;
                    setFigures({
                      turnoverPounds: penceToInput(Number(f.turnoverPence)),
                      costOfSalesPounds: penceToInput(Number(f.costOfSalesPence)),
                      administrativeExpensesPounds: penceToInput(
                        Number(f.administrativeExpensesPence),
                      ),
                      otherIncomePounds: penceToInput(Number(f.otherIncomePence)),
                      tangibleAssetsPounds: penceToInput(
                        Number(f.tangibleAssetsPence),
                      ),
                      cashAtBankPounds: penceToInput(Number(f.cashAtBankPence)),
                      debtorsPounds: penceToInput(Number(f.debtorsPence)),
                      creditorsPounds: penceToInput(Number(f.creditorsPence)),
                      calledUpShareCapitalPounds: penceToInput(
                        Number(f.calledUpShareCapitalPence),
                      ),
                      profitAndLossAccountPounds: penceToInput(
                        Number(f.profitAndLossAccountPence),
                      ),
                    });
                    setStep(2);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Map to CT figures
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {step === 2 && figures && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const next: Record<string, string> = {};
            for (const [k, v] of fd.entries()) next[k] = String(v);
            setFigures(next);
            setStep(3);
          }}
        >
          {(
            [
              ["turnoverPounds", "Turnover"],
              ["costOfSalesPounds", "Cost of sales"],
              ["administrativeExpensesPounds", "Admin expenses"],
              ["otherIncomePounds", "Other income"],
              ["tangibleAssetsPounds", "Tangible assets"],
              ["cashAtBankPounds", "Cash at bank"],
              ["debtorsPounds", "Debtors"],
              ["creditorsPounds", "Creditors"],
              ["calledUpShareCapitalPounds", "Share capital"],
              ["profitAndLossAccountPounds", "P&L / reserves"],
            ] as const
          ).map(([name, label]) => (
            <div key={name}>
              <label className="label">{label}</label>
              <input
                name={name}
                className="input mono"
                defaultValue={figures[name] ?? "0.00"}
                required
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Continue to checklist
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Ct600Questionnaire
            onComplete={(_a, ok) => setQuestionnaireOk(ok)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!questionnaireOk || pending || !figures}
              onClick={() =>
                start(async () => {
                  if (!figures) return;
                  setError(null);
                  try {
                    const res = await prepareCt600({
                      clientId,
                      periodStart,
                      periodEnd,
                      turnoverPounds: figures.turnoverPounds,
                      costOfSalesPounds: figures.costOfSalesPounds,
                      administrativeExpensesPounds:
                        figures.administrativeExpensesPounds,
                      otherIncomePounds: figures.otherIncomePounds,
                      tangibleAssetsPounds: figures.tangibleAssetsPounds,
                      cashAtBankPounds: figures.cashAtBankPounds,
                      debtorsPounds: figures.debtorsPounds,
                      creditorsPounds: figures.creditorsPounds,
                      calledUpShareCapitalPounds:
                        figures.calledUpShareCapitalPounds,
                      profitAndLossAccountPounds:
                        figures.profitAndLossAccountPounds,
                    });
                    setDraftId(res.draft.id);
                    setTaxable(res.draft.taxableProfitPence);
                    setPreview(res.xmlPreview);
                    setStep(4);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Build CT600 XML
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          {taxable != null && (
            <p className="text-sm">
              Taxable profit:{" "}
              <span className="mono font-semibold">{money(taxable)}</span>
            </p>
          )}
          {preview && (
            <pre className="max-h-48 overflow-auto rounded-md bg-ink p-3 text-xs text-sand">
              {preview}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(3)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draftId || pending}
              onClick={() => setStep(5)}
            >
              Proceed to submit
            </button>
          </div>
        </div>
      )}

      {step === 5 && draftId && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await submitCt600(draftId, clientId);
              setMessage(`Submitted · ${res.res.correlationId}`);
              router.refresh();
            })
          }
        >
          Submit to HMRC CT Online
        </button>
      )}

      {message && <p className="text-sm font-semibold text-ok">{message}</p>}
    </div>
  );
}
