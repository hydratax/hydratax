"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAndSubmitPayRun,
  enableEmployerPayroll,
  importTimesheet,
  previewPayRun,
  savePayRun,
  submitEps,
  suggestApprenticeshipLevy,
  suggestEpsRecoverables,
  timesheetTemplateBase64,
  type PayRunPreview,
  type PayrollEmployee,
} from "@/server/actions/payroll";
import { PayrollDocumentsHub } from "@/components/forms/payroll-documents-hub";
import { defaultPayPeriod, recentPayrollMonths } from "@/lib/payroll";
import { money } from "@/lib/format";
import type { PayFrequency, PayLine } from "@/server/hmrc/payroll";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { FilingConfirmation } from "@/components/filing-confirmation";
import {
  GatewayCredentialsFields,
  gatewayCredentialsReady,
} from "@/components/forms/gateway-credentials-fields";
import { PayrollSettingsPanel } from "@/components/forms/payroll-settings-panel";
import { PayrollEmployeeCards } from "@/components/forms/payroll-employee-cards";
import { AbbrInfo, AbbrLabel } from "@/components/desk/abbr-info";
import type { PayrollDeskSettings } from "@/lib/desk-profile";
import type { DeskAbbrCode } from "@/lib/desk-abbreviations";

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
  hmrcLive = false,
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
  const [frequency, setFrequency] = useState<PayFrequency>("M1");
  const monthOptions = useMemo(() => recentPayrollMonths(14), []);
  const defaults = useMemo(() => defaultPayPeriod(frequency), [frequency]);
  const [monthKey, setMonthKey] = useState(monthOptions[0]?.key ?? "");
  const [payDate, setPayDate] = useState(defaults.payDate);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [preview, setPreview] = useState<PayRunPreview | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ggUserId, setGgUserId] = useState("");
  const [ggPassword, setGgPassword] = useState("");
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
  const [epsNobodyPaid, setEpsNobodyPaid] = useState(true);
  const [epsSmp, setEpsSmp] = useState("");
  const [epsSpp, setEpsSpp] = useState("");
  const [epsSap, setEpsSap] = useState("");
  const [epsShpp, setEpsShpp] = useState("");
  const [epsSpbp, setEpsSpbp] = useState("");
  const [epsSncp, setEpsSncp] = useState("");
  const [epsNicSmp, setEpsNicSmp] = useState("");
  const [epsLevyDue, setEpsLevyDue] = useState("");
  const [epsLevyAllowance, setEpsLevyAllowance] = useState("15000.00");
  const hasEpsRecoveries = [
    epsSmp,
    epsSpp,
    epsSap,
    epsShpp,
    epsSpbp,
    epsSncp,
    epsNicSmp,
  ].some((v) => v.trim().length > 0);
  const hasEpsLevy = epsLevyDue.trim().length > 0;

  function applyPeriod(next: {
    payDate: string;
    periodStart: string;
    periodEnd: string;
  }) {
    setPayDate(next.payDate);
    setPeriodStart(next.periodStart);
    setPeriodEnd(next.periodEnd);
    setPreview(null);
  }

  function applyFrequency(next: PayFrequency) {
    setFrequency(next);
    if (next === "M1") {
      const hit = monthOptions.find((m) => m.key === monthKey) ?? monthOptions[0];
      if (hit) applyPeriod(hit.period);
      else applyPeriod(defaultPayPeriod("M1"));
    } else {
      applyPeriod(defaultPayPeriod("W1"));
    }
  }

  function applyMonthKey(key: string) {
    setMonthKey(key);
    const hit = monthOptions.find((m) => m.key === key);
    if (hit) {
      setFrequency("M1");
      applyPeriod(hit.period);
    }
  }

  const latest = payRuns[0];
  const existingForPeriod = payRuns.find((p) => {
    if (
      String(p.payDate) !== payDate ||
      String(p.kind ?? "FPS") !== "FPS" ||
      String(p.status) === "rejected"
    ) {
      return false;
    }
    const lines = Array.isArray(p.lines) ? p.lines : [];
    if (
      lines.length > 0 &&
      lines.every((l) => Boolean(l.reversed))
    ) {
      return false;
    }
    return true;
  });

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
            setGgPassword("");
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

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-4">
          <div className="gloss-shine" aria-hidden />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            PAYE
          </p>
          <p className="paye-digits relative mt-2 text-base font-semibold tracking-wide text-ink">
            {payeRef || "Not set"}
          </p>
        </div>
        <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-4">
          <div className="gloss-shine" aria-hidden />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            Accounts office
          </p>
          <p className="paye-digits relative mt-2 text-base font-semibold tracking-wide text-ink">
            {accountsOfficeRef || "Not set"}
          </p>
        </div>
        <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-4">
          <div className="gloss-shine" aria-hidden />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            Live employees
          </p>
          <p className="paye-digits relative mt-1 text-3xl font-semibold text-ink">
            {liveEmployees}
          </p>
        </div>
      </div>

      {!hmrcLive ? (
        <div className="rounded-xl border border-warn/35 bg-warn/10 px-4 py-3 text-sm text-ink">
          <p className="font-semibold text-warn">HMRC sandbox endpoint</p>
          <p className="mt-1 text-ink-soft">
            FPS/EPS go to HMRC’s{" "}
            <span className="font-semibold text-ink">test</span>{" "}
            Transaction Engine (`HMRC_ENV` is not production). That setting only
            chooses the HMRC server — Government Gateway User ID and password
            are always entered by the signed-in accountant (saved to their
            account for this client if they choose). Live GG logins will get
            1046 here until the server uses the live endpoint.
          </p>
        </div>
      ) : null}

      {!isEmployer || !payeRef || !accountsOfficeRef ? (
        <EmployerSetup clientId={clientId} />
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-line/70 pb-3">
        {(
          [
            ["run", "Run payroll"],
            ["people", "Employees"],
            ["history", "History & packs"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              tab === id
                ? "bg-sea text-white shadow-sm"
                : "bg-white text-ink-soft ring-1 ring-line hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
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
          onRunPayroll={() => setTab("run")}
          onOpenHistory={() => setTab("history")}
        />
      )}

      {tab === "run" && (
        <div className="gloss-card relative space-y-5 overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 md:p-6">
          <div className="gloss-shine" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="display text-2xl text-ink md:text-3xl">
                Run payroll
              </h3>
              <p className="mt-1 text-sm text-ink-soft">
                Choose the month, preview pay, then save payslips. File{" "}
                <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                  FPS
                  <AbbrInfo code="FPS" />
                </span>{" "}
                to HMRC when you are ready.
                {latest?.payDate ? ` Last run ${latest.payDate}.` : ""}
              </p>
            </div>
            <div className="flex rounded-xl border border-line/80 bg-sand/40 p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${frequency === "M1" ? "bg-sea text-white shadow-sm" : "text-ink-soft hover:text-ink"}`}
                onClick={() => applyFrequency("M1")}
              >
                Monthly salary
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${frequency === "W1" ? "bg-sea text-white shadow-sm" : "text-ink-soft hover:text-ink"}`}
                onClick={() => applyFrequency("W1")}
              >
                Weekly + timesheet
              </button>
            </div>
          </div>

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

          {frequency === "M1" ? (
            <label className="relative block text-sm font-semibold">
              Pay month
              <select
                className="input mt-1.5"
                value={monthKey}
                onChange={(e) => applyMonthKey(e.target.value)}
              >
                {monthOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                    {m.key === monthOptions[0]?.key ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <TimesheetUpload
              clientId={clientId}
              periodStart={periodStart}
              periodEnd={periodEnd}
              pending={pending}
              start={start}
              setError={setError}
              setOk={setOk}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">
              Period start
              <UkDateField
                className="input mt-1.5"
                value={periodStart}
                onChange={(iso) => {
                  setPeriodStart(iso);
                  setPreview(null);
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
                }}
              />
            </label>
          </div>

          {existingForPeriod ? (
            <div className="rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
              Payslips already exist for this payday.{" "}
              <button
                type="button"
                className="font-semibold text-sea underline"
                onClick={() => setTab("history")}
              >
                Open History & packs
              </button>
            </div>
          ) : null}

          <details className="rounded-xl border border-line/80 bg-sand/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Government Gateway (
              <span className="inline-flex items-center gap-0.5">
                FPS
                <AbbrInfo code="FPS" />
              </span>{" "}
              /{" "}
              <span className="inline-flex items-center gap-0.5">
                EPS
                <AbbrInfo code="EPS" />
              </span>{" "}
              filing)
            </summary>
            <div className="mt-3">
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
                hint="Only needed when filing to HMRC — not for saving payslips."
              />
            </div>
          </details>

          <div className="relative flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || liveEmployees === 0}
              onClick={() => {
                setError(null);
                setOk(null);
                start(async () => {
                  try {
                    const next = await previewPayRun({
                      clientId,
                      payDate,
                      periodStart,
                      periodEnd,
                      frequency,
                    });
                    setPreview(next);
                  } catch (err) {
                    setError(
                      messageFromUnknown(err, "Could not preview this pay run."),
                    );
                  }
                });
              }}
            >
              {pending ? "Working…" : "Calculate pay"}
            </button>
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={
                  pending ||
                  !gatewayCredentialsReady(ggUserId, ggPassword, hasSavedPassword) ||
                  (!epsNobodyPaid && !hasEpsRecoveries && !hasEpsLevy)
                }
                onClick={() => {
                  setError(null);
                  setOk(null);
                  start(async () => {
                    try {
                      const res = await submitEps({
                        clientId,
                        periodStart,
                        periodEnd,
                        noPaymentForPeriod: epsNobodyPaid,
                        smpRecoveredPounds: epsSmp || undefined,
                        sppRecoveredPounds: epsSpp || undefined,
                        sapRecoveredPounds: epsSap || undefined,
                        shppRecoveredPounds: epsShpp || undefined,
                        spbpRecoveredPounds: epsSpbp || undefined,
                        sncpRecoveredPounds: epsSncp || undefined,
                        nicCompSmpPounds: epsNicSmp || undefined,
                        levyDueYtdPounds: epsLevyDue || undefined,
                        levyAnnualAllowancePounds: hasEpsLevy
                          ? epsLevyAllowance || "15000.00"
                          : undefined,
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
                        ok: true,
                        kind: "PAYE · EPS",
                        title: "EPS accepted",
                        subtitle: hasEpsLevy
                          ? "Apprenticeship levy filed for this period."
                          : epsNobodyPaid
                            ? "Employer Payment Summary filed for this period."
                            : "Statutory recoveries filed for this period.",
                        correlationId: res.correlationId,
                        details: [
                          {
                            label: "Period",
                            value: `${res.periodStart} → ${res.periodEnd}`,
                          },
                          { label: "Tax year", value: res.taxYear },
                          {
                            label: "Environment",
                            value: res.env === "production" ? "Live" : "Test",
                          },
                        ],
                      });
                      setGgPassword("");
                      router.refresh();
                    } catch {
                      /* freeze — desk shows no failure banner */
                    }
                  });
                }}
              >
                File EPS
              </button>
              <AbbrInfo code="EPS" />
            </span>
          </div>

          <details className="rounded-xl border border-line/70 bg-sand/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Statutory recoveries (optional)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-3">
                <input
                  type="checkbox"
                  checked={epsNobodyPaid}
                  onChange={(e) => setEpsNobodyPaid(e.target.checked)}
                />
                Nobody paid this tax month
              </label>
              {(
                [
                  ["SMP", epsSmp, setEpsSmp],
                  ["SPP", epsSpp, setEpsSpp],
                  ["SAP", epsSap, setEpsSap],
                  ["ShPP", epsShpp, setEpsShpp],
                  ["SPBP", epsSpbp, setEpsSpbp],
                  ["SNCP", epsSncp, setEpsSncp],
                ] as const satisfies ReadonlyArray<
                  readonly [DeskAbbrCode, string, (v: string) => void]
                >
              ).map(([abbr, value, setValue]) => (
                <label key={abbr} className="text-xs font-semibold">
                  <AbbrLabel code={abbr} after=" recovered (£)" />
                  <input
                    className="input mt-1 paye-digits"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold">
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  NIC compensation on SMP (£)
                  <AbbrInfo code="NIC_SMP" />
                </span>
                <input
                  className="input mt-1 paye-digits"
                  value={epsNicSmp}
                  onChange={(e) => setEpsNicSmp(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-sea hover:underline"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      try {
                        const s = await suggestEpsRecoverables({
                          clientId,
                          periodEnd,
                        });
                        if (s.smpRecoveredPounds) setEpsSmp(s.smpRecoveredPounds);
                        if (s.sppRecoveredPounds) setEpsSpp(s.sppRecoveredPounds);
                        if (s.sapRecoveredPounds) setEpsSap(s.sapRecoveredPounds);
                        if (s.shppRecoveredPounds)
                          setEpsShpp(s.shppRecoveredPounds);
                        if (s.spbpRecoveredPounds)
                          setEpsSpbp(s.spbpRecoveredPounds);
                        if (s.sncpRecoveredPounds)
                          setEpsSncp(s.sncpRecoveredPounds);
                      } catch {
                        /* freeze */
                      }
                    });
                  }}
                >
                  Suggest from payslips (92% recovery)
                </button>
              </div>
            </div>
          </details>

          <details className="rounded-xl border border-line/70 bg-sand/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Apprenticeship levy (optional)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Levy due year to date (£)
                <input
                  className="input mt-1 paye-digits"
                  value={epsLevyDue}
                  onChange={(e) => setEpsLevyDue(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="text-xs font-semibold">
                Annual allowance for this PAYE scheme (£)
                <input
                  className="input mt-1 paye-digits"
                  value={epsLevyAllowance}
                  onChange={(e) => setEpsLevyAllowance(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-sea hover:underline"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      try {
                        const s = await suggestApprenticeshipLevy({
                          clientId,
                          periodEnd,
                          annualAllowancePounds: epsLevyAllowance || undefined,
                        });
                        setEpsLevyDue(s.levyDueYtdPounds);
                        setEpsLevyAllowance(s.levyAnnualAllowancePounds);
                      } catch {
                        /* freeze */
                      }
                    });
                  }}
                >
                  Suggest from pay bill year to date
                </button>
              </div>
            </div>
          </details>

          {preview && (
            <div className="space-y-4">
              <ul className="space-y-2">
                {preview.checks.map((c) => (
                  <li
                    key={c.code}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      c.level === "error"
                        ? "bg-danger/10 text-danger"
                        : c.level === "warn"
                          ? "bg-sand text-ink"
                          : "bg-sea/10 text-sea-deep"
                    }`}
                  >
                    {c.message}
                  </li>
                ))}
              </ul>
              <div>
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[22%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-line text-ink-soft">
                      <th className="py-2 pr-2 font-semibold">Employee</th>
                      <th className="py-2 font-semibold text-right">Gross</th>
                      <th className="py-2 font-semibold text-right">SSP / SMP</th>
                      <th className="py-2 font-semibold text-right">Tax</th>
                      <th className="py-2 font-semibold text-right">NI</th>
                      <th className="py-2 font-semibold text-right">Pension</th>
                      <th className="py-2 font-semibold text-right">Net</th>
                      <th className="py-2 font-semibold text-right">YTD gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr key={l.employeeId} className="border-b border-line/70">
                        <td className="py-2 pr-2">
                          {l.forename} {l.surname}
                          {l.isStarterThisRun ? (
                            <span className="ml-2 text-xs text-sea">starter</span>
                          ) : null}
                          {l.leaveDate ? (
                            <span className="ml-2 text-xs text-ink-soft">leaver</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right paye-digits">{money(l.grossPence)}</td>
                        <td className="py-2 text-right paye-digits">
                          {money((l.sspPence ?? 0) + (l.smpPence ?? 0))}
                        </td>
                        <td className="py-2 text-right paye-digits">{money(l.taxPence)}</td>
                        <td className="py-2 text-right paye-digits">{money(l.employeeNiPence)}</td>
                        <td className="py-2 text-right paye-digits">
                          {money(l.pensionEmployeePence ?? 0)}
                        </td>
                        <td className="py-2 text-right paye-digits font-semibold">{money(l.netPence)}</td>
                        <td className="py-2 text-right paye-digits">{money(l.ytdGrossPence)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="pt-3 pr-2">Totals</td>
                      <td className="pt-3 text-right paye-digits">
                        {money(preview.totals.grossPence)}
                      </td>
                      <td className="pt-3 text-right paye-digits">
                        {money(
                          preview.lines.reduce(
                            (s, l) => s + (l.sspPence ?? 0) + (l.smpPence ?? 0),
                            0,
                          ),
                        )}
                      </td>
                      <td className="pt-3 text-right paye-digits">
                        {money(preview.totals.taxPence)}
                      </td>
                      <td className="pt-3 text-right paye-digits">
                        {money(preview.totals.employeeNiPence)}
                      </td>
                      <td className="pt-3 text-right paye-digits">
                        {money(
                          preview.lines.reduce(
                            (s, l) => s + (l.pensionEmployeePence ?? 0),
                            0,
                          ),
                        )}
                      </td>
                      <td className="pt-3 text-right paye-digits">
                        {money(preview.totals.netPence)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-sm text-ink-soft">
                Step 1 — generate payslips (client can review). Step 2 — submit
                RTI when ready.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    pending ||
                    preview.checks.some((c) => c.level === "error") ||
                    Boolean(existingForPeriod)
                  }
                  onClick={() => {
                    setError(null);
                    setOk(null);
                    start(async () => {
                      try {
                        const run = await savePayRun({
                          clientId,
                          payDate,
                          periodStart,
                          periodEnd,
                          frequency,
                        });
                        setPreview(null);
                        setOk(
                          `Payroll generated for ${run.payDate}. Email the pack from History if the client should review — RTI not submitted yet.`,
                        );
                        setTab("history");
                        router.refresh();
                      } catch {
                        /* freeze — no banner */
                      }
                    });
                  }}
                >
                  1 · Generate payslips
                </button>
              </div>

              <details className="rounded-xl border border-line/80 bg-sand/30 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  2 · Submit RTI{" "}
                  <span className="inline-flex items-center gap-0.5">
                    (FPS
                    <AbbrInfo code="FPS" />)
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
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
                    hint="Needed only when filing."
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={
                      pending ||
                      preview.checks.some((c) => c.level === "error") ||
                      !gatewayCredentialsReady(
                        ggUserId,
                        ggPassword,
                        hasSavedPassword,
                      )
                    }
                    onClick={() => {
                      setError(null);
                      start(async () => {
                        try {
                          const run = await createAndSubmitPayRun({
                            clientId,
                            payDate,
                            periodStart,
                            periodEnd,
                            frequency,
                            submit: true,
                            senderId: ggUserId.trim() || undefined,
                            senderPassword: ggPassword.trim() || undefined,
                            useSavedPassword:
                              hasSavedPassword && !ggPassword.trim(),
                            rememberPassword,
                          });
                          if (rememberPassword && ggPassword.trim()) {
                            setHasSavedPassword(true);
                            setRememberPassword(false);
                          }
                          if (!run.ok) return;
                          setConfirmation({
                            ok: true,
                            kind: "PAYE",
                            title: "RTI submitted",
                            subtitle:
                              "Submission accepted. Payslips are in History.",
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
                          setGgPassword("");
                          router.refresh();
                        } catch {
                          /* freeze — no banner */
                        }
                      });
                    }}
                  >
                    Confirm and submit RTI
                  </button>
                </div>
              </details>
            </div>
          )}
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
  );
}

function EmployerSetup({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
            });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
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
        HydraTax uses the same references to file{" "}
        <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
          FPS
          <AbbrInfo code="FPS" />
        </span>{" "}
        and{" "}
        <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
          EPS
          <AbbrInfo code="EPS" />
        </span>{" "}
        — without a separate payroll login.
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
        For weekly / hourly staff only. Upload hours, sick days, holiday and
        maternity. Monthly salaried people use Run payroll → Monthly salary —
        no timesheet needed.
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

