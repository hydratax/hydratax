"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAndSubmitPayRun,
  enableEmployerPayroll,
  importTimesheet,
  prepareAmendedPayRun,
  previewPayRun,
  reversePayslip,
  savePayRun,
  sendPayrollPack,
  timesheetTemplateBase64,
  type PayRunPreview,
  type PayrollEmployee,
} from "@/server/actions/payroll";
import { isPayrollRtiSubmitted } from "@/lib/payroll-client-status";
import { PayrollDocumentsHub } from "@/components/forms/payroll-documents-hub";
import { defaultPayPeriod } from "@/lib/payroll";
import { money } from "@/lib/format";
import type { PayFrequency, PayLine } from "@/server/hmrc/payroll";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { FilingConfirmation } from "@/components/filing-confirmation";
import { PayrollSettingsPanel } from "@/components/forms/payroll-settings-panel";
import { PayrollEmployeeCards } from "@/components/forms/payroll-employee-cards";
import { AbbrInfo, AbbrInfoScope } from "@/components/desk/abbr-info";
import type { PayrollDeskSettings } from "@/lib/desk-profile";

type RunRow = {
  id?: string;
  payDate?: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
  kind?: string;
  payFrequency?: string;
  hmrcCorrelationId?: string | null;
  totals?: { grossPence?: number; netPence?: number };
  lines?: PayLine[];
};

export function PayrollWorkspace({
  clientId,
  clientName,
  hmrcLive: _hmrcLive = false,
  payeRef,
  accountsOfficeRef,
  isEmployer,
  employees,
  payRuns,
  hasPackPassword,
  contactEmail,
  payrollSettings,
}: {
  clientId: string;
  clientName: string;
  /** True when HMRC_ENV=production (live Transaction Engine). */
  hmrcLive?: boolean;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  isEmployer: boolean;
  employees: PayrollEmployee[];
  payRuns: RunRow[];
  hasPackPassword: boolean;
  contactEmail: string | null;
  payrollSettings?: PayrollDeskSettings | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"run" | "people" | "history" | "settings">(
    "run",
  );
  const frequencyFromHistory = payRuns.find(
    (p) => String(p.kind ?? "FPS") === "FPS",
  )?.payFrequency;
  const frequency: PayFrequency =
    payrollSettings?.payFrequency === "W1" ||
    payrollSettings?.payFrequency === "M1"
      ? payrollSettings.payFrequency
      : frequencyFromHistory === "W1"
        ? "W1"
        : "M1";
  const defaults = useMemo(() => defaultPayPeriod(frequency), [frequency]);
  const [payDate, setPayDate] = useState(defaults.payDate);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [preview, setPreview] = useState<PayRunPreview | null>(null);
  /** Figures stay hidden until Generate payslips in this visit. */
  const [figuresUnlocked, setFiguresUnlocked] = useState(false);
  const [pending, start] = useTransition();
  /** Which control is busy — only that button shows Working. */
  const [activeAction, setActiveAction] = useState<string | null>(null);
  /** Employees selected for FPS submit. */
  const [selectedForSubmit, setSelectedForSubmit] = useState<Set<string>>(
    () => new Set(),
  );
  const submitSelectionTouched = useRef(false);
  const [focusEmployeeId, setFocusEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    ok: boolean;
    kind: string;
    title: string;
    subtitle?: string;
    correlationId?: string | null;
    details?: Array<{ label: string; value: string }>;
  } | null>(null);

  /** All FPS rows for this payday (filed + any leftover unfiled after partial submit). */
  const periodRuns = useMemo(
    () =>
      payRuns.filter(
        (p) =>
          String(p.payDate) === payDate &&
          String(p.kind ?? "FPS") === "FPS" &&
          String(p.status) !== "rejected",
      ),
    [payRuns, payDate],
  );
  const filedPeriodRun = periodRuns.find((p) => isPayrollRtiSubmitted(p));
  const unfiledPeriodRun = periodRuns.find((p) => !isPayrollRtiSubmitted(p));
  /** Prefer unfiled ready for generate/view when present; else the filed run. */
  const periodRun = unfiledPeriodRun ?? filedPeriodRun;
  const periodRunSubmitted = Boolean(filedPeriodRun) && !unfiledPeriodRun;
  const existingForPeriod = (() => {
    const run = periodRun ?? filedPeriodRun;
    if (!run) return undefined;
    const lines = Array.isArray(run.lines) ? run.lines : [];
    if (lines.length > 0 && lines.every((l) => Boolean(l.reversed))) {
      return undefined;
    }
    return run;
  })();

  type SlipStatus =
    | "none"
    | "calculated"
    | "prepared"
    | "submitted"
    | "reversed";
  const roster = useMemo(() => {
    const active = employees
      .filter((e) => e.active)
      .sort((a, b) =>
        `${a.surname} ${a.forename}`.localeCompare(
          `${b.surname} ${b.forename}`,
          "en-GB",
        ),
      );
    const filedByEmp = new Map<string, { line: PayLine; runId: string }>();
    const readyByEmp = new Map<string, { line: PayLine; runId: string }>();
    for (const run of periodRuns) {
      const runId = String(run.id ?? "");
      if (!runId) continue;
      const lines = Array.isArray(run.lines) ? run.lines : [];
      const filed = isPayrollRtiSubmitted(run);
      for (const line of lines) {
        const slot = { line, runId };
        if (filed) filedByEmp.set(line.employeeId, slot);
        else readyByEmp.set(line.employeeId, slot);
      }
    }
    const previewById = new Map(
      (preview?.lines ?? []).map((l) => [l.employeeId, l]),
    );
    return active.map((emp) => {
      const filed = filedByEmp.get(emp.id);
      const ready = readyByEmp.get(emp.id);
      const saved = filed ?? ready;
      const calc = previewById.get(emp.id);
      let fileStatus: SlipStatus = "none";
      if (filed?.line.reversed || ready?.line.reversed) fileStatus = "reversed";
      else if (filed && !filed.line.reversed) fileStatus = "submitted";
      else if (ready && !ready.line.reversed) fileStatus = "prepared";
      else if (calc) fileStatus = "calculated";

      // Status + money only after Calculate / Generate this visit.
      let status: SlipStatus = "none";
      let line: PayLine | null = null;
      if (figuresUnlocked) {
        status =
          fileStatus === "none" && calc ? "calculated" : fileStatus;
        line =
          calc ??
          (saved && !saved.line.reversed ? saved.line : null);
      }
      return {
        emp,
        line,
        status,
        hasSavedSlip: Boolean(saved && !saved.line.reversed),
        slipRunId: saved?.runId ?? null,
      };
    });
  }, [employees, periodRuns, preview, figuresUnlocked]);

  // Ticks stay clear until the accountant chooses who to file — never auto-select.
  useEffect(() => {
    if (!figuresUnlocked) {
      submitSelectionTouched.current = false;
      setSelectedForSubmit(new Set());
      return;
    }
    const eligible = new Set(
      roster
        .filter(
          (r) => r.status === "prepared" || r.status === "calculated",
        )
        .map((r) => r.emp.id),
    );
    setSelectedForSubmit((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((id) => eligible.has(id)));
    });
  }, [figuresUnlocked, roster]);

  const eligibleForSubmitIds = useMemo(
    () =>
      figuresUnlocked
        ? roster
            .filter(
              (r) =>
                r.status === "prepared" || r.status === "calculated",
            )
            .map((r) => r.emp.id)
        : [],
    [figuresUnlocked, roster],
  );
  const allEligibleSelected =
    eligibleForSubmitIds.length > 0 &&
    eligibleForSubmitIds.every((id) => selectedForSubmit.has(id));
  const canEmailPack = Boolean(
    periodRun?.id &&
      contactEmail?.trim() &&
      hasPackPassword &&
      roster.some((r) => r.hasSavedSlip),
  );

  if (confirmation) {
    return (
      <div className="space-y-6 py-6">
        <FilingConfirmation
          ok={confirmation.ok}
          kind={confirmation.kind}
          title={confirmation.title}
          subtitle={confirmation.subtitle}
          correlationId={confirmation.correlationId}
          details={confirmation.details}
          onDone={() => {
            setConfirmation(null);
            setTab("history");
            router.refresh();
          }}
          onRetry={() => {
            setConfirmation(null);
            setError(null);
          }}
        />
      </div>
    );
  }

  const liveEmployees = employees.filter((e) => e.active).length;
  const staffGaps = useMemo(() => {
    return employees
      .filter((e) => e.active)
      .map((e) => {
        const missing: string[] = [];
        if (e.gender !== "M" && e.gender !== "F") missing.push("gender");
        if (!e.nino?.replace(/\s/g, "").trim()) missing.push("NINO");
        if (!e.forename?.trim() || !e.surname?.trim()) missing.push("name");
        const who =
          [e.forename, e.surname].filter(Boolean).join(" ") || e.payrollId;
        return missing.length ? { who, missing } : null;
      })
      .filter((g): g is { who: string; missing: string[] } => Boolean(g));
  }, [employees]);
  const staffReadyForPay = staffGaps.length === 0 && liveEmployees > 0;
  const employerRefsReady = Boolean(payeRef?.trim() && accountsOfficeRef?.trim());
  const canGenerate = staffReadyForPay && employerRefsReady;
  const canSubmit =
    canGenerate &&
    figuresUnlocked &&
    Boolean(existingForPeriod) &&
    !periodRunSubmitted &&
    selectedForSubmit.size > 0;

  const actions = [
    { id: "run" as const, label: "Run payroll" },
    { id: "people" as const, label: "Employees" },
    { id: "history" as const, label: "History & packs" },
    { id: "settings" as const, label: "Settings" },
  ];

  return (
    <AbbrInfoScope>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line/70 bg-sand/40 px-3 py-2 text-xs text-ink-soft">
        <span>
          <span className="font-semibold uppercase tracking-wide text-ink-soft/80">
            PAYE
          </span>{" "}
          <span className="paye-digits font-semibold text-ink">
            {payeRef || "Not set"}
          </span>
        </span>
        <span className="hidden text-line sm:inline" aria-hidden>
          ·
        </span>
        <span>
          <span className="font-semibold uppercase tracking-wide text-ink-soft/80">
            Accounts office
          </span>{" "}
          <span className="paye-digits font-semibold text-ink">
            {accountsOfficeRef || "Not set"}
          </span>
        </span>
        <span className="hidden text-line sm:inline" aria-hidden>
          ·
        </span>
        <span>
          <span className="font-semibold uppercase tracking-wide text-ink-soft/80">
            Live
          </span>{" "}
          <span className="paye-digits font-semibold text-ink">
            {liveEmployees}
          </span>
        </span>
      </div>

      {!isEmployer || !payeRef || !accountsOfficeRef ? (
        <EmployerSetup clientId={clientId} />
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {actions.map((action) => {
          const selected = tab === action.id;
          const primary = action.id === "run";
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setTab(action.id)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 py-3 text-left transition sm:px-4 sm:py-3.5 ${
                selected
                  ? primary
                    ? "border-sea bg-sea text-white shadow-sm"
                    : "border-sea bg-sea/10 shadow-sm"
                  : primary
                    ? "border-sea/50 bg-white hover:border-sea hover:shadow-sm"
                    : "border-line bg-white hover:border-sea/40 hover:shadow-sm"
              }`}
            >
              <p
                className={`display text-base leading-tight sm:text-lg ${
                  selected && primary ? "text-white" : "text-ink"
                }`}
              >
                {action.label}
              </p>
            </button>
          );
        })}
      </div>

      {tab === "people" && (
        <PayrollEmployeeCards
          clientId={clientId}
          employees={employees}
          taxYear={payrollSettings?.activeTaxYear}
          latestRunId={
            payRuns.find(
              (p) =>
                String(p.kind ?? "FPS") !== "EPS" &&
                Array.isArray(p.lines) &&
                p.lines.length > 0,
            )?.id ?? null
          }
          contactEmail={contactEmail}
          focusEmployeeId={focusEmployeeId}
          onRunPayroll={() => setTab("run")}
          onOpenHistory={() => setTab("history")}
        />
      )}

      {tab === "run" && (
        <div className="gloss-card relative space-y-5 overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 md:p-6">
          <div className="gloss-shine" aria-hidden />
          <h3 className="relative display text-2xl text-ink md:text-3xl">
            Run payroll
          </h3>

          {liveEmployees === 0 ? (
            <div className="relative rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              No live employees yet. Add people on{" "}
              <button
                type="button"
                className="font-semibold text-sea underline"
                onClick={() => setTab("people")}
              >
                Employees
              </button>{" "}
              before running payroll.
            </div>
          ) : null}

          {frequency === "W1" ? (
            <TimesheetUpload
              clientId={clientId}
              periodStart={periodStart}
              periodEnd={periodEnd}
              pending={pending}
              start={start}
              setError={setError}
              setOk={setOk}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">
              Period start
              <UkDateField
                className="input mt-1.5"
                value={periodStart}
                onChange={(iso) => {
                  setPeriodStart(iso);
                  setPreview(null);
                  setFiguresUnlocked(false);
                }}
              />
            </label>
            <label className="text-sm font-semibold">
              Period end
              <UkDateField
                className="input mt-1.5"
                value={periodEnd}
                onChange={(iso) => {
                  setPeriodEnd(iso);
                  setPreview(null);
                  setFiguresUnlocked(false);
                }}
              />
            </label>
            <label className="text-sm font-semibold">
              Payday
              <UkDateField
                className="input mt-1.5"
                value={payDate}
                onChange={(iso) => {
                  setPayDate(iso);
                  setPreview(null);
                  setFiguresUnlocked(false);
                }}
              />
            </label>
          </div>

          {!employerRefsReady ? (
            <div className="relative rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-ink">
              <p className="font-semibold">Add employer PAYE details to continue</p>
              <p className="mt-1 text-ink-soft">
                Open Settings and enter the PAYE reference and Accounts Office
                reference.
              </p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-sea underline"
                onClick={() => setTab("settings")}
              >
                Open Settings
              </button>
            </div>
          ) : null}

          {employerRefsReady && staffGaps.length > 0 ? (
            <div className="relative rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-ink">
              <p className="font-semibold">
                Finish employee details before calculating pay
              </p>
              <p className="mt-1 text-ink-soft">
                Add the missing items on Employees, then come back here.
              </p>
              <ul className="mt-2 space-y-1 text-ink-soft">
                {staffGaps.map((g) => (
                  <li key={g.who}>
                    <span className="font-medium text-ink">{g.who}</span>
                    {" — "}
                    {g.missing.join(", ")}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-sea underline"
                onClick={() => setTab("people")}
              >
                Open Employees
              </button>
            </div>
          ) : null}

          {canGenerate && !figuresUnlocked ? (
            <p className="text-sm text-ink-soft">
              Next: press{" "}
              <span className="font-semibold text-ink">Generate payslips</span> to
              calculate and save this payday.
            </p>
          ) : null}
          {canSubmit ? (
            <p className="text-sm text-ink-soft">
              Tick who to include, then press{" "}
              <span className="font-semibold text-ink">Submit FPS</span>.
            </p>
          ) : null}
          {figuresUnlocked &&
          existingForPeriod &&
          !periodRunSubmitted &&
          selectedForSubmit.size === 0 ? (
            <p className="text-sm text-ink-soft">
              Tick at least one employee to enable Submit FPS.
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-slate-500">
                  <th className="px-3 py-2.5 font-medium" colSpan={2}>
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allEligibleSelected}
                        disabled={
                          !figuresUnlocked || eligibleForSubmitIds.length === 0
                        }
                        onChange={() => {
                          submitSelectionTouched.current = true;
                          setSelectedForSubmit(
                            allEligibleSelected
                              ? new Set()
                              : new Set(eligibleForSubmitIds),
                          );
                        }}
                        aria-label="Tick all employees for FPS"
                        title="Tick all"
                      />
                      Employee
                    </span>
                  </th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium text-right">Gross</th>
                  <th className="px-3 py-2.5 font-medium text-right">Tax</th>
                  <th className="px-3 py-2.5 font-medium text-right">NI</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net</th>
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      No live employees for this payday.
                    </td>
                  </tr>
                ) : (
                  roster.map(({ emp, line, status, hasSavedSlip, slipRunId }) => {
                    const badge =
                      status === "submitted"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : status === "prepared"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : status === "calculated"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : status === "reversed"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-50 text-slate-500";
                    const label =
                      status === "submitted"
                        ? "Submitted"
                        : status === "prepared"
                          ? "Prepared"
                          : status === "calculated"
                            ? "Calculated"
                            : status === "reversed"
                              ? "Reversed"
                              : "Not run";
                    const canTick =
                      status === "prepared" || status === "calculated";
                    return (
                      <tr
                        key={emp.id}
                        className="border-b border-slate-100 bg-white last:border-0"
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={selectedForSubmit.has(emp.id)}
                            disabled={!canTick || !figuresUnlocked}
                            onChange={() => {
                              submitSelectionTouched.current = true;
                              setSelectedForSubmit((prev) => {
                                const next = new Set(prev);
                                if (next.has(emp.id)) next.delete(emp.id);
                                else next.add(emp.id);
                                return next;
                              });
                            }}
                            aria-label={`Include ${emp.forename} ${emp.surname} in FPS`}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-sea hover:text-sea"
                              title="Open employee"
                              aria-label={`Edit ${emp.forename} ${emp.surname}`}
                              onClick={() => {
                                setFocusEmployeeId(emp.id);
                                setTab("people");
                              }}
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-3.5 w-3.5"
                                aria-hidden
                              >
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                            {emp.forename} {emp.surname}
                          </span>
                          {line?.isStarterThisRun ? (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              starter
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${badge}`}
                          >
                            {label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 paye-digits">
                          {line ? money(line.grossPence) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 paye-digits">
                          {line ? money(line.taxPence) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 paye-digits">
                          {line ? money(line.employeeNiPence) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-ink paye-digits">
                          {line ? money(line.netPence) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {slipRunId &&
                            hasSavedSlip &&
                            figuresUnlocked &&
                            status !== "reversed" ? (
                              <a
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                href={`/clients/${clientId}/payroll/payslip/${slipRunId}?employee=${emp.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View
                              </a>
                            ) : null}
                            {slipRunId &&
                            figuresUnlocked &&
                            (status === "submitted" || status === "prepared") ? (
                              <button
                                type="button"
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 hover:border-rose-200 hover:text-rose-600"
                                disabled={activeAction === `reverse:${emp.id}`}
                                onClick={() => {
                                  if (activeAction) return;
                                  setActiveAction(`reverse:${emp.id}`);
                                  start(async () => {
                                    try {
                                      await reversePayslip({
                                        clientId,
                                        runId: slipRunId,
                                        employeeId: emp.id,
                                      });
                                      setOk(
                                        `Reversed ${emp.forename} ${emp.surname}. Prepare a new payslip when ready.`,
                                      );
                                      router.refresh();
                                    } catch {
                                      /* freeze */
                                    } finally {
                                      setActiveAction(null);
                                    }
                                  });
                                }}
                              >
                                {activeAction === `reverse:${emp.id}`
                                  ? "Working…"
                                  : "Reverse"}
                              </button>
                            ) : null}
                            {slipRunId && status === "reversed" ? (
                              <button
                                type="button"
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                disabled={activeAction === `amend:${emp.id}`}
                                onClick={() => {
                                  if (activeAction) return;
                                  setActiveAction(`amend:${emp.id}`);
                                  start(async () => {
                                    try {
                                      const res = await prepareAmendedPayRun({
                                        clientId,
                                        runId: slipRunId,
                                        employeeId: emp.id,
                                      });
                                      if (!res.ok) return;
                                      setFiguresUnlocked(true);
                                      setOk(
                                        `Payslip ready again for ${emp.forename} ${emp.surname}.`,
                                      );
                                      router.refresh();
                                    } catch {
                                      /* freeze */
                                    } finally {
                                      setActiveAction(null);
                                    }
                                  });
                                }}
                              >
                                {activeAction === `amend:${emp.id}`
                                  ? "Working…"
                                  : "Prepare again"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={canGenerate ? "btn btn-primary" : "btn btn-secondary"}
              disabled={!canGenerate || activeAction === "gen"}
              onClick={() => {
                if (activeAction || !canGenerate) return;
                setError(null);
                setOk(null);
                setActiveAction("gen");
                start(async () => {
                  try {
                    if (periodRunSubmitted && periodRun?.id) {
                      const res = await prepareAmendedPayRun({
                        clientId,
                        runId: periodRun.id,
                      });
                      if (!res.ok) return;
                      setFiguresUnlocked(true);
                      setOk("Amended payslips prepared for this payday.");
                    } else {
                      const next = await previewPayRun({
                        clientId,
                        payDate,
                        periodStart,
                        periodEnd,
                        frequency,
                      });
                      if (next.checks.some((c) => c.level === "error")) {
                        setPreview(null);
                        setFiguresUnlocked(false);
                        return;
                      }
                      setPreview(next);
                      const run = await savePayRun({
                        clientId,
                        payDate,
                        periodStart,
                        periodEnd,
                        frequency,
                      });
                      setPreview(null);
                      setFiguresUnlocked(true);
                      setOk(
                        "refreshed" in run && run.refreshed
                          ? `Payslips updated for ${run.payDate}.`
                          : `Payslips prepared for ${run.payDate}.`,
                      );
                    }
                    router.refresh();
                  } catch {
                    /* freeze */
                  } finally {
                    setActiveAction(null);
                  }
                });
              }}
            >
              {activeAction === "gen"
                ? "Working…"
                : periodRunSubmitted
                  ? "Prepare amended payslips"
                  : "Generate payslips"}
            </button>
            <button
              type="button"
              className={canSubmit ? "btn btn-primary" : "btn btn-secondary"}
              disabled={!canSubmit || activeAction === "submit"}
              onClick={() => {
                if (activeAction || !canSubmit) return;
                setError(null);
                setActiveAction("submit");
                start(async () => {
                  try {
                    const run = await createAndSubmitPayRun({
                      clientId,
                      payDate,
                      periodStart,
                      periodEnd,
                      frequency,
                      submit: true,
                      useSavedPassword: true,
                      employeeIds: Array.from(selectedForSubmit),
                    });
                    if (!run.ok) return;
                    setConfirmation({
                      ok: true,
                      kind: "PAYE",
                      title: "RTI submitted",
                      subtitle:
                        "Submission accepted. Payslip rows turn green when filed.",
                      correlationId:
                        run.correlationId ?? run.hmrcCorrelationId,
                      details: [
                        { label: "Pay date", value: payDate },
                        {
                          label: "Period",
                          value: `${periodStart} → ${periodEnd}`,
                        },
                        {
                          label: "Employees",
                          value: String(run.lines?.length ?? 0),
                        },
                        {
                          label: "Net pay",
                          value: money(run.totals?.netPence ?? 0),
                        },
                      ],
                    });
                    setPreview(null);
                    router.refresh();
                  } catch {
                    /* freeze — set credentials in Settings if missing */
                  } finally {
                    setActiveAction(null);
                  }
                });
              }}
            >
              {activeAction === "submit" ? (
                "Working…"
              ) : (
                <span className="inline-flex items-center gap-1">
                  Submit FPS
                  <AbbrInfo code="FPS" />
                </span>
              )}
            </button>
            </div>
            <button
              type="button"
              className={canEmailPack ? "btn btn-primary" : "btn btn-secondary"}
              disabled={!canEmailPack || activeAction === "email-pack"}
              title={
                !contactEmail?.trim()
                  ? "Set contact email in Settings"
                  : !hasPackPassword
                    ? "Set pack password in Settings"
                    : !periodRun?.id
                      ? "Generate payslips first"
                      : "Email payslip pack and payroll summary"
              }
              onClick={() => {
                if (activeAction || !canEmailPack || !periodRun?.id) return;
                const to = contactEmail?.trim();
                if (!to) return;
                setActiveAction("email-pack");
                start(async () => {
                  try {
                    const res = await sendPayrollPack({
                      clientId,
                      runId: periodRun.id!,
                      toEmail: to,
                    });
                    setOk(res.message);
                  } catch {
                    /* freeze */
                  } finally {
                    setActiveAction(null);
                  }
                });
              }}
            >
              {activeAction === "email-pack" ? "Working…" : "Email"}
            </button>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <PayrollSettingsPanel
          clientId={clientId}
          payeRef={payeRef}
          accountsOfficeRef={accountsOfficeRef}
          hasPackPassword={hasPackPassword}
          contactEmail={contactEmail}
          initialSettings={payrollSettings}
        />
      )}

      {tab === "history" && (
        <PayrollDocumentsHub
          clientId={clientId}
          employees={employees}
          payRuns={payRuns}
          hasPackPassword={hasPackPassword}
          contactEmail={contactEmail}
          activeTaxYear={payrollSettings?.activeTaxYear}
          payrollSettings={payrollSettings}
        />
      )}

      <FormErrorBanner error={error} />
      {ok && (
        <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">{ok}</p>
      )}
      <p className="sr-only">{clientName}</p>
    </div>
    </AbbrInfoScope>
  );
}

function EmployerSetup({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payFrequency, setPayFrequency] = useState<"M1" | "W1">("M1");
  return (
    <form
      className="panel space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await enableEmployerPayroll({
              clientId,
              payeRef: String(fd.get("payeRef") || ""),
              accountsOfficeRef: String(fd.get("accountsOfficeRef") || ""),
              payFrequency,
            });
            router.refresh();
          } catch {
            /* freeze */
          }
        });
      }}
    >
      <h3 className="display text-xl">Set up this employer</h3>
      <p className="text-sm text-ink-soft">
        You need the{" "}
        <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
          PAYE
          <AbbrInfo code="PAYE" />
        </span>{" "}
        reference and Accounts Office reference from the employer’s HMRC letter.
        Choose monthly or weekly once — it stays fixed after setup.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          <span className="inline-flex items-center gap-1">
            PAYE reference
            <AbbrInfo code="PAYE" />
          </span>
          <input name="payeRef" className="input mt-1.5" placeholder="123/AB45678" required />
        </label>
        <label className="text-sm font-semibold">
          Accounts Office reference
          <input
            name="accountsOfficeRef"
            className="input mt-1.5"
            placeholder="123PA00045678"
            required
          />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">
          What sort of payroll are you setting up?
        </legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              payFrequency === "M1"
                ? "border-sea bg-sea text-white"
                : "border-slate-200 bg-white text-ink hover:border-slate-300"
            }`}
            onClick={() => setPayFrequency("M1")}
          >
            Monthly salary
          </button>
          <button
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              payFrequency === "W1"
                ? "border-sea bg-sea text-white"
                : "border-slate-200 bg-white text-ink hover:border-slate-300"
            }`}
            onClick={() => setPayFrequency("W1")}
          >
            Weekly + timesheet
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          This cannot be changed after payroll is enabled.
        </p>
      </fieldset>
      <FormErrorBanner error={error} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Save and enable payroll
      </button>
    </form>
  );
}

function TimesheetUpload({
  clientId,
  periodStart,
  periodEnd,
  pending,
  start,
  setError,
  setOk,
}: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  pending: boolean;
  start: (cb: () => Promise<void>) => void;
  setError: (s: string | null) => void;
  setOk: (s: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-sand/40 p-4">
      <h4 className="font-semibold text-ink">Weekly timesheet</h4>
      <p className="mt-1 text-sm text-ink-soft">
        Upload hours, sick days, holiday and maternity for this week.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="btn btn-secondary cursor-pointer text-sm">
          Upload timesheet
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const fd = new FormData();
              fd.set("clientId", clientId);
              fd.set("periodStart", periodStart);
              fd.set("periodEnd", periodEnd);
              fd.set("file", file);
              setError(null);
              start(async () => {
                try {
                  const res = await importTimesheet(fd);
                  setOk(
                    `Timesheet saved · ${res.matched}/${res.rows} rows matched employees. Preview the run to see payslips.`,
                  );
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                }
              });
            }}
          />
        </label>
        <button
          type="button"
          className="text-sm font-semibold text-sea hover:underline"
          disabled={pending}
          onClick={() => {
            start(async () => {
              const b64 = await timesheetTemplateBase64();
              const bin = atob(b64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const url = URL.createObjectURL(
                new Blob([bytes], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "hydratax-timesheet-template.xlsx";
              a.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          Download template
        </button>
      </div>
    </div>
  );
}

