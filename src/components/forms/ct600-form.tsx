"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { prepareCt600, submitCt600, getCt600SubmitInfo, downloadCt600Draft } from "@/server/actions/ct600";
import { draftCt600FromTrialBalance } from "@/server/actions/trial-balance";
import { money } from "@/lib/format";
import { TrialBalanceUpload } from "@/components/forms/trial-balance-upload";
import { Ct600Questionnaire } from "@/components/forms/ct600-questionnaire";
import {
  CT600_FILING_STEPS,
  CT600_PHASES,
  type Ct600QuestionnaireAnswers,
} from "@/lib/hmrc/filing-guides";
import type { TrialBalance } from "@/server/trial-balance/map";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { FilingConfirmation } from "@/components/filing-confirmation";
import {
  GatewayCredentialsFields,
  gatewayCredentialsReady,
} from "@/components/forms/gateway-credentials-fields";

function penceToInput(n: number) {
  return (n / 100).toFixed(2);
}

export function Ct600Form({
  clientId,
  defaultPeriodStart,
  defaultPeriodEnd,
}: {
  clientId: string;
  defaultPeriodStart?: string;
  defaultPeriodEnd?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [periodStart, setPeriodStart] = useState(
    defaultPeriodStart ?? "2025-04-01",
  );
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd ?? "2026-03-31");
  const [filingMode, setFilingMode] = useState<
    "ct600" | "accounts" | "both"
  >("ct600");
  const [companyType, setCompanyType] = useState<
    "micro" | "private" | "dormant" | "charity"
  >("micro");
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [figures, setFigures] = useState<Record<string, string> | null>(null);
  const [questionnaireOk, setQuestionnaireOk] = useState(false);
  const [questionnaire, setQuestionnaire] = useState<Ct600QuestionnaireAnswers>(
    { associated_companies: 0 },
  );
  const [validationIssues, setValidationIssues] = useState<
    Array<{ code: string; message: string; blocking?: boolean }>
  >([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [taxable, setTaxable] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ggUserId, setGgUserId] = useState("");
  const [ggPassword, setGgPassword] = useState("");
  const [ctLive, setCtLive] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    ok: boolean;
    kind: string;
    title: string;
    subtitle?: string;
    correlationId?: string | null;
    details?: Array<{ label: string; value: string }>;
  } | null>(null);

  useEffect(() => {
    void getCt600SubmitInfo()
      .then((info) => setCtLive(info.live))
      .catch(() => setCtLive(false));
  }, []);

  const phase = CT600_FILING_STEPS[step]?.phase ?? 0;

  if (confirmation) {
    return (
      <FilingConfirmation
        ok={confirmation.ok}
        kind={confirmation.kind}
        title={confirmation.title}
        subtitle={confirmation.subtitle}
        correlationId={confirmation.correlationId}
        details={confirmation.details}
        onDone={() => {
          setConfirmation(null);
          setGgPassword("");
          router.refresh();
        }}
        onRetry={() => {
          setConfirmation(null);
          setError(null);
        }}
      />
    );
  }

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
          <FormErrorBanner error={error} />
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
            onComplete={(answers, ok) => {
              setQuestionnaire(answers);
              setQuestionnaireOk(ok);
            }}
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
                      questionnaire,
                    });
                    setDraftId(res.draft.id);
                    setTaxable(res.draft.taxableProfitPence ?? null);
                    setPreview(res.xmlPreview);
                    setValidationIssues(res.validation.issues ?? []);
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
          <FormErrorBanner error={error} />
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
          {validationIssues.length > 0 && (
            <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm">
              <p className="font-semibold text-ink">
                {validationIssues.some((i) => i.blocking !== false)
                  ? "Resolve before live submit"
                  : "Review notes"}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft">
                {validationIssues.map((i) => (
                  <li key={i.code}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}
          {draftId && (
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-ink">Download before you submit</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Save and review the filled CT600 PDF before proceeding.
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      const pack = await downloadCt600Draft(
                        draftId,
                        clientId,
                        "ct600",
                      );
                      for (const file of pack.files) {
                        const bin = atob(file.base64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) {
                          bytes[i] = bin.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: file.mimeType });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Download failed",
                      );
                    }
                  })
                }
                className="group flex w-full max-w-md items-start gap-3 rounded-2xl border border-line bg-white p-4 text-left transition hover:border-sea/40 hover:bg-sea/[0.03] disabled:opacity-50"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sea/10 text-sea"
                  aria-hidden
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 15h6" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">CT600 form</span>
                  <span className="mt-0.5 block text-sm text-ink-soft">
                    {pending
                      ? "Preparing your PDF…"
                      : "Filled CT600 with your company details and return figures."}
                  </span>
                  {!pending && (
                    <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sea group-hover:underline">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="12" x2="12" y2="3" />
                      </svg>
                      Download CT600 PDF
                    </span>
                  )}
                </span>
              </button>
            </div>
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
            {ctLive
              ? "Live submit — enter the client's Government Gateway User ID and password."
              : "Sandbox / test submit — optional if test credentials are in env."}
          </p>
          <GatewayCredentialsFields
            clientId={clientId}
            ggUserId={ggUserId}
            ggPassword={ggPassword}
            onUserIdChange={setGgUserId}
            onPasswordChange={setGgPassword}
            rememberPassword={rememberPassword}
            onRememberPasswordChange={setRememberPassword}
            hasSavedPassword={hasSavedPassword}
            onHasSavedPasswordChange={setHasSavedPassword}
            live={ctLive}
          />
          <FormErrorBanner error={error} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              pending ||
              (ctLive &&
                !gatewayCredentialsReady(ggUserId, ggPassword, hasSavedPassword))
            }
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  const res = await submitCt600(draftId, clientId, {
                    senderId: ggUserId.trim() || undefined,
                    senderPassword: ggPassword.trim() || undefined,
                    useSavedPassword: hasSavedPassword && !ggPassword.trim(),
                    rememberPassword,
                  });
                  if (rememberPassword && ggPassword.trim()) {
                    setHasSavedPassword(true);
                    setRememberPassword(false);
                  }
                  setConfirmation({
                    ok: Boolean(res.res.ok),
                    kind: "Corporation Tax · CT600",
                    title: res.res.ok ? "CT600 accepted" : "CT600 rejected",
                    subtitle: res.res.ok
                      ? "Return lodged with HMRC Transaction Engine."
                      : res.res.errorMessage ??
                        "HMRC did not accept this return.",
                    correlationId: res.res.correlationId,
                    details: [
                      {
                        label: "Period",
                        value: `${periodStart} → ${periodEnd}`,
                      },
                    ],
                  });
                  setGgPassword("");
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Submit failed");
                }
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
