"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEmployee,
  downloadEmployeeCsvTemplate,
  importEmployeesCsv,
  markEmployeeLeaver,
  updateEmployee,
  type PayrollEmployee,
} from "@/server/actions/payroll";
import { previewEmployeeMonthPay } from "@/lib/employee-pay-preview";
import { money } from "@/lib/format";
import { maskNino } from "@/lib/mask-identifiers";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { UkDateField } from "@/components/forms/uk-date-field";
import { AddressFields } from "@/components/forms/address-fields";
import { messageFromUnknown } from "@/lib/action-error";
import { AbbrInfo } from "@/components/desk/abbr-info";

function ukDob(iso: string | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "DOB not set";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ukJoined(iso: string | null | undefined) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Joined —";
  const [y, m, d] = iso.split("-");
  return `Joined ${d}/${m}/${y}`;
}

function poundsInput(pence: number) {
  if (!pence) return "";
  return (pence / 100).toFixed(pence % 100 === 0 ? 0 : 2);
}

type EmployeePanel = "personal" | "pay" | "bank" | "loans";

const EMPLOYEE_PANELS: {
  id: EmployeePanel;
  title: string;
}[] = [
  { id: "personal", title: "Personal & address" },
  { id: "pay", title: "Pay" },
  { id: "bank", title: "Bank" },
  { id: "loans", title: "Loans & statutory" },
];

function EmployeePanelCard({
  selected,
  title,
  onClick,
}: {
  selected: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-2.5 py-2 text-left transition ${
        selected
          ? "border-sea bg-sea/5 shadow-sm"
          : "border-line bg-white hover:border-sea/40"
      }`}
    >
      <p className="text-xs font-semibold text-ink sm:text-sm">
        {selected ? "✓ " : ""}
        {title}
      </p>
    </button>
  );
}

export function PayrollEmployeeCards({
  clientId,
  employees,
  taxYear,
  onRunPayroll,
  focusEmployeeId,
}: {
  clientId: string;
  employees: PayrollEmployee[];
  taxYear?: string;
  /** @deprecated kept for call-site compat */
  latestRunId?: string | null;
  contactEmail?: string | null;
  onRunPayroll: () => void;
  onOpenHistory?: () => void;
  /** Open this employee card when set (e.g. from Run payroll edit). */
  focusEmployeeId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(employees.length === 0);
  const [expandedId, setExpandedId] = useState<string | null>(
    focusEmployeeId ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionsId, setActionsId] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<PayrollEmployee | null>(null);
  const [leaveDate, setLeaveDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const csvInputRef = useRef<HTMLInputElement>(null);
  const yearLabel =
    taxYear?.trim() ||
    (() => {
      const y = new Date().getFullYear();
      const m = new Date().getMonth() + 1;
      const d = new Date().getDate();
      const startY = m < 4 || (m === 4 && d < 6) ? y - 1 : y;
      return `${startY}-${String(startY + 1).slice(2)}`;
    })();

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return `${a.surname} ${a.forename}`.localeCompare(
          `${b.surname} ${b.forename}`,
          "en-GB",
          { sensitivity: "base" },
        );
      }),
    [employees],
  );

  useEffect(() => {
    if (focusEmployeeId) setExpandedId(focusEmployeeId);
  }, [focusEmployeeId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="display text-2xl text-ink md:text-3xl">
            People on this payroll
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Open a person to view details. Use Actions → Edit to change anything,
            then save.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={onRunPayroll}
          >
            Run payroll
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setOpenAdd((v) => !v)}
          >
            {openAdd ? "Hide form" : "Add employee"}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => {
              start(async () => {
                try {
                  const file = await downloadEmployeeCsvTemplate();
                  const url = URL.createObjectURL(
                    new Blob([file.csv], {
                      type: "text/csv;charset=utf-8",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = file.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  /* freeze — no banner */
                }
              });
            }}
          >
            CSV template
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => csvInputRef.current?.click()}
          >
            Import CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              ev.target.value = "";
              if (!file) return;
              start(async () => {
                try {
                  const text = await file.text();
                  const res = await importEmployeesCsv({
                    clientId,
                    csvText: text,
                  });
                  if (!res.ok) return;
                  setOk(
                    `Imported ${res.created} new · updated ${res.updated}` +
                      (res.skipped ? ` · skipped ${res.skipped}` : "") +
                      ".",
                  );
                  router.refresh();
                } catch {
                  /* freeze — no banner */
                }
              });
            }}
          />
        </div>
      </div>

      <FormErrorBanner error={error} />
      {ok ? (
        <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">
          {ok}
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-soft">
          No employees yet — add the first starter below.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
              clientId={clientId}
              yearLabel={yearLabel}
              expanded={expandedId === e.id}
              editing={editingId === e.id}
              actionsOpen={actionsId === e.id}
              pending={pending}
              onToggleExpand={() => {
                setExpandedId((id) => (id === e.id ? null : e.id));
                setEditingId(null);
                setActionsId(null);
              }}
              onStartEdit={() => {
                setExpandedId(e.id);
                setEditingId(e.id);
                setActionsId(null);
              }}
              onToggleActions={() => {
                setActionsId((id) => (id === e.id ? null : e.id));
              }}
              onMarkLeaver={() => {
                setActionsId(null);
                setLeaveDate(new Date().toISOString().slice(0, 10));
                setLeaveTarget(e);
              }}
              start={start}
              setError={setError}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {openAdd ? (
        <AddEmployeeForm
          clientId={clientId}
          pending={pending}
          start={start}
          setError={setError}
          onDone={() => {
            setOpenAdd(false);
            router.refresh();
          }}
        />
      ) : null}

      {leaveTarget ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setLeaveTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-date-title"
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="leave-date-title" className="display text-2xl text-ink">
              Mark leaver
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {leaveTarget.forename} {leaveTarget.surname} — leave date
            </p>
            <label className="mt-4 block text-xs font-semibold">
              Leave date
              <UkDateField
                className="input mt-1"
                value={leaveDate}
                onChange={(iso) => setLeaveDate(iso)}
              />
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => setLeaveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-red-700 text-sm text-white hover:bg-red-800"
                disabled={pending || !leaveDate}
                onClick={() => {
                  const emp = leaveTarget;
                  if (!emp || !leaveDate) return;
                  setError(null);
                  start(async () => {
                    try {
                      await markEmployeeLeaver({
                        clientId,
                        employeeId: emp.id,
                        leaveDate,
                      });
                      setLeaveTarget(null);
                      router.refresh();
                    } catch (err) {
                      setError(
                        messageFromUnknown(err, "Could not mark leaver"),
                      );
                    }
                  });
                }}
              >
                {pending ? "Saving…" : "Confirm leaver"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function EmployeeCard({
  employee: e,
  clientId,
  yearLabel,
  expanded,
  editing,
  actionsOpen,
  pending,
  onToggleExpand,
  onStartEdit,
  onToggleActions,
  onMarkLeaver,
  start,
  setError,
  onSaved,
}: {
  employee: PayrollEmployee;
  clientId: string;
  yearLabel: string;
  expanded: boolean;
  editing: boolean;
  actionsOpen: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onToggleActions: () => void;
  onMarkLeaver: () => void;
  start: (cb: () => Promise<void>) => void;
  setError: (s: string | null) => void;
  onSaved: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<EmployeePanel>("personal");
  const [forename, setForename] = useState(e.forename);
  const [surname, setSurname] = useState(e.surname);
  const [nino, setNino] = useState(e.nino);
  const [gender, setGender] = useState<"" | "M" | "F">(
    e.gender === "M" || e.gender === "F" ? e.gender : "",
  );
  const [address, setAddress] = useState(e.address ?? "");
  const [annual, setAnnual] = useState(poundsInput(e.annualSalaryPence));
  const [hours, setHours] = useState(
    e.hoursPerWeek ? (e.hoursPerWeek / 100).toFixed(1) : "37.5",
  );
  const [rate, setRate] = useState(poundsInput(e.hourlyRatePence));
  const [basis, setBasis] = useState<"salary" | "hourly">(e.payBasis);
  const [payFrequency, setPayFrequency] = useState<"M1" | "W1">(
    e.payFrequency === "W1" ? "W1" : "M1",
  );
  const [startDate, setStartDate] = useState(e.startDate);
  const [sickDays, setSickDays] = useState("0");
  const [maternityWeeks, setMaternityWeeks] = useState("0");
  const [dob, setDob] = useState(e.dateOfBirth ?? "");
  const [taxCode, setTaxCode] = useState(e.taxCode);
  const [jobTitle, setJobTitle] = useState(e.jobTitle ?? "");
  const [niCategory, setNiCategory] = useState(e.niCategory || "A");
  const [taxBasis, setTaxBasis] = useState<"cumulative" | "week1Month1">(
    e.taxBasis === "week1Month1" ? "week1Month1" : "cumulative",
  );
  const [starterDeclaration, setStarterDeclaration] = useState<"A" | "B" | "C">(
    e.starterDeclaration === "B" || e.starterDeclaration === "C"
      ? e.starterDeclaration
      : "A",
  );
  const [pensionOptOut, setPensionOptOut] = useState(Boolean(e.pensionOptOut));
  const [sspQualifyingDays, setSspQualifyingDays] = useState(
    String(e.sspQualifyingDays || 5),
  );
  const [studentLoanPlan, setStudentLoanPlan] = useState(
    e.studentLoanPlan ?? "",
  );
  const [postgraduateLoan, setPostgraduateLoan] = useState(
    Boolean(e.postgraduateLoan),
  );
  const [isDirector, setIsDirector] = useState(Boolean(e.isDirector));
  const [directorsNicMethod, setDirectorsNicMethod] = useState<"AN" | "AL">(
    e.directorsNicMethod === "AL" ? "AL" : "AN",
  );
  const [bankSortCode, setBankSortCode] = useState(e.bankSortCode ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    e.bankAccountNumber ?? "",
  );
  const [bankAccountName, setBankAccountName] = useState(
    e.bankAccountName ?? "",
  );
  const [bfTaxYear, setBfTaxYear] = useState(e.bfTaxYear ?? "");
  const [bfTaxable, setBfTaxable] = useState(poundsInput(e.bfTaxablePence));
  const [bfTax, setBfTax] = useState(poundsInput(e.bfTaxPence));
  const [bfEmployeeNi, setBfEmployeeNi] = useState(
    poundsInput(e.bfEmployeeNiPence),
  );

  useEffect(() => {
    if (expanded) setPanel("personal");
  }, [expanded]);

  useEffect(() => {
    setForename(e.forename);
    setSurname(e.surname);
    setNino(e.nino);
    setGender(e.gender === "M" || e.gender === "F" ? e.gender : "");
    setAddress(e.address ?? "");
    setAnnual(poundsInput(e.annualSalaryPence));
    setHours(e.hoursPerWeek ? (e.hoursPerWeek / 100).toFixed(1) : "37.5");
    setRate(poundsInput(e.hourlyRatePence));
    setBasis(e.payBasis);
    setPayFrequency(e.payFrequency === "W1" ? "W1" : "M1");
    setStartDate(e.startDate);
    setDob(e.dateOfBirth ?? "");
    setTaxCode(e.taxCode);
    setJobTitle(e.jobTitle ?? "");
    setNiCategory(e.niCategory || "A");
    setTaxBasis(e.taxBasis === "week1Month1" ? "week1Month1" : "cumulative");
    setStarterDeclaration(
      e.starterDeclaration === "B" || e.starterDeclaration === "C"
        ? e.starterDeclaration
        : "A",
    );
    setPensionOptOut(Boolean(e.pensionOptOut));
    setSspQualifyingDays(String(e.sspQualifyingDays || 5));
    setStudentLoanPlan(e.studentLoanPlan ?? "");
    setPostgraduateLoan(Boolean(e.postgraduateLoan));
    setIsDirector(Boolean(e.isDirector));
    setDirectorsNicMethod(e.directorsNicMethod === "AL" ? "AL" : "AN");
    setBankSortCode(e.bankSortCode ?? "");
    setBankAccountNumber(e.bankAccountNumber ?? "");
    setBankAccountName(e.bankAccountName ?? "");
    setBfTaxYear(e.bfTaxYear ?? "");
    setBfTaxable(poundsInput(e.bfTaxablePence));
    setBfTax(poundsInput(e.bfTaxPence));
    setBfEmployeeNi(poundsInput(e.bfEmployeeNiPence));
  }, [e]);

  useEffect(() => {
    if (!expanded) setPanel("pay");
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !cardRef.current) return;
    const node = cardRef.current;
    const id = window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [expanded]);

  useEffect(() => {
    if (!actionsOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!menuRef.current?.contains(ev.target as Node)) onToggleActions();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [actionsOpen, onToggleActions]);

  const preview = useMemo(() => {
    const annualPence = Math.round(
      (Number(String(annual).replace(/,/g, "")) || 0) * 100,
    );
    const ratePence = Math.round(
      (Number(String(rate).replace(/,/g, "")) || 0) * 100,
    );
    const hoursHundredths = Math.round(
      (Number(String(hours).replace(/,/g, "")) || 37.5) * 100,
    );
    return previewEmployeeMonthPay({
      annualSalaryPence: annualPence || e.annualSalaryPence,
      hoursPerWeekHundredths: hoursHundredths,
      hourlyRatePence: ratePence,
      payBasis: basis,
      pensionOptOut,
      frequency: payFrequency,
      sickDays: Math.max(0, Number(sickDays) || 0),
      maternityWeeks: Math.max(0, Number(maternityWeeks) || 0),
    });
  }, [
    annual,
    hours,
    rate,
    basis,
    sickDays,
    maternityWeeks,
    e.annualSalaryPence,
    pensionOptOut,
    payFrequency,
  ]);


  const bankHint =
    !bankSortCode.trim() || !bankAccountNumber.trim()
      ? "Sort code and account still needed for BACS"
      : null;

  function saveDetails() {
    if (gender !== "M" && gender !== "F") return;
    setError(null);
    start(async () => {
      try {
        await updateEmployee({
          clientId,
          employeeId: e.id,
          forename,
          surname,
          nino,
          gender,
          address,
          startDate,
          annualSalaryPounds: annual,
          hourlyRatePounds: rate,
          hoursPerWeek: hours,
          payBasis: basis,
          payFrequency,
          dateOfBirth: dob,
          taxCode,
          jobTitle,
          niCategory,
          taxBasis,
          starterDeclaration,
          sspQualifyingDays: Math.min(
            7,
            Math.max(1, Number(sspQualifyingDays) || 5),
          ),
          pensionOptOut,
          studentLoanPlan,
          postgraduateLoan,
          isDirector,
          directorsNicMethod,
          bankSortCode,
          bankAccountNumber,
          bankAccountName,
          bfTaxYear,
          bfTaxablePounds: bfTaxable,
          bfTaxPounds: bfTax,
          bfEmployeeNiPounds: bfEmployeeNi,
        });
        onSaved();
      } catch (err) {
        setError(messageFromUnknown(err, "Could not save employee"));
      }
    });
  }

  return (
    <article
      ref={cardRef}
      className={`relative rounded-2xl border bg-white/95 shadow-sm transition duration-150 ${
        e.active ? "border-line/80" : "border-line/50 opacity-80"
      } hover:border-sea/45 hover:bg-sea/[0.07] hover:shadow-md ${
        actionsOpen || expanded ? "z-30 border-sea/40 bg-sea/[0.07]" : "z-0"
      }`}
    >
      <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggleExpand}
        >
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h4 className="display text-[1.35rem] leading-tight tracking-tight text-ink">
              {e.forename} {e.surname}
              {!e.active ? (
                <span className="ml-2 align-middle text-[11px] font-sans font-semibold uppercase tracking-wide text-ink-soft">
                  leaver
                </span>
              ) : null}
            </h4>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-ink-soft">
              <div>
                <dt className="sr-only">Date of birth</dt>
                <dd>{ukDob(e.dateOfBirth)}</dd>
              </div>
              <div>
                <dt className="sr-only">NI number</dt>
                <dd className="paye-digits">{maskNino(e.nino)}</dd>
              </div>
              <div>
                <dt className="sr-only">Joined</dt>
                <dd>{ukJoined(e.startDate)}</dd>
              </div>
              <div>
                <dt className="sr-only">Salary</dt>
                <dd className="paye-digits font-semibold text-ink">
                  {money(e.annualSalaryPence)}
                  <span className="font-normal text-ink-soft"> / year</span>
                </dd>
              </div>
            </dl>
          </div>
        </button>

        <div className="relative shrink-0 self-end sm:self-center" ref={menuRef}>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sea bg-sea px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sea/90"
            aria-expanded={actionsOpen}
            onClick={onToggleActions}
          >
            Actions
            <span aria-hidden className="text-[10px] text-white/80">
              ▾
            </span>
          </button>
          {actionsOpen ? (
            <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-xl border border-line/80 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-sea hover:bg-sand/60"
                onClick={onStartEdit}
              >
                Edit
              </button>
              <div className="flex items-center gap-1 border-t border-line/70 px-3 py-2 text-sm text-ink hover:bg-sand/60">
                <a
                  className="flex-1"
                  href={`/clients/${clientId}/payroll/p60/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  P60
                </a>
                <AbbrInfo code="P60" />
              </div>
              <div className="flex items-center gap-1 px-3 py-2 text-sm text-ink hover:bg-sand/60">
                <a
                  className="flex-1"
                  href={`/clients/${clientId}/payroll/p11d/${e.id}?taxYear=${encodeURIComponent(yearLabel)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  P11D
                </a>
                <AbbrInfo code="P11D" />
              </div>
              {!e.active && e.leaveDate ? (
                <div className="flex items-center gap-1 px-3 py-2 text-sm text-ink hover:bg-sand/60">
                  <a
                    className="flex-1"
                    href={`/clients/${clientId}/payroll/p45/${e.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    P45
                  </a>
                  <AbbrInfo code="P45" />
                </div>
              ) : null}
              {e.active ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-sand/60"
                  disabled={pending}
                  onClick={onMarkLeaver}
                >
                  Mark leaver
                </button>
              ) : null}
              {expanded ? (
                <button
                  type="button"
                  className="block w-full border-t border-line/70 px-3 py-2 text-left text-sm text-ink hover:bg-sand/60"
                  onClick={onToggleExpand}
                >
                  Hide details
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="relative space-y-3 border-t border-line/70 bg-sand/20 p-4">
          {!editing ? (
            <p className="text-xs text-ink-soft">
              Viewing only — choose Actions → Edit to change details.
            </p>
          ) : null}
          <div className="rounded-xl border border-sea/25 bg-sea/5 px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sea">
              This month · live estimate
            </p>
            <p className="paye-digits mt-1 text-2xl font-semibold text-ink">
              {money(preview.netPence)}
              <span className="ml-2 text-sm font-normal text-ink-soft">net</span>
            </p>
            <p className="mt-1 paye-digits text-xs text-ink-soft">
              Gross {money(preview.grossPence)} · Tax {money(preview.taxPence)} ·{" "}
              <span className="inline-flex items-center gap-0.5">
                NI
                <AbbrInfo code="NI" />
              </span>{" "}
              {money(preview.employeeNiPence)}
              {preview.sspPence > 0 ? (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-0.5">
                    SSP
                    <AbbrInfo code="SSP" />
                  </span>{" "}
                  {money(preview.sspPence)}
                </>
              ) : null}
              {preview.smpPence > 0 ? (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-0.5">
                    SMP
                    <AbbrInfo code="SMP" />
                  </span>{" "}
                  {money(preview.smpPence)}
                </>
              ) : null}
            </p>
          </div>

          <div
            className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4"
            role="tablist"
            aria-label="Employee detail sections"
          >
            {EMPLOYEE_PANELS.map((p) => (
              <EmployeePanelCard
                key={p.id}
                selected={panel === p.id}
                title={p.title}
                onClick={() => setPanel(p.id)}
              />
            ))}
          </div>

          <fieldset
            disabled={!editing}
            className={`rounded-xl border border-line/70 bg-white/90 p-3 sm:p-4 ${
              editing ? "" : "opacity-90 [&_input]:cursor-default [&_select]:cursor-default"
            }`}
          >
            <legend className="sr-only">
              {editing ? "Edit employee details" : "View employee details"}
            </legend>
            <div role="tabpanel">
            {panel === "personal" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Personal info &amp; address
                </p>
                <label className="text-xs font-semibold">
                  Forename
                  <input
                    className="input mt-1"
                    value={forename}
                    onChange={(ev) => setForename(ev.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Surname
                  <input
                    className="input mt-1"
                    value={surname}
                    onChange={(ev) => setSurname(ev.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    NI number
                    <AbbrInfo code="NINO" />
                  </span>
                  <input
                    className="input mt-1 paye-digits"
                    value={nino}
                    onChange={(ev) => setNino(ev.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Gender
                  <select
                    className="input mt-1"
                    value={gender}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setGender(v === "M" || v === "F" ? v : "");
                    }}
                  >
                    <option value="">Select…</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Date of birth
                  <UkDateField
                    className="input mt-1"
                    value={dob}
                    onChange={(iso) => setDob(iso)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Job title
                  <input
                    className="input mt-1"
                    value={jobTitle}
                    onChange={(ev) => setJobTitle(ev.target.value)}
                  />
                </label>
                {!e.active && e.leaveDate ? (
                  <p className="sm:col-span-2 text-xs text-ink-soft">
                    Leave date {e.leaveDate.split("-").reverse().join("/")}
                  </p>
                ) : null}
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold">Home address</p>
                  <div className="mt-1">
                    <AddressFields
                      value={address}
                      onChange={setAddress}
                      required={false}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {panel === "pay" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Pay, tax &amp; NI
                </p>
                <label className="text-xs font-semibold">
                  Annual salary (£)
                  <input
                    className="input mt-1 paye-digits"
                    value={annual}
                    onChange={(ev) => {
                      setAnnual(ev.target.value);
                      setBasis("salary");
                    }}
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Hourly rate (£)
                  <input
                    className="input mt-1 paye-digits"
                    value={rate}
                    onChange={(ev) => {
                      setRate(ev.target.value);
                      setBasis("hourly");
                    }}
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Hours / week
                  <input
                    className="input mt-1 paye-digits"
                    value={hours}
                    onChange={(ev) => setHours(ev.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Pay basis
                  <select
                    className="input mt-1"
                    value={basis}
                    onChange={(ev) =>
                      setBasis(
                        ev.target.value === "hourly" ? "hourly" : "salary",
                      )
                    }
                  >
                    <option value="salary">Salary</option>
                    <option value="hourly">Hourly + timesheet</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Pay frequency
                  <select
                    className="input mt-1"
                    value={payFrequency}
                    onChange={(ev) =>
                      setPayFrequency(ev.target.value === "W1" ? "W1" : "M1")
                    }
                  >
                    <option value="M1">Monthly</option>
                    <option value="W1">Weekly</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Start date
                  <UkDateField
                    className="input mt-1"
                    value={startDate}
                    onChange={(iso) => setStartDate(iso)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Tax code
                  <input
                    className="input mt-1"
                    value={taxCode}
                    onChange={(ev) => setTaxCode(ev.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Tax basis
                    <AbbrInfo code="W1M1" />
                  </span>
                  <select
                    className="input mt-1"
                    value={taxBasis}
                    onChange={(ev) =>
                      setTaxBasis(
                        ev.target.value === "week1Month1"
                          ? "week1Month1"
                          : "cumulative",
                      )
                    }
                  >
                    <option value="cumulative">Cumulative</option>
                    <option value="week1Month1">Week 1 / Month 1</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    NI category
                    <AbbrInfo code="NI" />
                  </span>
                  <select
                    className="input mt-1"
                    value={niCategory}
                    onChange={(ev) => setNiCategory(ev.target.value)}
                  >
                    {["A", "B", "C", "F", "H", "I", "J", "L", "M", "S", "V", "Z"].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Starter declaration
                  <select
                    className="input mt-1"
                    value={starterDeclaration}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setStarterDeclaration(v === "B" || v === "C" ? v : "A");
                    }}
                  >
                    <option value="A">A — first job since 6 April</option>
                    <option value="B">B — only job now</option>
                    <option value="C">C — other job / pension</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={isDirector}
                    onChange={(ev) => setIsDirector(ev.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1">
                    Company director
                    <AbbrInfo code="DIRECTOR" />
                  </span>
                </label>
                {isDirector ? (
                  <label className="text-xs font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Directors’ NI method
                      <AbbrInfo
                        code={directorsNicMethod === "AL" ? "AL" : "AN"}
                      />
                    </span>
                    <select
                      className="input mt-1"
                      value={directorsNicMethod}
                      onChange={(ev) =>
                        setDirectorsNicMethod(
                          ev.target.value === "AL" ? "AL" : "AN",
                        )
                      }
                    >
                      <option value="AN">Annual (AN)</option>
                      <option value="AL">Alternative (AL)</option>
                    </select>
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={pensionOptOut}
                    onChange={(ev) => setPensionOptOut(ev.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1">
                    Opt out of workplace pension
                    <AbbrInfo code="AE" />
                  </span>
                </label>
              </div>
            ) : null}

            {panel === "bank" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Bank details
                </p>
                {bankHint ? (
                  <p className="sm:col-span-2 text-xs text-ink-soft">
                    {bankHint}. Re-key from the old payroll or the employee’s
                    mandate.
                  </p>
                ) : null}
                <label className="text-xs font-semibold sm:col-span-2">
                  Account name
                  <input
                    className="input mt-1"
                    value={bankAccountName}
                    onChange={(ev) => setBankAccountName(ev.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Sort code
                  <input
                    className="input mt-1 paye-digits"
                    value={bankSortCode}
                    onChange={(ev) => setBankSortCode(ev.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Account number
                  <input
                    className="input mt-1 paye-digits"
                    value={bankAccountNumber}
                    onChange={(ev) => setBankAccountNumber(ev.target.value)}
                    inputMode="numeric"
                    maxLength={8}
                  />
                </label>
              </div>
            ) : null}

            {panel === "loans" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Student loans, sick pay &amp; brought forward
                </p>
                <label className="text-xs font-semibold">
                  Student loan plan
                  <select
                    className="input mt-1"
                    value={studentLoanPlan}
                    onChange={(ev) => setStudentLoanPlan(ev.target.value)}
                  >
                    <option value="">None</option>
                    <option value="01">Plan 1</option>
                    <option value="02">Plan 2</option>
                    <option value="04">Plan 4</option>
                    <option value="05">Plan 5</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={postgraduateLoan}
                    onChange={(ev) => setPostgraduateLoan(ev.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1">
                    Postgraduate loan
                    <AbbrInfo code="PGL" />
                  </span>
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Sick days (this month)
                    <AbbrInfo code="SSP" />
                  </span>
                  <input
                    className="input mt-1 paye-digits"
                    value={sickDays}
                    onChange={(ev) => setSickDays(ev.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    Maternity weeks (this month)
                    <AbbrInfo code="SMP" />
                  </span>
                  <input
                    className="input mt-1 paye-digits"
                    value={maternityWeeks}
                    onChange={(ev) => setMaternityWeeks(ev.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="text-xs font-semibold">
                  <span className="inline-flex items-center gap-1">
                    SSP qualifying days / week
                    <AbbrInfo code="SSP" />
                  </span>
                  <input
                    className="input mt-1 paye-digits"
                    value={sspQualifyingDays}
                    onChange={(ev) => setSspQualifyingDays(ev.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <p className="sm:col-span-2 mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Previous payroll / P45{" "}
                  <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
                    YTD
                    <AbbrInfo code="YTD" />
                  </span>
                </p>
                <label className="text-xs font-semibold">
                  Tax year (e.g. 25-26)
                  <input
                    className="input mt-1"
                    value={bfTaxYear}
                    onChange={(ev) => setBfTaxYear(ev.target.value)}
                    placeholder="25-26"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Taxable pay to date (£)
                  <input
                    className="input mt-1 paye-digits"
                    value={bfTaxable}
                    onChange={(ev) => setBfTaxable(ev.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Tax to date (£)
                  <input
                    className="input mt-1 paye-digits"
                    value={bfTax}
                    onChange={(ev) => setBfTax(ev.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Employee NI to date (£)
                  <input
                    className="input mt-1 paye-digits"
                    value={bfEmployeeNi}
                    onChange={(ev) => setBfEmployeeNi(ev.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
            ) : null}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            {editing ? (
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={
                  pending ||
                  !forename.trim() ||
                  !surname.trim() ||
                  !nino.trim() ||
                  !startDate
                }
                onClick={saveDetails}
              >
                Save details
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={onStartEdit}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={onToggleExpand}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

    </article>
  );
}

function AddEmployeeForm({
  clientId,
  pending,
  start,
  setError,
  onDone,
}: {
  clientId: string;
  pending: boolean;
  start: (cb: () => Promise<void>) => void;
  setError: (s: string | null) => void;
  onDone: () => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-2xl border border-line/80 bg-white/90 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        start(async () => {
          try {
            await addEmployee({
              clientId,
              forename: String(fd.get("forename") || ""),
              surname: String(fd.get("surname") || ""),
              nino: String(fd.get("nino") || ""),
              gender: fd.get("gender") === "F" ? "F" : "M",
              dateOfBirth: String(fd.get("dateOfBirth") || ""),
              address: String(fd.get("address") || ""),
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
              hourlyRatePounds:
                String(fd.get("hourlyRatePounds") || "") || undefined,
              payBasis: fd.get("payBasis") === "hourly" ? "hourly" : "salary",
              pensionOptOut: fd.get("pensionOptOut") === "on",
              taxBasis:
                fd.get("taxBasis") === "week1Month1"
                  ? "week1Month1"
                  : "cumulative",
              studentLoanPlan: String(fd.get("studentLoanPlan") || "") || undefined,
              postgraduateLoan: fd.get("postgraduateLoan") === "on",
              isDirector: fd.get("isDirector") === "on",
              directorsNicMethod:
                fd.get("directorsNicMethod") === "AL" ? "AL" : "AN",
              bankSortCode: String(fd.get("bankSortCode") || "") || undefined,
              bankAccountNumber:
                String(fd.get("bankAccountNumber") || "") || undefined,
            });
            form.reset();
            onDone();
          } catch (err) {
            setError(messageFromUnknown(err, "Could not add employee"));
          }
        });
      }}
    >
      <h4 className="display sm:col-span-2 text-xl text-ink">Add employee</h4>
      <label className="text-sm font-semibold">
        Forename
        <input name="forename" className="input mt-1.5" required />
      </label>
      <label className="text-sm font-semibold">
        Surname
        <input name="surname" className="input mt-1.5" required />
      </label>
      <label className="text-sm font-semibold">
        <span className="inline-flex items-center gap-1">
          NI number
          <AbbrInfo code="NINO" />
        </span>
        <input name="nino" className="input mt-1.5 paye-digits" required />
      </label>
      <label className="text-sm font-semibold">
        Gender
        <select name="gender" className="input mt-1.5" defaultValue="M">
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Date of birth
        <UkDateField name="dateOfBirth" className="input mt-1.5" />
      </label>
      <label className="text-sm font-semibold">
        Tax code
        <input name="taxCode" className="input mt-1.5" defaultValue="1257L" />
      </label>
      <div className="sm:col-span-2">
        <p className="text-sm font-semibold">Home address</p>
        <div className="mt-1.5">
          <AddressFields name="address" required />
        </div>
      </div>
      <label className="text-sm font-semibold">
        Annual salary (£)
        <input name="annualSalaryPounds" className="input mt-1.5 paye-digits" />
      </label>
      <label className="text-sm font-semibold">
        Hourly rate (£)
        <input name="hourlyRatePounds" className="input mt-1.5 paye-digits" />
      </label>
      <label className="text-sm font-semibold">
        Hours / week
        <input
          name="hoursPerWeek"
          className="input mt-1.5"
          defaultValue="37.5"
        />
      </label>
      <label className="text-sm font-semibold">
        Pay basis
        <select name="payBasis" className="input mt-1.5" defaultValue="salary">
          <option value="salary">Salary</option>
          <option value="hourly">Hourly</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Start date
        <UkDateField name="startDate" className="input mt-1.5" required />
      </label>
      <label className="text-sm font-semibold">
        Job title
        <input name="jobTitle" className="input mt-1.5" />
      </label>
      <label className="text-sm font-semibold">
        Pay frequency
        <select name="payFrequency" className="input mt-1.5" defaultValue="M1">
          <option value="M1">Monthly</option>
          <option value="W1">Weekly</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Starter declaration
        <select
          name="starterDeclaration"
          className="input mt-1.5"
          defaultValue="A"
        >
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        <span className="inline-flex items-center gap-1">
          NI category
          <AbbrInfo code="NI" />
        </span>
        <select name="niCategory" className="input mt-1.5" defaultValue="A">
          {["A", "B", "C", "F", "H", "I", "J", "L", "M", "S", "V", "Z"].map(
            (c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="text-sm font-semibold">
        Tax basis
        <select name="taxBasis" className="input mt-1.5" defaultValue="cumulative">
          <option value="cumulative">Cumulative</option>
          <option value="week1Month1">Week 1 / Month 1</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Student loan plan
        <select name="studentLoanPlan" className="input mt-1.5" defaultValue="">
          <option value="">None</option>
          <option value="01">Plan 1</option>
          <option value="02">Plan 2</option>
          <option value="04">Plan 4</option>
          <option value="05">Plan 5</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Sort code
        <input name="bankSortCode" className="input mt-1.5 paye-digits" maxLength={6} />
      </label>
      <label className="text-sm font-semibold">
        Account number
        <input
          name="bankAccountNumber"
          className="input mt-1.5 paye-digits"
          maxLength={8}
        />
      </label>
      <input type="hidden" name="payrollId" value="" />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="postgraduateLoan" />
        Postgraduate loan
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="isDirector" />
        <span className="inline-flex items-center gap-1">
          Company director
          <AbbrInfo code="DIRECTOR" />
        </span>
      </label>
      <label className="text-sm font-semibold">
        <span className="inline-flex items-center gap-1">
          Directors’ NI method
          <AbbrInfo code="AN" />
        </span>
        <select
          name="directorsNicMethod"
          className="input mt-1.5"
          defaultValue="AN"
        >
          <option value="AN">Annual</option>
          <option value="AL">Alternative</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" name="pensionOptOut" />
        Opt out of workplace pension
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add employee
        </button>
      </div>
    </form>
  );
}
