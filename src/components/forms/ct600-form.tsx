"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareCt600, submitCt600 } from "@/server/actions/ct600";
import { draftCt600FromTrialBalance } from "@/server/actions/trial-balance";
import { money } from "@/lib/format";
import { TrialBalanceUpload } from "@/components/forms/trial-balance-upload";
import { Ct600Questionnaire } from "@/components/forms/ct600-questionnaire";
import { CT600_FILING_STEPS, CT600_PHASES } from "@/lib/hmrc/filing-guides";
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
  const [filingMode, setFilingMode] = useState<
    "ct600" | "accounts" | "both"
  >("ct600");
  const [companyType, setCompanyType] = useState<
    "micro" | "private" | "dormant" | "charity"
  >("micro");
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [figures, setFigures] = useState<Record<string, string> | null>(null);
  const [questionnaireOk, setQuestionnaireOk] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [taxable, setTaxable] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phase = CT600_FILING_STEPS[step]?.phase ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CT600_PHASES.map((p, i) => (
          <span
            key={p.id}
            className="filing-step"
            data-active={phase === i || undefined}
            data-done={phase > i || undefined}
          >
            <span>{i + 1}</span>
            {p.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-soft">
        Step: {CT600_FILING_STEPS[step]?.label}
      </p>

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <p className="label">Company type</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["micro", "Micro-entity company"],
                  ["private", "Private Ltd company"],
                  ["dormant", "Dormant company"],
                  ["charity", "Charitable org"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    companyType === id
                      ? "border-sea bg-sea text-white"
                      : "border-line bg-white text-ink"
                  }`}
                  onClick={() => setCompanyType(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Select what you wish to file</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["ct600", "Corporation Tax only"],
                  ["accounts", "Accounts only"],
                  ["both", "Corporation Tax and Accounts"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    filingMode === id
                      ? "border-sea bg-sea text-white"
                      : "border-line bg-white text-ink"
                  }`}
                  onClick={() => setFilingMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              {filingMode === "accounts"
                ? "Accounts-only path opens the Companies House annual accounts service after figures are captured."
                : filingMode === "both"
                  ? "Prepare CT600 figures here, then file accounts separately from Annual accounts."
                  : "Corporation Tax (CT600) return for HMRC CT Online."}
            </p>
          </div>
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
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep(1)}
          >
            Continue
          </button>
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
        <div className="space-y-4">
          <h3 className="display text-2xl text-ink">Review documents</h3>
          <p className="text-sm text-ink-soft">
            Package ready for period {periodStart} → {periodEnd}
            {filingMode !== "ct600" ? ` · includes accounts path` : ""}.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Tax computation",
                body:
                  taxable != null
                    ? `Taxable profit ${money(taxable)}`
                    : "Built from entered figures",
              },
              {
                title: "CT600 form",
                body: "XML draft for HMRC CT Online",
              },
              {
                title: "Full accounts",
                body:
                  filingMode === "ct600"
                    ? "Not selected for this filing"
                    : "Prepare via Annual accounts when ready",
              },
              {
                title: "Filleted accounts",
                body:
                  filingMode === "ct600"
                    ? "Not selected for this filing"
                    : "Companies House machine-readable set",
              },
            ].map((doc) => (
              <article
                key={doc.title}
                className="rounded-xl border border-line bg-white p-4"
              >
                <h4 className="font-semibold text-ink">{doc.title}</h4>
                <p className="mt-1 text-sm text-ink-soft">{doc.body}</p>
              </article>
            ))}
          </div>
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
              Edit form
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
        <div className="space-y-4">
          <h3 className="display text-2xl text-ink">Submit return</h3>
          <p className="text-sm text-ink-soft">
            Submit Corporation Tax to HMRC. Ensure UTR and Government Gateway /
            HMRC credentials are connected in Settings.
          </p>
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
            {pending ? "Submitting…" : "Submit Corporation Tax to HMRC"}
          </button>
        </div>
      )}

      {message && <p className="text-sm font-semibold text-ok">{message}</p>}
    </div>
  );
}
