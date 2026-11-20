"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  downloadBacsStandard18,
  downloadEmployeePayslipPack,
  downloadNestContributionsCsv,
  downloadPayrollPack,
  downloadPayrollSummary,
  viewPayrollPackPdf,
  prepareAmendedPayRun,
  reversePayslip,
  savePayrollPackPassword,
  sendEmployeePayslipPack,
  sendPayrollPack,
  sendStatutoryDocument,
  downloadPayrollRtiReport,
  type PayrollEmployee,
} from "@/server/actions/payroll";
import { money } from "@/lib/format";
import type { PayLine } from "@/server/hmrc/payroll";
import type { PayrollDeskSettings } from "@/lib/desk-profile";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { UkDateField } from "@/components/forms/uk-date-field";
import { messageFromUnknown } from "@/lib/action-error";
import {
  assessAeWorker,
  summariseAeDesk,
  type AeDeskRow,
} from "@/server/payroll/ae-assessment";
import { AbbrInfo } from "@/components/desk/abbr-info";
import {
  isPayrollGenerated,
  isPayrollRtiSubmitted,
} from "@/lib/payroll-client-status";

type DocSheetKind =
  | "payslips"
  | "employee"
  | "rti"
  | "nest"
  | "summary"
  | "bacs";

const DOC_BTN =
  "rounded-lg bg-sea px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sea/90 disabled:opacity-40";

type DocSheet = {
  kind: DocSheetKind;
  runId: string;
  periodStart: string;
  periodEnd: string;
  employeeId?: string;
  employeeLabel?: string;
};

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

function triggerZipDownload(filename: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerTextDownload(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function runHasPension(p: RunRow) {
  const lines = Array.isArray(p.lines) ? p.lines : [];
  return lines.some(
    (l) =>
      (l.pensionEmployeePence ?? 0) > 0 || (l.pensionEmployerPence ?? 0) > 0,
  );
}

function runHasNetPay(p: RunRow) {
  const lines = Array.isArray(p.lines) ? p.lines : [];
  return lines.some((l) => (l.netPence ?? 0) > 0);
}

function deskBacsReady(settings?: PayrollDeskSettings | null) {
  const sun = String(settings?.bacsServiceUserNumber ?? "").replace(/\D/g, "");
  const sc = String(settings?.bacsOriginatorSortCode ?? "").replace(/\D/g, "");
  const ac = String(settings?.bacsOriginatorAccountNumber ?? "").replace(
    /\D/g,
    "",
  );
  const name = String(settings?.bacsOriginatorName ?? "").trim();
  return /^\d{6}$/.test(sun) && /^\d{6}$/.test(sc) && /^\d{8}$/.test(ac) && name.length > 0;
}

function taxYearsFromRuns(runs: RunRow[]) {
  const years = new Set<string>();
  for (const r of runs) {
    const d = r.payDate;
    if (!d) continue;
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    const start = m >= 4 ? y : y - 1;
    years.add(`${start}-${String(start + 1).slice(2)}`);
  }
  return [...years].sort().reverse();
}

function runInTaxYear(run: RunRow, ty: string) {
  if (!ty || !run.payDate) return true;
  const startYear = Number(ty.slice(0, 4));
  if (!Number.isFinite(startYear)) return true;
  const y = Number(String(run.payDate).slice(0, 4));
  const m = Number(String(run.payDate).slice(5, 7));
  return (y === startYear && m >= 4) || (y === startYear + 1 && m <= 3);
}

export function PayrollDocumentsHub({
  clientId,
  employees,
  payRuns,
  hasPackPassword,
  contactEmail,
  activeTaxYear,
  payrollSettings,
}: {
  clientId: string;
  employees: PayrollEmployee[];
  payRuns: RunRow[];
  hasPackPassword: boolean;
  contactEmail: string | null;
  activeTaxYear?: string | null;
  payrollSettings?: PayrollDeskSettings | null;
}) {
  const bacsReady = deskBacsReady(payrollSettings);
  const staffBankReady = employees.some(
    (e) =>
      e.active &&
      String(e.bankSortCode ?? "").replace(/\D/g, "").length === 6 &&
      String(e.bankAccountNumber ?? "").replace(/\D/g, "").length === 8,
  );
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const years = useMemo(() => taxYearsFromRuns(payRuns), [payRuns]);
  const [year, setYear] = useState(
    () => activeTaxYear || years[0] || "",
  );
  const [hubTab, setHubTab] = useState<
    "runs" | "employee" | "archive" | "employer" | "password"
  >("runs");
  const [emailOpen, setEmailOpen] = useState<{
    kind: "run" | "employee" | "p60" | "p45";
    runId?: string;
    employeeId?: string;
    taxYear?: string;
  } | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [docSheet, setDocSheet] = useState<DocSheet | null>(null);
  const [sheetFrom, setSheetFrom] = useState("");
  const [sheetTo, setSheetTo] = useState("");
  const [emailTo, setEmailTo] = useState(contactEmail ?? "");

  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const filteredRuns = useMemo(
    () =>
      payRuns
        .filter((p) => (p.kind ?? "FPS") !== "EPS")
        .filter((p) => runInTaxYear(p, year))
        .sort((a, b) =>
          String(b.payDate ?? "").localeCompare(String(a.payDate ?? "")),
        ),
    [payRuns, year],
  );

  const aeDesk = useMemo(() => {
    const latest = filteredRuns[0];
    const assessmentDate =
      latest?.payDate || new Date().toISOString().slice(0, 10);
    const contribByEmp = new Map<string, boolean>();
    const grossByEmp = new Map<string, number>();
    if (latest?.lines) {
      for (const l of latest.lines) {
        contribByEmp.set(
          l.employeeId,
          (l.pensionEmployeePence ?? 0) > 0 ||
            (l.pensionEmployerPence ?? 0) > 0,
        );
        grossByEmp.set(l.employeeId, l.grossPence ?? 0);
      }
    }
    const rows: AeDeskRow[] = employees.map((e) => {
      const freq = e.payFrequency === "W1" ? "W1" : "M1";
      const assessed = assessAeWorker({
        dateOfBirth: e.dateOfBirth,
        assessmentDate,
        periodEarningsPence: grossByEmp.get(e.id),
        annualSalaryPence: e.annualSalaryPence,
        frequency: freq,
        pensionOptOut: e.pensionOptOut,
        hasContributions: contribByEmp.get(e.id) ?? false,
      });
      return {
        employeeId: e.id,
        forename: e.forename,
        surname: e.surname,
        status: assessed.status,
        label: assessed.label,
        active: e.active,
      };
    });
    return { rows: rows.filter((r) => r.active), summary: summariseAeDesk(rows) };
  }, [employees, filteredRuns]);

  const leavers = useMemo(
    () => employees.filter((e) => !e.active && e.leaveDate),
    [employees],
  );
  const sortedPeople = useMemo(
    () =>
      [...employees].sort((a, b) =>
        `${a.surname} ${a.forename}`.localeCompare(
          `${b.surname} ${b.forename}`,
          "en-GB",
        ),
      ),
    [employees],
  );

  function openEmail(opts: NonNullable<typeof emailOpen>) {
    setEmailTo(contactEmail ?? "");
    setEmailSent(false);
    setEmailOpen(opts);
  }

  function openDocSheet(sheet: DocSheet) {
    // Range-aware docs default From ~5 months earlier so multi-month packs work out of the box.
    const rangeAware =
      sheet.kind === "payslips" ||
      sheet.kind === "summary" ||
      sheet.kind === "rti" ||
      sheet.kind === "employee";
    if (rangeAware && sheet.periodEnd) {
      const end = new Date(`${sheet.periodEnd}T12:00:00`);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 5);
      const yyyy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, "0");
      const dd = String(start.getDate()).padStart(2, "0");
      setSheetFrom(`${yyyy}-${mm}-${dd}`);
      setSheetTo(sheet.periodEnd);
    } else {
      setSheetFrom(sheet.periodStart);
      setSheetTo(sheet.periodEnd);
    }
    setDocSheet(sheet);
  }

  function triggerPdfDownload(filename: string, base64: string) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openPdfView(base64: string) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="display text-2xl text-ink">Documents & packs</h3>
            <p className="mt-1 inline-flex flex-wrap items-center gap-x-1 text-sm text-ink-soft">
              Payslips, summaries, employer totals,
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                P60
                <AbbrInfo code="P60" />
              </span>
              and
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                P45
                <AbbrInfo code="P45" />
              </span>
              .
            </p>
          </div>
          <label className="text-xs font-semibold text-ink-soft">
            Tax year
            <select
              className="input mt-1 min-w-[8rem] text-sm text-ink"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {years.length === 0 ? (
                <option value="">No runs yet</option>
              ) : null}
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-line/70 pb-px">
          {(
            [
              ["runs", "Pay runs"],
              ["employee", "One employee"],
              ["employer", "Employer totals"],
              ["archive", "P60 & P45"],
              ["password", "Pack password"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${
                hubTab === id
                  ? "bg-sea/10 text-sea"
                  : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => setHubTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <FormErrorBanner error={error} />
        {ok ? (
          <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">
            {ok}
          </p>
        ) : null}

        {hubTab === "runs" ? (
          <ul className="divide-y divide-line">
            {filteredRuns.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink-soft">
                No pay runs for {year || "this year"} yet. Save a run from the
                Run payroll tab.
              </li>
            ) : null}
            {filteredRuns.map((p) => {
              const runId = String(p.id);
              const lineCount = Array.isArray(p.lines) ? p.lines.length : 0;
              const expanded = expandedRunId === runId;
              const hasLines = lineCount > 0;
              const filed = isPayrollRtiSubmitted(p);
              const generated = isPayrollGenerated(p);
              const isAmendDraft =
                generated &&
                Array.isArray(p.lines) &&
                p.lines.some((l) => Boolean(l.amendsRunId));
              const statusLabel = filed
                ? "RTI submitted"
                : isAmendDraft
                  ? "Amend draft"
                  : generated
                    ? "Payroll generated"
                    : p.status;
              const statusBadge = filed
                ? "badge-ok"
                : generated
                  ? "badge-sea"
                  : "badge-muted";
              return (
                <li key={runId} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedRunId((id) => (id === runId ? null : runId))
                      }
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-semibold text-ink">
                          {p.payFrequency === "W1" ? "Weekly" : "Monthly"} ·{" "}
                          {p.payDate}
                        </p>
                        <span className={`badge ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 paye-digits text-xs text-ink-soft">
                        Gross {money(Number(p.totals?.grossPence ?? 0))} · Net{" "}
                        {money(Number(p.totals?.netPence ?? 0))} · {lineCount}{" "}
                        payslip{lineCount === 1 ? "" : "s"}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-sea/10 px-3 py-1.5 text-xs font-semibold text-sea"
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedRunId((id) =>
                          id === runId ? null : runId,
                        );
                      }}
                    >
                      {expanded ? "Close" : "Open"}
                    </button>
                  </div>

                  {expanded ? (
                    <div className="mt-3 space-y-4 rounded-xl border border-line/70 bg-sand/20 px-3 py-3">
                      <p className="text-xs text-ink-soft">
                        {p.periodStart} → {p.periodEnd}
                      </p>
                      {hasLines ? (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                ["payslips", "Payslips pack", true],
                                ["summary", "Payroll summary", true],
                                ["rti", "RTI submission", filed],
                                ["nest", "NEST contributions", runHasPension(p)],
                                [
                                  "bacs",
                                  "Bank payment file",
                                  bacsReady && staffBankReady && runHasNetPay(p),
                                ],
                              ] as const
                            ).map(([kind, label, enabled]) => (
                              <button
                                key={kind}
                                type="button"
                                className={DOC_BTN}
                                disabled={pending || !enabled}
                                onClick={() =>
                                  openDocSheet({
                                    kind,
                                    runId,
                                    periodStart: String(
                                      p.periodStart ?? p.payDate ?? "",
                                    ),
                                    periodEnd: String(
                                      p.periodEnd ?? p.payDate ?? "",
                                    ),
                                  })
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                              Payslips
                            </p>
                            <ul className="overflow-hidden rounded-lg border border-line/70 bg-white">
                              {p.lines!.map((l) => (
                                <li
                                  key={l.employeeId}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line/60 px-3 py-2 last:border-0"
                                >
                                  <a
                                    className={`truncate text-sm font-semibold hover:underline ${
                                      l.reversed
                                        ? "text-ink-soft line-through"
                                        : "text-sea"
                                    }`}
                                    href={`/clients/${clientId}/payroll/payslip/${runId}?employee=${l.employeeId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {l.forename} {l.surname}
                                    {l.reversed ? " · Reversed" : ""}
                                  </a>
                                  <div className="flex shrink-0 justify-end">
                                    {filed && !l.reversed ? (
                                      <button
                                        type="button"
                                        className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-sand/50 disabled:opacity-40"
                                        disabled={pending}
                                        onClick={() => {
                                          start(async () => {
                                            try {
                                              await reversePayslip({
                                                clientId,
                                                runId,
                                                employeeId: l.employeeId,
                                              });
                                              const res =
                                                await prepareAmendedPayRun({
                                                  clientId,
                                                  runId,
                                                  employeeId: l.employeeId,
                                                });
                                              if (!res.ok) return;
                                              setOk(
                                                `Amend draft ready for ${l.forename} ${l.surname}. File from Run payroll when ready.`,
                                              );
                                              router.refresh();
                                            } catch {
                                              /* freeze */
                                            }
                                          });
                                        }}
                                      >
                                        Revise
                                      </button>
                                    ) : null}
                                    {filed && l.reversed ? (
                                      <button
                                        type="button"
                                        className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-sand/50 disabled:opacity-40"
                                        disabled={pending}
                                        onClick={() => {
                                          start(async () => {
                                            try {
                                              const res =
                                                await prepareAmendedPayRun({
                                                  clientId,
                                                  runId,
                                                  employeeId: l.employeeId,
                                                });
                                              if (!res.ok) return;
                                              setOk(
                                                `Amend draft ready for ${l.forename} ${l.surname}.`,
                                              );
                                              router.refresh();
                                            } catch {
                                              /* freeze */
                                            }
                                          });
                                        }}
                                      >
                                        Revise
                                      </button>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-ink-soft">
                          No payslips on this run yet.
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {hubTab === "employee" ? (
          <div className="grid max-w-xl gap-3">
            <p className="text-sm text-ink-soft">
              Build a zip of one person’s payslip PDFs across any months (e.g.
              last six months).
            </p>
            <label className="text-xs font-semibold">
              Employee
              <select
                className="input mt-1"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
              >
                {sortedPeople.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.surname}, {e.forename}
                    {!e.active ? " (leaver)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                From
                <UkDateField
                  className="input mt-1"
                  value={fromDate}
                  onChange={setFromDate}
                />
              </label>
              <label className="text-xs font-semibold">
                To
                <UkDateField
                  className="input mt-1"
                  value={toDate}
                  onChange={setToDate}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending || !empId}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    try {
                      const pack = await downloadEmployeePayslipPack({
                        clientId,
                        employeeId: empId,
                        fromDate,
                        toDate,
                      });
                      triggerZipDownload(pack.filename, pack.base64);
                      setOk(`Downloaded ${pack.count} payslip PDF(s).`);
                    } catch (err) {
                      setError(messageFromUnknown(err, "Download failed"));
                    }
                  });
                }}
              >
                Download PDFs
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending || !empId}
                onClick={() =>
                  openEmail({ kind: "employee", employeeId: empId })
                }
              >
                Email pack
              </button>
            </div>
          </div>
        ) : null}

        {hubTab === "employer" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              Amounts due to HMRC for the selected tax year — print or save as
              PDF from your browser.
            </p>
            <div className="inline-flex flex-wrap items-center gap-2">
              <a
                className="btn btn-secondary inline-flex text-sm"
                href={`/clients/${clientId}/payroll/p32?taxYear=${encodeURIComponent(year)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open P32 · employer payment summary
              </a>
              <AbbrInfo code="P32" />
            </div>
            <p className="text-xs text-ink-soft">
              Staff sort codes and account numbers are on each employee card.
              Paying account and service user number are under Settings → Staff
              payments. Download the bank payment file from a completed pay run
              when those are filled in.
            </p>
            <div className="rounded-lg border border-line/70 bg-white/70 px-3 py-2 text-sm text-ink">
              <p className="font-semibold">Workplace pension</p>
              <p className="mt-1 text-ink-soft">
                {aeDesk.summary.enrolled} enrolled · {aeDesk.summary.eligible}{" "}
                eligible to enrol · {aeDesk.summary.optedOut} opted out ·{" "}
                {aeDesk.summary.canOptIn} can opt in
                {aeDesk.summary.entitled
                  ? ` · ${aeDesk.summary.entitled} entitled worker`
                  : ""}
                {aeDesk.summary.review
                  ? ` · ${aeDesk.summary.review} need date of birth`
                  : ""}
                . NEST file available on each pay run with contributions.
              </p>
              {aeDesk.rows.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-line/60">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line/60 bg-sand/30 text-ink-soft">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Employee</th>
                        <th className="px-2 py-1.5 font-semibold">
                          <span className="inline-flex items-center gap-0.5">
                            AE
                            <AbbrInfo code="AE" />
                          </span>{" "}
                          status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {aeDesk.rows
                        .slice()
                        .sort((a, b) =>
                          a.surname.localeCompare(b.surname),
                        )
                        .map((r) => (
                          <tr
                            key={r.employeeId}
                            className="border-b border-line/40 last:border-0"
                          >
                            <td className="px-2 py-1.5">
                              {r.surname}, {r.forename}
                            </td>
                            <td className="px-2 py-1.5">{r.label}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {hubTab === "archive" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              Year-end certificates and leaver forms for any tax year —
              including people who left months or years ago.
            </p>
            <div className="overflow-hidden rounded-xl border border-line/80">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line/80 bg-sand/40 text-ink-soft">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Joined</th>
                    <th className="px-3 py-2 font-semibold">Left</th>
                    <th className="px-3 py-2 font-semibold">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPeople.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-semibold text-ink">
                        {e.surname}, {e.forename}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {e.startDate
                          ? e.startDate.split("-").reverse().join("/")
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {e.leaveDate
                          ? e.leaveDate.split("-").reverse().join("/")
                          : e.active
                            ? "—"
                            : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            className="text-xs font-semibold text-sea hover:underline"
                            href={`/clients/${clientId}/payroll/p60/${e.id}?year=${encodeURIComponent(year)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            P60 {year}
                          </a>
                          <button
                            type="button"
                            className="text-xs font-semibold text-sea hover:underline"
                            disabled={pending}
                            onClick={() =>
                              openEmail({
                                kind: "p60",
                                employeeId: e.id,
                                taxYear: year,
                              })
                            }
                          >
                            Email P60
                          </button>
                          {!e.active && e.leaveDate ? (
                            <>
                              <a
                                className="text-xs font-semibold text-sea hover:underline"
                                href={`/clients/${clientId}/payroll/p45/${e.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                P45
                              </a>
                              <button
                                type="button"
                                className="text-xs font-semibold text-sea hover:underline"
                                disabled={pending}
                                onClick={() =>
                                  openEmail({
                                    kind: "p45",
                                    employeeId: e.id,
                                  })
                                }
                              >
                                Email P45
                              </button>
                            </>
                          ) : null}
                          <a
                            className="text-xs font-semibold text-ink-soft hover:underline"
                            href={`/clients/${clientId}/payroll/p11d/${e.id}?taxYear=${encodeURIComponent(year)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            P11D
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedPeople.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center text-ink-soft"
                      >
                        No employees on this payroll.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {leavers.length > 0 ? (
              <p className="text-xs text-ink-soft">
                {leavers.length} leaver
                {leavers.length === 1 ? "" : "s"} with a leave date — P45 is
                available on their row.
              </p>
            ) : null}
          </div>
        ) : null}

        {hubTab === "password" ? (
          <PackPasswordInline
            clientId={clientId}
            hasPackPassword={hasPackPassword}
            onSaved={() => {
              setOk("Pack password saved.");
              router.refresh();
            }}
            setError={setError}
            pending={pending}
            start={start}
          />
        ) : null}
      </div>

      {docSheet ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setDocSheet(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md overflow-visible rounded-2xl border border-line bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="display text-2xl text-ink">
              {docSheet.kind === "payslips"
                ? "Payslips pack"
                : docSheet.kind === "employee"
                  ? docSheet.employeeLabel || "Employee documents"
                  : docSheet.kind === "nest"
                    ? "NEST contributions"
                    : docSheet.kind === "summary"
                      ? "Payroll summary"
                      : docSheet.kind === "bacs"
                        ? "Bank payment file"
                        : "RTI submission"}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Choose a date range, then view, download or email.
            </p>
            <div className="relative z-[70] mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                From
                <UkDateField
                  className="input mt-1"
                  value={sheetFrom}
                  onChange={setSheetFrom}
                />
              </label>
              <label className="text-xs font-semibold">
                To
                <UkDateField
                  className="input mt-1"
                  value={sheetTo}
                  onChange={setSheetTo}
                />
              </label>
            </div>

            {docSheet.kind === "rti" ? (
              <div className="mt-5 space-y-4">
                {(
                  [
                    ["fps", "Full Payment Submission (FPS) report"],
                    ["rti", "RTI FPS Submission Detail"],
                  ] as const
                ).map(([kind, title]) => (
                  <div
                    key={kind}
                    className="rounded-xl border border-line/80 px-3 py-3"
                  >
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                        disabled={pending}
                        onClick={() => {
                          start(async () => {
                            try {
                              const file = await downloadPayrollRtiReport({
                                clientId,
                                kind,
                                fromDate: sheetFrom || undefined,
                                toDate: sheetTo || undefined,
                              });
                              openPdfView(file.base64);
                            } catch {
                              /* freeze */
                            }
                          });
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                        disabled={pending}
                        onClick={() => {
                          start(async () => {
                            try {
                              const file = await downloadPayrollRtiReport({
                                clientId,
                                kind,
                                fromDate: sheetFrom || undefined,
                                toDate: sheetTo || undefined,
                              });
                              triggerPdfDownload(file.filename, file.base64);
                            } catch {
                              /* freeze */
                            }
                          });
                        }}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                        disabled={pending}
                        onClick={() =>
                          openEmail({ kind: "run", runId: docSheet.runId })
                        }
                      >
                        Email
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      try {
                        if (docSheet.kind === "payslips") {
                          const pack = await viewPayrollPackPdf({
                            clientId,
                            fromDate: sheetFrom,
                            toDate: sheetTo,
                          });
                          openPdfView(pack.base64);
                          setOk(
                            `Opened ${pack.lineCount} payslip${pack.lineCount === 1 ? "" : "s"}.`,
                          );
                          return;
                        }
                        if (docSheet.kind === "summary") {
                          const file = await downloadPayrollSummary({
                            clientId,
                            fromDate: sheetFrom,
                            toDate: sheetTo,
                          });
                          openPdfView(file.base64);
                          return;
                        }
                        if (
                          docSheet.kind === "employee" &&
                          docSheet.employeeId
                        ) {
                          window.open(
                            `/clients/${clientId}/payroll/payslip/${docSheet.runId}?employee=${docSheet.employeeId}`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                          return;
                        }
                        if (docSheet.kind === "nest") {
                          const file = await downloadNestContributionsCsv({
                            clientId,
                            runId: docSheet.runId,
                          });
                          if (!file) return;
                          const url = URL.createObjectURL(
                            new Blob([file.csv], {
                              type: "text/csv;charset=utf-8",
                            }),
                          );
                          window.open(url, "_blank", "noopener,noreferrer");
                          return;
                        }
                        if (docSheet.kind === "bacs") {
                          const file = await downloadBacsStandard18({
                            clientId,
                            runId: docSheet.runId,
                          });
                          if (!file) return;
                          const url = URL.createObjectURL(
                            new Blob([file.text], {
                              type: "text/plain;charset=utf-8",
                            }),
                          );
                          window.open(url, "_blank", "noopener,noreferrer");
                        }
                      } catch {
                        /* freeze */
                      }
                    });
                  }}
                >
                  View
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      try {
                        if (docSheet.kind === "payslips") {
                          const pack = await downloadPayrollPack({
                            clientId,
                            fromDate: sheetFrom,
                            toDate: sheetTo,
                          });
                          triggerZipDownload(pack.filename, pack.base64);
                          setOk(
                            `Downloaded ${pack.lineCount} payslip${pack.lineCount === 1 ? "" : "s"} + summary.`,
                          );
                          return;
                        }
                        if (docSheet.kind === "summary") {
                          const file = await downloadPayrollSummary({
                            clientId,
                            fromDate: sheetFrom,
                            toDate: sheetTo,
                          });
                          triggerPdfDownload(file.filename, file.base64);
                          setOk(
                            `Payroll summary downloaded (${file.rowCount} row${file.rowCount === 1 ? "" : "s"}).`,
                          );
                          return;
                        }
                        if (
                          docSheet.kind === "employee" &&
                          docSheet.employeeId
                        ) {
                          const pack = await downloadEmployeePayslipPack({
                            clientId,
                            employeeId: docSheet.employeeId,
                            fromDate: sheetFrom,
                            toDate: sheetTo,
                          });
                          triggerZipDownload(pack.filename, pack.base64);
                          setOk(
                            `Downloaded ${pack.count} payslip PDF(s).`,
                          );
                          return;
                        }
                        if (docSheet.kind === "nest") {
                          const file = await downloadNestContributionsCsv({
                            clientId,
                            runId: docSheet.runId,
                          });
                          if (!file) return;
                          triggerTextDownload(file.filename, file.csv);
                          setOk("NEST contribution file downloaded.");
                          return;
                        }
                        if (docSheet.kind === "bacs") {
                          const file = await downloadBacsStandard18({
                            clientId,
                            runId: docSheet.runId,
                          });
                          if (!file) return;
                          triggerTextDownload(
                            file.filename,
                            file.text,
                            "text/plain;charset=utf-8",
                          );
                          setOk("Bank payment file downloaded.");
                        }
                      } catch {
                        /* freeze */
                      }
                    });
                  }}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-sand/50"
                  disabled={pending}
                  onClick={() => {
                    if (docSheet.kind === "employee" && docSheet.employeeId) {
                      setFromDate(sheetFrom);
                      setToDate(sheetTo);
                      openEmail({
                        kind: "employee",
                        employeeId: docSheet.employeeId,
                      });
                      return;
                    }
                    openEmail({
                      kind: "run",
                      runId: docSheet.runId,
                    });
                  }}
                >
                  Email
                </button>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => setDocSheet(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {emailOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setEmailOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="display text-2xl text-ink">Email pack</h2>
            <label className="mt-4 block text-xs font-semibold">
              Send to
              <input
                className="input mt-1"
                type="email"
                value={emailTo}
                onChange={(e) => {
                  setEmailSent(false);
                  setEmailTo(e.target.value);
                }}
                autoFocus
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => setEmailOpen(null)}
              >
                {emailSent ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending || !emailTo.trim() || emailSent}
                onClick={() => {
                  const to = emailTo.trim();
                  const ctx = emailOpen;
                  if (!to || !ctx || emailSent) return;
                  setError(null);
                  setOk(null);
                  start(async () => {
                    try {
                      if (ctx.kind === "run") {
                        const res = await sendPayrollPack({
                          clientId,
                          runId: ctx.runId,
                          fromDate: sheetFrom || undefined,
                          toDate: sheetTo || undefined,
                          toEmail: to,
                        });
                        setOk(res.message);
                      } else if (ctx.kind === "employee" && ctx.employeeId) {
                        const res = await sendEmployeePayslipPack({
                          clientId,
                          employeeId: ctx.employeeId,
                          fromDate: sheetFrom || fromDate,
                          toDate: sheetTo || toDate,
                          toEmail: to,
                        });
                        setOk(
                          `${res.message} (${res.count} payslip${res.count === 1 ? "" : "s"}).`,
                        );
                      } else if (
                        (ctx.kind === "p60" || ctx.kind === "p45") &&
                        ctx.employeeId
                      ) {
                        const res = await sendStatutoryDocument({
                          clientId,
                          employeeId: ctx.employeeId,
                          kind: ctx.kind,
                          taxYear: ctx.taxYear,
                          toEmail: to,
                        });
                        setOk(res.message);
                      }
                      setEmailSent(true);
                    } catch {
                      /* freeze — desk stays silent */
                    }
                  });
                }}
              >
                {pending ? "Sending…" : emailSent ? "Sent" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PackPasswordInline({
  clientId,
  hasPackPassword,
  onSaved,
  setError,
  pending,
  start,
}: {
  clientId: string;
  hasPackPassword: boolean;
  onSaved: () => void;
  setError: (s: string | null) => void;
  pending: boolean;
  start: (cb: () => Promise<void>) => void;
}) {
  return (
    <form
      className="grid max-w-md gap-3"
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
            onSaved();
          } catch (err) {
            setError(messageFromUnknown(err, "Could not save password"));
          }
        });
      }}
    >
      <p className="text-sm text-ink-soft">
        Clients use this password to open every payslip / P60 / P45 zip you
        send.
        {hasPackPassword ? " A password is already stored." : ""}
      </p>
      <input
        name="password"
        type="password"
        minLength={8}
        className="input"
        placeholder="At least 8 characters"
        required
      />
      <button type="submit" className="btn btn-secondary w-fit text-sm" disabled={pending}>
        {hasPackPassword ? "Update password" : "Save password"}
      </button>
    </form>
  );
}
