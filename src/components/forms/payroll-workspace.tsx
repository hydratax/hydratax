"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEmployee,
  createAndSubmitPayRun,
  downloadPayrollPack,
  enableEmployerPayroll,
  importTimesheet,
  markEmployeeLeaver,
  previewPayRun,
  savePayrollPackPassword,
  sendPayrollPack,
  submitEpsNoPayment,
  timesheetTemplateBase64,
  type PayRunPreview,
  type PayrollEmployee,
} from "@/server/actions/payroll";
import { defaultPayPeriod, taxYearFromDate } from "@/lib/payroll";
import { money } from "@/lib/format";
import type { PayFrequency, PayLine } from "@/server/hmrc/payroll";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

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
  payeRef,
  accountsOfficeRef,
  isEmployer,
  employees,
  payRuns,
  hasPackPassword,
  contactEmail,
}: {
  clientId: string;
  clientName: string;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  isEmployer: boolean;
  employees: PayrollEmployee[];
  payRuns: RunRow[];
  hasPackPassword: boolean;
  contactEmail: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"run" | "people" | "history">("run");
  const [frequency, setFrequency] = useState<PayFrequency>("M1");
  const defaults = useMemo(() => defaultPayPeriod(frequency), [frequency]);
  const [payDate, setPayDate] = useState(defaults.payDate);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [preview, setPreview] = useState<PayRunPreview | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function applyFrequency(next: PayFrequency) {
    setFrequency(next);
    const p = defaultPayPeriod(next);
    setPayDate(p.payDate);
    setPeriodStart(p.periodStart);
    setPeriodEnd(p.periodEnd);
    setPreview(null);
  }

  const latest = payRuns[0];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-sand via-white to-sea/10 p-5 md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sea">
          PAYE · Real Time Information
        </p>
        <h2 className="display mt-1 text-2xl text-ink md:text-3xl">
          Run payroll without the FPS panic
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Add people once. Upload a timesheet if you pay by the hour. Preview
          pay (including statutory sick, holiday, maternity and auto-enrolment
          pension). Submit FPS on or before payday, then email a
          password-protected pack of payslips to the client.
        </p>
        <dl className="mt-4 flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-ink-soft">PAYE</dt>
            <dd className="font-mono font-semibold">{payeRef || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Accounts office</dt>
            <dd className="font-mono font-semibold">
              {accountsOfficeRef || "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Live employees</dt>
            <dd className="font-semibold">{employees.filter((e) => e.active).length}</dd>
          </div>
        </dl>
      </div>

      {!isEmployer || !payeRef || !accountsOfficeRef ? (
        <EmployerSetup clientId={clientId} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["run", "Pay run"],
            ["people", "Employees"],
            ["history", "History & packs"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              tab === id ? "bg-sea text-white" : "bg-sand text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <EmployeesPanel clientId={clientId} employees={employees} />
      )}

      {tab === "run" && (
        <div className="panel gloss-card space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="display text-2xl text-ink">This period</h3>
              <p className="text-sm text-ink-soft">
                Preview first. FPS only goes to HMRC when you confirm.
                {latest?.payDate
                  ? ` Last submitted ${latest.payDate}.`
                  : ""}
              </p>
            </div>
            <div className="flex rounded-lg border border-line p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${frequency === "M1" ? "bg-sea text-white" : "text-ink-soft"}`}
                onClick={() => applyFrequency("M1")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${frequency === "W1" ? "bg-sea text-white" : "text-ink-soft"}`}
                onClick={() => applyFrequency("W1")}
              >
                Weekly
              </button>
            </div>
          </div>

          <TimesheetUpload
            clientId={clientId}
            periodStart={periodStart}
            periodEnd={periodEnd}
            pending={pending}
            start={start}
            setError={setError}
            setOk={setOk}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">
              Period start
              <input
                type="date"
                className="input mt-1.5"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Period end
              <input
                type="date"
                className="input mt-1.5"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Payday (FPS due on or before)
              <input
                type="date"
                className="input mt-1.5"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
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
                    setError(err instanceof Error ? err.message : "Preview failed");
                  }
                });
              }}
            >
              {pending ? "Working…" : "Preview pay & checks"}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  try {
                    const res = await submitEpsNoPayment(
                      clientId,
                      taxYearFromDate(payDate),
                    );
                    setOk(`EPS (no payment) sent · ${res.correlationId}`);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "EPS failed");
                  }
                });
              }}
            >
              Submit EPS — nobody paid
            </button>
          </div>

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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-soft">
                      <th className="py-2 font-semibold">Employee</th>
                      <th className="py-2 font-semibold">Payroll ID</th>
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
                        <td className="py-2">
                          {l.forename} {l.surname}
                          {l.isStarterThisRun ? (
                            <span className="ml-2 text-xs text-sea">starter</span>
                          ) : null}
                          {l.leaveDate ? (
                            <span className="ml-2 text-xs text-ink-soft">leaver</span>
                          ) : null}
                        </td>
                        <td className="py-2 font-mono text-xs">{l.payrollId}</td>
                        <td className="py-2 text-right font-mono">{money(l.grossPence)}</td>
                        <td className="py-2 text-right font-mono">
                          {money((l.sspPence ?? 0) + (l.smpPence ?? 0))}
                        </td>
                        <td className="py-2 text-right font-mono">{money(l.taxPence)}</td>
                        <td className="py-2 text-right font-mono">{money(l.employeeNiPence)}</td>
                        <td className="py-2 text-right font-mono">
                          {money(l.pensionEmployeePence ?? 0)}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">{money(l.netPence)}</td>
                        <td className="py-2 text-right font-mono">{money(l.ytdGrossPence)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="pt-3" colSpan={2}>
                        Totals
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(preview.totals.grossPence)}
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(
                          preview.lines.reduce(
                            (s, l) => s + (l.sspPence ?? 0) + (l.smpPence ?? 0),
                            0,
                          ),
                        )}
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(preview.totals.taxPence)}
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(preview.totals.employeeNiPence)}
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(
                          preview.lines.reduce(
                            (s, l) => s + (l.pensionEmployeePence ?? 0),
                            0,
                          ),
                        )}
                      </td>
                      <td className="pt-3 text-right font-mono">
                        {money(preview.totals.netPence)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || preview.checks.some((c) => c.level === "error")}
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
                      });
                      setOk(
                        `FPS ${run.status} · ${String(run.hmrcCorrelationId ?? "")}. Payslips are in History.`,
                      );
                      setPreview(null);
                      router.refresh();
                      setTab("history");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Submit failed");
                    }
                  });
                }}
              >
                Confirm and submit FPS to HMRC
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-5">
          <PackPasswordForm
            clientId={clientId}
            hasPackPassword={hasPackPassword}
          />
          <div className="panel p-5">
          <h3 className="display text-2xl text-ink">Submitted runs</h3>
          <ul className="mt-4 divide-y divide-line">
            {payRuns.length === 0 && (
              <li className="py-3 text-sm text-ink-soft">No pay runs yet.</li>
            )}
            {payRuns.map((p) => (
              <li key={String(p.id)} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">
                      {(p.kind ?? "FPS") === "EPS" ? "EPS · no payment" : "FPS"} ·{" "}
                      {p.payFrequency === "W1" ? "Weekly" : "Monthly"} · {p.payDate}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {p.periodStart} → {p.periodEnd} · {p.hmrcCorrelationId}
                    </p>
                  </div>
                  <span
                    className={`badge ${p.status === "rejected" ? "badge-overdue" : "badge-ok"}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-soft">
                  Gross {money(Number(p.totals?.grossPence ?? 0))} · Net{" "}
                  {money(Number(p.totals?.netPence ?? 0))}
                </p>
                {Array.isArray(p.lines) && p.lines.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.lines.map((l) => (
                      <a
                        key={l.employeeId}
                        className="text-xs font-semibold text-sea hover:underline"
                        href={`/clients/${clientId}/payroll/payslip/${p.id}?employee=${l.employeeId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Payslip · {l.forename} {l.surname}
                      </a>
                    ))}
                    <SendPackButtons
                      clientId={clientId}
                      runId={String(p.id)}
                      contactEmail={contactEmail}
                      pending={pending}
                      start={start}
                      setError={setError}
                      setOk={setOk}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          </div>
        </div>
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
        You need the PAYE reference and Accounts Office reference from the
        employer’s HMRC letter. HydraTax uses the same references to file FPS
        and EPS — without a separate payroll login.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          PAYE reference
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

function EmployeesPanel({
  clientId,
  employees,
}: {
  clientId: string;
  employees: PayrollEmployee[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(employees.length === 0);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="display text-2xl text-ink">People on this payroll</h3>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide form" : "Add employee"}
        </button>
      </div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {employees.length === 0 && (
          <li className="py-3 text-ink-soft">No employees yet — add the first starter below.</li>
        )}
        {employees.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="font-semibold">
                {e.forename} {e.surname}{" "}
                {!e.active && <span className="text-xs font-normal text-ink-soft">leaver</span>}
              </p>
              <p className="font-mono text-xs text-ink-soft">
                {e.payrollId} · {e.nino} · {e.taxCode} ·{" "}
                {e.payFrequency === "W1" ? "Weekly" : "Monthly"} ·{" "}
                {e.payBasis === "hourly" ? "hourly" : "salary"} ·{" "}
                {money(e.annualSalaryPence)}/yr
                {e.pensionOptOut ? " · pension opted out" : ""}
              </p>
            </div>
            {e.active && (
              <button
                type="button"
                className="text-xs font-semibold text-danger"
                disabled={pending}
                onClick={() => {
                  const leaveDate = window.prompt(
                    "Leave date (YYYY-MM-DD) — included on their final FPS",
                    new Date().toISOString().slice(0, 10),
                  );
                  if (!leaveDate) return;
                  start(async () => {
                    try {
                      await markEmployeeLeaver({ clientId, employeeId: e.id, leaveDate });
                      router.refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed");
                    }
                  });
                }}
              >
                Mark leaver
              </button>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <form
          className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            start(async () => {
              try {
                await addEmployee({
                  clientId,
                  forename: String(fd.get("forename") || ""),
                  surname: String(fd.get("surname") || ""),
                  nino: String(fd.get("nino") || ""),
                  taxCode: String(fd.get("taxCode") || "1257L"),
                  annualSalaryPounds: String(fd.get("annualSalaryPounds") || ""),
                  startDate: String(fd.get("startDate") || ""),
                  payrollId: String(fd.get("payrollId") || "") || undefined,
                  payFrequency: fd.get("payFrequency") === "W1" ? "W1" : "M1",
                  niCategory: String(fd.get("niCategory") || "A"),
                  jobTitle: String(fd.get("jobTitle") || ""),
                  starterDeclaration:
                    fd.get("starterDeclaration") === "B" ||
                    fd.get("starterDeclaration") === "C"
                      ? (fd.get("starterDeclaration") as "B" | "C")
                      : "A",
                  hoursPerWeek: String(fd.get("hoursPerWeek") || "37.5"),
                  hourlyRatePounds: String(fd.get("hourlyRatePounds") || "") || undefined,
                  payBasis: fd.get("payBasis") === "hourly" ? "hourly" : "salary",
                  pensionOptOut: fd.get("pensionOptOut") === "on",
                });
                e.currentTarget.reset();
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not add");
              }
            });
          }}
        >
          <label className="text-sm font-semibold">
            Forename
            <input name="forename" className="input mt-1.5" required />
          </label>
          <label className="text-sm font-semibold">
            Surname
            <input name="surname" className="input mt-1.5" required />
          </label>
          <label className="text-sm font-semibold">
            National Insurance number
            <input name="nino" className="input mt-1.5 font-mono" placeholder="AB123456C" required />
          </label>
          <label className="text-sm font-semibold">
            Tax code
            <input name="taxCode" className="input mt-1.5" defaultValue="1257L" />
          </label>
          <label className="text-sm font-semibold">
            Annual salary (£) — optional if hourly
            <input name="annualSalaryPounds" className="input mt-1.5 font-mono" />
          </label>
          <label className="text-sm font-semibold">
            Hourly rate (£) — used with a timesheet
            <input name="hourlyRatePounds" className="input mt-1.5 font-mono" placeholder="15.00" />
          </label>
          <label className="text-sm font-semibold">
            Hours per week
            <input name="hoursPerWeek" className="input mt-1.5" defaultValue="37.5" />
          </label>
          <label className="text-sm font-semibold">
            Pay basis
            <select name="payBasis" className="input mt-1.5" defaultValue="salary">
              <option value="salary">Salary (period split)</option>
              <option value="hourly">Hourly (timesheet hours)</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Start date
            <input name="startDate" type="date" className="input mt-1.5" required />
          </label>
          <label className="text-sm font-semibold">
            Payroll ID (leave blank to auto-issue)
            <input name="payrollId" className="input mt-1.5 font-mono" placeholder="Never reuse" />
          </label>
          <label className="text-sm font-semibold">
            Pay frequency
            <select name="payFrequency" className="input mt-1.5" defaultValue="M1">
              <option value="M1">Monthly (FPS M1)</option>
              <option value="W1">Weekly (FPS W1)</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Starter declaration
            <select name="starterDeclaration" className="input mt-1.5" defaultValue="A">
              <option value="A">A — first job since 6 April</option>
              <option value="B">B — only job now, had another this year</option>
              <option value="C">C — has another job or pension</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            NI category
            <input name="niCategory" className="input mt-1.5" defaultValue="A" maxLength={2} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Job title (optional)
            <input name="jobTitle" className="input mt-1.5" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="pensionOptOut" className="h-4 w-4" />
            Worker has opted out of auto-enrolment (no 5% / 3% qualifying-earnings pension)
          </label>
          <FormErrorBanner error={error} />
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              Save employee
            </button>
          </div>
        </form>
      )}
      {!open ? <FormErrorBanner error={error} className="mt-3" /> : null}
    </div>
  );
}

function triggerZipDownload(filename: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
      <h4 className="font-semibold text-ink">Timesheet (Excel)</h4>
      <p className="mt-1 text-sm text-ink-soft">
        Upload hours, sick days, holiday hours and maternity weeks. Payslips are
        built from those hours using each employee’s rate, plus 2026/27 SSP, SMP,
        holiday accrual and auto-enrolment.
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

function PackPasswordForm({
  clientId,
  hasPackPassword,
}: {
  clientId: string;
  hasPackPassword: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  return (
    <form
      className="panel space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await savePayrollPackPassword({
              clientId,
              password: String(fd.get("password") || ""),
            });
            setOk("Pack password saved. Clients use this to open the zip you send.");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save password");
          }
        });
      }}
    >
      <h3 className="display text-xl text-ink">Client pack password</h3>
      <p className="text-sm text-ink-soft">
        You set the password. Monthly payslips and the payroll summary go out as
        a password-protected zip. Share the password with the client separately.
        {hasPackPassword ? " A password is already stored for this client." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          name="password"
          type="password"
          minLength={8}
          className="input max-w-xs"
          placeholder="At least 8 characters"
          required
        />
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {hasPackPassword ? "Update password" : "Save password"}
        </button>
      </div>
      <FormErrorBanner error={error} />
      {ok && <p className="text-sm text-sea-deep">{ok}</p>}
    </form>
  );
}

function SendPackButtons({
  clientId,
  runId,
  contactEmail,
  pending,
  start,
  setError,
  setOk,
}: {
  clientId: string;
  runId: string;
  contactEmail: string | null;
  pending: boolean;
  start: (cb: () => Promise<void>) => void;
  setError: (s: string | null) => void;
  setOk: (s: string | null) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="text-xs font-semibold text-sea hover:underline"
        disabled={pending}
        onClick={() => {
          start(async () => {
            try {
              const pack = await downloadPayrollPack({ clientId, runId });
              triggerZipDownload(pack.filename, pack.base64);
              setOk("Password-protected zip downloaded.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Download failed");
            }
          });
        }}
      >
        Download protected zip
      </button>
      <button
        type="button"
        className="text-xs font-semibold text-sea hover:underline"
        disabled={pending}
        onClick={() => {
          const toEmail = window.prompt(
            "Email the password-protected pack to",
            contactEmail ?? "",
          );
          if (!toEmail) return;
          start(async () => {
            try {
              const res = await sendPayrollPack({ clientId, runId, toEmail });
              triggerZipDownload(res.filename, res.base64);
              setOk(res.message);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Send failed");
            }
          });
        }}
      >
        Email protected pack
      </button>
    </>
  );
}
