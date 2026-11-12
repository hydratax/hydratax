"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  emptySa100Draft,
  employmentRowSchema,
  type Sa100Draft,
} from "@/lib/sa100/schema";
import { calculateSa302 } from "@/lib/sa100/calculate";
import { TAX_YEAR_LABEL } from "@/lib/sa100/rates-2025-26";
import { saveSa100Draft, submitSa100Return } from "@/server/actions/sa100";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { SaReturnDocuments } from "@/components/forms/sa-return-documents";
import { supplementCodesForDraft } from "@/lib/sa100/forms-catalog";
import { parseSaTaxYearLabel } from "@/lib/sa-tax-year";

const STEPS = [
  "pages",
  "work",
  "income",
  "reliefs",
  "finish",
  "preview",
] as const;

function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function L({
  label,
  box,
  children,
  className = "",
}: {
  label: string;
  box?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="label mb-0 flex min-h-[2.5rem] items-start text-xs">
        <span>
          {box ? <span className="font-semibold text-sea">{box} · </span> : null}
          {label}
        </span>
      </span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Money({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      className="input placeholder:text-ink-soft/50"
      type="text"
      inputMode="decimal"
      placeholder="0"
      value={value === 0 ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value.trim().replace(/,/g, "");
        if (raw === "") {
          onChange(0);
          return;
        }
        if (!/^\d*\.?\d*$/.test(raw)) return;
        onChange(Number(raw) || 0);
      }}
    />
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-xl border border-line bg-white open:shadow-sm"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-[0.06em] text-sea marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-xs font-semibold normal-case tracking-normal text-ink-soft group-open:hidden">
          Add details
        </span>
        <span className="hidden text-xs font-semibold normal-case tracking-normal text-ink-soft group-open:inline">
          Hide
        </span>
      </summary>
      <div className="grid items-end gap-3 border-t border-line px-4 py-3 sm:grid-cols-2">
        {children}
      </div>
    </details>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return (
    <p className="sm:col-span-2 pt-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-soft first:pt-0">
      {children}
    </p>
  );
}

function YN({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn text-sm ${value ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`btn text-sm ${!value ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

export function Sa100Wizard({
  clientId,
  clientName,
  contactEmail = null,
  utr,
  nino,
  taxpayerId = null,
  companyName = null,
  taxYear = TAX_YEAR_LABEL,
  initial,
  initialReturnId = null,
}: {
  clientId: string;
  clientName: string;
  contactEmail?: string | null;
  utr?: string | null;
  nino?: string | null;
  /** Director / shareholder id when filing personal SA from a company desk */
  taxpayerId?: string | null;
  /** Limited company name — pre-fills employment employer when empty */
  companyName?: string | null;
  /** e.g. 2025-26 */
  taxYear?: string;
  initial?: Partial<Sa100Draft> | null;
  /** Existing draft id so remounts keep PDF downloads + Submit */
  initialReturnId?: string | null;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const yearMeta = useMemo(
    () => parseSaTaxYearLabel(taxYear || initial?.taxYear || TAX_YEAR_LABEL),
    [taxYear, initial?.taxYear],
  );
  const [draft, setDraft] = useState(() => {
    const year =
      parseSaTaxYearLabel(taxYear || initial?.taxYear || "") ||
      parseSaTaxYearLabel(TAX_YEAR_LABEL);
    const base = emptySa100Draft({
      utr: utr ?? "",
      nino: nino ?? "",
      email: contactEmail ?? "",
      ...(initial ?? {}),
      ...(taxYear ? { taxYear } : {}),
    });
    // Books dates follow the selected accounting year when not already set.
    if (year) {
      if (!base.seBooksFrom) base.seBooksFrom = year.start;
      if (!base.seBooksTo) base.seBooksTo = year.end;
      if (!base.taxYear) base.taxYear = year.label;
    }
    // Do not invent employer / company name onto the return — only what the
    // accountant enters (or what was already saved on the draft).
    void companyName;
    return base;
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(
    initialReturnId ?? null,
  );
  const [natureConfirmed, setNatureConfirmed] = useState(
    () => Boolean((initial?.seDescription ?? "").trim()),
  );
  const topRef = useRef<HTMLDivElement>(null);

  const calc = useMemo(() => calculateSa302(draft), [draft]);
  const packSupplements = useMemo(
    () => supplementCodesForDraft(draft),
    [draft],
  );
  const patch = (p: Partial<Sa100Draft>) =>
    setDraft((d) => emptySa100Draft({ ...d, ...p }));
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  const natureMissing =
    draft.hasSelfEmployment &&
    (!draft.seDescription.trim() || !natureConfirmed);

  function persistDraft(opts?: { advance?: boolean; message?: string }) {
    setError(null);
    start(async () => {
      try {
        if (opts?.advance && step === "work" && natureMissing) {
          setError(
            "Confirm the nature of business (description of business) before continuing.",
          );
          return;
        }
        const saved = await saveSa100Draft({
          clientId,
          draft,
          taxpayerId,
        });
        setReturnId(saved.id);
        setOk(opts?.message ?? "Draft saved — SA100 & SA302 updated.");
        if (opts?.advance) {
          setI((x) => Math.min(STEPS.length - 1, x + 1));
        }
        // Soft refresh without remounting the wizard (page key no longer uses updatedAt).
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  useEffect(() => {
    // Always land at the top of the SA wizard when changing steps.
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const filing = document.getElementById("sa-tax-return");
    filing?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [i]);

  return (
    <div
      ref={topRef}
      id="sa100-wizard"
      className="grid scroll-mt-24 items-start gap-4 lg:grid-cols-[1fr_240px]"
    >
      <div className="panel p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          SA100 · {taxYear} · step {i + 1}/{STEPS.length}
        </p>
        <h2 className="display mt-1 text-xl text-ink sm:text-2xl">
          {step === "pages" && "What makes up your return (TR2)"}
          {step === "work" && "Employment, self-employment & property"}
          {step === "income" && "Interest, dividends & pensions (TR3)"}
          {step === "reliefs" && "Reliefs & charges (TR4–TR5)"}
          {step === "finish" && "Declaration (TR7–TR8)"}
          {step === "preview" && "Review & submit"}
        </h2>

        <div className="mt-4 space-y-3">
          {step === "pages" && (
            <div className="space-y-3">
              <p className="rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm text-ink-soft">
                SA100 pack will include:{" "}
                <span className="font-semibold text-ink">
                  SA100
                  {packSupplements.length
                    ? ` + ${packSupplements.join(", ")}`
                    : " only"}
                </span>
                {" "}
                Other supplements stay off unless you tick the matching income
                below
              </p>
              <YN
                label="1. Employment"
                value={draft.hasEmployment}
                onChange={(hasEmployment) =>
                  patch({
                    hasEmployment,
                    employmentCount: hasEmployment
                      ? Math.max(1, draft.employmentCount || 1)
                      : 0,
                    employments:
                      hasEmployment && !draft.employments.length
                        ? [employmentRowSchema.parse({})]
                        : draft.employments,
                  })
                }
              />
              <YN
                label="2. Self-employment"
                value={draft.hasSelfEmployment}
                onChange={(hasSelfEmployment) =>
                  patch({
                    hasSelfEmployment,
                    selfEmploymentCount: hasSelfEmployment ? 1 : 0,
                  })
                }
              />
              <YN
                label="3. Partnership"
                value={draft.hasPartnership}
                onChange={(hasPartnership) => patch({ hasPartnership })}
              />
              <YN
                label="4. UK property"
                value={draft.hasUkProperty}
                onChange={(hasUkProperty) => patch({ hasUkProperty })}
              />
              <YN
                label="5. Foreign"
                value={draft.hasForeign}
                onChange={(hasForeign) => patch({ hasForeign })}
              />
              <YN
                label="6. Trusts"
                value={draft.hasTrusts}
                onChange={(hasTrusts) => patch({ hasTrusts })}
              />
              <YN
                label="7. Capital gains"
                value={draft.hasCapitalGains}
                onChange={(hasCapitalGains) => patch({ hasCapitalGains })}
              />
              <YN
                label="8. Residence / remittance / domicile"
                value={draft.hasResidenceFig}
                onChange={(hasResidenceFig) => patch({ hasResidenceFig })}
              />
              <YN
                label="9. Additional information pages"
                value={draft.hasAdditionalInfoPages}
                onChange={(hasAdditionalInfoPages) =>
                  patch({ hasAdditionalInfoPages })
                }
              />
            </div>
          )}

          {step === "work" && (
            <div className="space-y-4">
              {draft.hasEmployment &&
                draft.employments.map((e, idx) => {
                  const setEmp = (patchRow: Partial<typeof e>) => {
                    const employments = [...draft.employments];
                    employments[idx] = { ...e, ...patchRow };
                    patch({ employments });
                  };
                  return (
                    <Section
                      key={idx}
                      title={`Employment ${idx + 1} (SA102)`}
                    >
                      <SubHead>Pay, tax &amp; employer</SubHead>
                      <L label="Pay from this employment (P45/P60)" box="1">
                        <Money value={e.pay} onChange={(pay) => setEmp({ pay })} />
                      </L>
                      <L
                        label="Payrolled benefits in box 1 affecting student loan"
                        box="1.1"
                      >
                        <Money
                          value={e.payrolledBenefitsStudentLoan}
                          onChange={(payrolledBenefitsStudentLoan) =>
                            setEmp({ payrolledBenefitsStudentLoan })
                          }
                        />
                      </L>
                      <L label="UK tax taken off pay in box 1" box="2">
                        <Money
                          value={e.taxTakenOff}
                          onChange={(taxTakenOff) => setEmp({ taxTakenOff })}
                        />
                      </L>
                      <L label="Tips and other payments not on your P60" box="3">
                        <Money
                          value={e.tips}
                          onChange={(tips) => setEmp({ tips })}
                        />
                      </L>
                      <L label="PAYE tax reference of your employer" box="4">
                        <TextInput
                          value={e.payeRef}
                          placeholder="123/AB45678"
                          onChange={(payeRef) => setEmp({ payeRef })}
                        />
                      </L>
                      <L label="Your employer’s name" box="5">
                        <TextInput
                          value={e.employerName}
                          onChange={(employerName) => setEmp({ employerName })}
                        />
                      </L>

                      <SubHead>Director &amp; close company</SubHead>
                      <div className="sm:col-span-2">
                        <YN
                          label="6 · Were you a director of this company?"
                          value={e.wasDirector}
                          onChange={(wasDirector) => setEmp({ wasDirector })}
                        />
                      </div>
                      {e.wasDirector && (
                        <>
                          <L
                            label="Date directorship ceased (if before 6 Apr 2026)"
                            box="6.1"
                          >
                            <TextInput
                              type="date"
                              value={e.directorCeasedDate}
                              onChange={(directorCeasedDate) =>
                                setEmp({ directorCeasedDate })
                              }
                            />
                          </L>
                          <div className="sm:col-span-2">
                            <YN
                              label="7 · Was this company a close company?"
                              value={e.wasCloseCompany}
                              onChange={(wasCloseCompany) =>
                                setEmp({ wasCloseCompany })
                              }
                            />
                          </div>
                          {e.wasCloseCompany && (
                            <>
                              <L label="Name of this close company" box="7.1">
                                <TextInput
                                  value={e.closeCompanyName}
                                  onChange={(closeCompanyName) =>
                                    setEmp({ closeCompanyName })
                                  }
                                />
                              </L>
                              <L label="Registration number" box="7.2">
                                <TextInput
                                  value={e.closeCompanyNumber}
                                  onChange={(closeCompanyNumber) =>
                                    setEmp({ closeCompanyNumber })
                                  }
                                />
                              </L>
                              <L
                                label="Dividends received from this close company"
                                box="7.3"
                              >
                                <Money
                                  value={e.closeCompanyDividends}
                                  onChange={(closeCompanyDividends) =>
                                    setEmp({ closeCompanyDividends })
                                  }
                                />
                              </L>
                              <L label="Percentage shareholding" box="7.4">
                                <Money
                                  value={e.closeCompanySharePct}
                                  onChange={(closeCompanySharePct) =>
                                    setEmp({ closeCompanySharePct })
                                  }
                                />
                              </L>
                            </>
                          )}
                        </>
                      )}
                      <div className="sm:col-span-2">
                        <YN
                          label="8 · Income from inside off-payroll working engagements?"
                          value={e.offPayroll}
                          onChange={(offPayroll) => setEmp({ offPayroll })}
                        />
                      </div>

                      <SubHead>Benefits from employment (P11D)</SubHead>
                      <L label="Company cars and vans" box="9">
                        <Money
                          value={e.benefitCars}
                          onChange={(benefitCars) => setEmp({ benefitCars })}
                        />
                      </L>
                      <L label="Fuel for company cars and vans" box="10">
                        <Money
                          value={e.benefitFuel}
                          onChange={(benefitFuel) => setEmp({ benefitFuel })}
                        />
                      </L>
                      <L label="Private medical and dental insurance" box="11">
                        <Money
                          value={e.benefitMedical}
                          onChange={(benefitMedical) =>
                            setEmp({ benefitMedical })
                          }
                        />
                      </L>
                      <L
                        label="Vouchers, credit cards and excess mileage allowance"
                        box="12"
                      >
                        <Money
                          value={e.benefitVouchers}
                          onChange={(benefitVouchers) =>
                            setEmp({ benefitVouchers })
                          }
                        />
                      </L>
                      <L
                        label="Goods and other assets provided by your employer"
                        box="13"
                      >
                        <Money
                          value={e.benefitGoods}
                          onChange={(benefitGoods) => setEmp({ benefitGoods })}
                        />
                      </L>
                      <L label="Accommodation provided by your employer" box="14">
                        <Money
                          value={e.benefitAccommodation}
                          onChange={(benefitAccommodation) =>
                            setEmp({ benefitAccommodation })
                          }
                        />
                      </L>
                      <L
                        label="Other benefits (incl. interest-free / low interest loans)"
                        box="15"
                      >
                        <Money
                          value={e.benefitOther}
                          onChange={(benefitOther) => setEmp({ benefitOther })}
                        />
                      </L>
                      <L
                        label="Expenses payments received and balancing charges"
                        box="16"
                      >
                        <Money
                          value={e.benefitExpensesPayments}
                          onChange={(benefitExpensesPayments) =>
                            setEmp({ benefitExpensesPayments })
                          }
                        />
                      </L>

                      <SubHead>Employment expenses</SubHead>
                      <L label="Business travel and subsistence expenses" box="17">
                        <Money
                          value={e.expenseTravel}
                          onChange={(expenseTravel) =>
                            setEmp({ expenseTravel })
                          }
                        />
                      </L>
                      <L label="Fixed deductions for expenses" box="18">
                        <Money
                          value={e.expenseFixed}
                          onChange={(expenseFixed) => setEmp({ expenseFixed })}
                        />
                      </L>
                      <L label="Professional fees and subscriptions" box="19">
                        <Money
                          value={e.expenseProfessional}
                          onChange={(expenseProfessional) =>
                            setEmp({ expenseProfessional })
                          }
                        />
                      </L>
                      <L label="Other expenses and capital allowances" box="20">
                        <Money
                          value={e.expenseOther}
                          onChange={(expenseOther) => setEmp({ expenseOther })}
                        />
                      </L>
                    </Section>
                  );
                })}
              {draft.hasSelfEmployment && (
                <Section title="Self-employment full (SA103F)">
                  <SubHead>Business details</SubHead>
                  <L label="Business name" box="1">
                    <TextInput
                      value={draft.seBusinessName}
                      onChange={(seBusinessName) => patch({ seBusinessName })}
                    />
                  </L>
                  <L label="Description of business / nature of trade" box="2">
                    <TextInput
                      value={draft.seDescription}
                      onChange={(seDescription) => {
                        patch({ seDescription });
                        setNatureConfirmed(false);
                      }}
                    />
                  </L>
                  <label className="sm:col-span-2 flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={natureConfirmed && Boolean(draft.seDescription.trim())}
                      onChange={(e) => setNatureConfirmed(e.target.checked)}
                      disabled={!draft.seDescription.trim()}
                    />
                    <span>
                      I confirm this is the correct nature of business for this
                      return
                      {yearMeta ? ` (${yearMeta.label})` : ""}.
                    </span>
                  </label>
                  <L
                    label="Business address"
                    className="sm:col-span-2"
                  >
                    <TextInput
                      value={draft.seBusinessAddress}
                      onChange={(seBusinessAddress) =>
                        patch({ seBusinessAddress })
                      }
                    />
                  </L>
                  <div className="sm:col-span-2">
                    <YN
                      label={
                        yearMeta
                          ? `6 · Did this business start after 5 April ${yearMeta.label.slice(0, 4)}?`
                          : "6 · Did this business start after 5 April of this tax year?"
                      }
                      value={draft.seStartedAfter}
                      onChange={(seStartedAfter) => patch({ seStartedAfter })}
                    />
                  </div>
                  {draft.seStartedAfter && (
                    <L label="Date business started" box="6">
                      <TextInput
                        type="date"
                        value={draft.seStartDate}
                        onChange={(seStartDate) => patch({ seStartDate })}
                      />
                    </L>
                  )}
                  <div className="sm:col-span-2">
                    <YN
                      label={
                        yearMeta
                          ? `7 · Did this business cease after 5 April ${yearMeta.label.slice(0, 4)} but before 6 April ${Number(yearMeta.label.slice(0, 4)) + 1}?`
                          : "7 · Did this business cease during this tax year?"
                      }
                      value={draft.seCeased}
                      onChange={(seCeased) => patch({ seCeased })}
                    />
                  </div>
                  {draft.seCeased && (
                    <L label="Date business ceased" box="7">
                      <TextInput
                        type="date"
                        value={draft.seCeaseDate}
                        onChange={(seCeaseDate) => patch({ seCeaseDate })}
                      />
                    </L>
                  )}
                  <L label="Date your books or accounts start" box="8">
                    <TextInput
                      type="date"
                      value={draft.seBooksFrom}
                      onChange={(seBooksFrom) => patch({ seBooksFrom })}
                    />
                  </L>
                  <L label="Date your books or accounts are made up to" box="9">
                    <TextInput
                      type="date"
                      value={draft.seBooksTo}
                      onChange={(seBooksTo) => patch({ seBooksTo })}
                    />
                  </L>
                  <div className="sm:col-span-2">
                    <YN
                      label="Cash basis?"
                      value={draft.seCashBasis}
                      onChange={(seCashBasis) => patch({ seCashBasis })}
                    />
                  </div>

                  <SubHead>Business income</SubHead>
                  <L label="Your turnover" box="15">
                    <Money
                      value={draft.seTurnover}
                      onChange={(seTurnover) => patch({ seTurnover })}
                    />
                  </L>
                  <L label="Any other business income" box="16">
                    <Money
                      value={draft.seOtherBusinessIncome}
                      onChange={(seOtherBusinessIncome) =>
                        patch({ seOtherBusinessIncome })
                      }
                    />
                  </L>
                  <L label="Trading income allowance" box="16.1">
                    <Money
                      value={draft.seTradingAllowance}
                      onChange={(seTradingAllowance) =>
                        patch({ seTradingAllowance })
                      }
                    />
                  </L>

                  <SubHead>
                    Allowable expenses (boxes 17–30) — or total only in box 31 if
                    turnover under £90,000
                  </SubHead>
                  <L label="Cost of goods bought for resale or goods used" box="17">
                    <Money
                      value={draft.seCostOfGoods}
                      onChange={(seCostOfGoods) => patch({ seCostOfGoods })}
                    />
                  </L>
                  <L
                    label="Construction industry – payments to subcontractors"
                    box="18"
                  >
                    <Money
                      value={draft.seCisSubcontractors}
                      onChange={(seCisSubcontractors) =>
                        patch({ seCisSubcontractors })
                      }
                    />
                  </L>
                  <L label="Wages, salaries and other staff costs" box="19">
                    <Money
                      value={draft.seWages}
                      onChange={(seWages) => patch({ seWages })}
                    />
                  </L>
                  <L label="Car, van and travel expenses" box="20">
                    <Money
                      value={draft.seCarVanTravel}
                      onChange={(seCarVanTravel) => patch({ seCarVanTravel })}
                    />
                  </L>
                  <L label="Rent, rates, power and insurance costs" box="21">
                    <Money
                      value={draft.seRentPowerInsurance}
                      onChange={(seRentPowerInsurance) =>
                        patch({ seRentPowerInsurance })
                      }
                    />
                  </L>
                  <L
                    label="Repairs and maintenance of property and equipment"
                    box="22"
                  >
                    <Money
                      value={draft.seRepairs}
                      onChange={(seRepairs) => patch({ seRepairs })}
                    />
                  </L>
                  <L
                    label="Phone, fax, stationery and other office costs"
                    box="23"
                  >
                    <Money
                      value={draft.sePhoneOffice}
                      onChange={(sePhoneOffice) => patch({ sePhoneOffice })}
                    />
                  </L>
                  <L label="Advertising and business entertainment costs" box="24">
                    <Money
                      value={draft.seAdvertising}
                      onChange={(seAdvertising) => patch({ seAdvertising })}
                    />
                  </L>
                  <L label="Interest on bank and other loans" box="25">
                    <Money
                      value={draft.seInterest}
                      onChange={(seInterest) => patch({ seInterest })}
                    />
                  </L>
                  <L
                    label="Bank, credit card and other financial charges"
                    box="26"
                  >
                    <Money
                      value={draft.seBankCharges}
                      onChange={(seBankCharges) => patch({ seBankCharges })}
                    />
                  </L>
                  <L label="Irrecoverable debts written off" box="27">
                    <Money
                      value={draft.seBadDebts}
                      onChange={(seBadDebts) => patch({ seBadDebts })}
                    />
                  </L>
                  <L
                    label="Accountancy, legal and other professional fees"
                    box="28"
                  >
                    <Money
                      value={draft.seProfessionalFees}
                      onChange={(seProfessionalFees) =>
                        patch({ seProfessionalFees })
                      }
                    />
                  </L>
                  <L
                    label="Depreciation and loss or profit on sale of assets"
                    box="29"
                  >
                    <Money
                      value={draft.seDepreciation}
                      onChange={(seDepreciation) => patch({ seDepreciation })}
                    />
                  </L>
                  <L label="Other business expenses" box="30">
                    <Money
                      value={draft.seOtherExpensesDetail}
                      onChange={(seOtherExpensesDetail) =>
                        patch({ seOtherExpensesDetail })
                      }
                    />
                  </L>
                  <L label="Total expenses (or enter total only here)" box="31">
                    <Money
                      value={draft.seExpenses}
                      onChange={(seExpenses) => patch({ seExpenses })}
                    />
                  </L>
                  <L label="Total disallowable expenses" box="46">
                    <Money
                      value={draft.seDisallowableTotal}
                      onChange={(seDisallowableTotal) =>
                        patch({ seDisallowableTotal })
                      }
                    />
                  </L>

                  <SubHead>Capital allowances (boxes 49–57)</SubHead>
                  <L label="Annual Investment Allowance" box="49">
                    <Money
                      value={draft.seAia}
                      onChange={(seAia) => patch({ seAia })}
                    />
                  </L>
                  <L
                    label="Capital allowances at 18% (incl. lower CO₂ cars)"
                    box="50"
                  >
                    <Money
                      value={draft.seCa18}
                      onChange={(seCa18) => patch({ seCa18 })}
                    />
                  </L>
                  <L
                    label="Capital allowances at 6% (incl. higher CO₂ cars)"
                    box="51"
                  >
                    <Money
                      value={draft.seCa6}
                      onChange={(seCa6) => patch({ seCa6 })}
                    />
                  </L>
                  <L label="Zero-emission goods vehicle allowance" box="52">
                    <Money
                      value={draft.seZeroEmissionGoods}
                      onChange={(seZeroEmissionGoods) =>
                        patch({ seZeroEmissionGoods })
                      }
                    />
                  </L>
                  <L label="Zero-emission car allowance" box="52.1">
                    <Money
                      value={draft.seZeroEmissionCar}
                      onChange={(seZeroEmissionCar) =>
                        patch({ seZeroEmissionCar })
                      }
                    />
                  </L>
                  <L label="Structures and Buildings Allowance" box="53">
                    <Money
                      value={draft.seSba}
                      onChange={(seSba) => patch({ seSba })}
                    />
                  </L>
                  <L
                    label="Freeport / Investment Zones SBA"
                    box="53.1"
                  >
                    <Money
                      value={draft.seFreeportSba}
                      onChange={(seFreeportSba) => patch({ seFreeportSba })}
                    />
                  </L>
                  <L label="Electric charge-point allowance" box="54">
                    <Money
                      value={draft.seElectricCharge}
                      onChange={(seElectricCharge) =>
                        patch({ seElectricCharge })
                      }
                    />
                  </L>
                  <L label="100% and other enhanced capital allowances" box="55">
                    <Money
                      value={draft.seEnhancedCa}
                      onChange={(seEnhancedCa) => patch({ seEnhancedCa })}
                    />
                  </L>
                  <L
                    label="Allowances on sale or cessation of business use"
                    box="56"
                  >
                    <Money
                      value={draft.seDisposalAllowances}
                      onChange={(seDisposalAllowances) =>
                        patch({ seDisposalAllowances })
                      }
                    />
                  </L>
                  <L
                    label="Total capital allowances (or enter total only here)"
                    box="57"
                  >
                    <Money
                      value={draft.seCapitalAllowances}
                      onChange={(seCapitalAllowances) =>
                        patch({ seCapitalAllowances })
                      }
                    />
                  </L>
                  <L label="Balancing charges" box="59">
                    <Money
                      value={draft.seBalancingCharges}
                      onChange={(seBalancingCharges) =>
                        patch({ seBalancingCharges })
                      }
                    />
                  </L>
                  <L label="Goods and services for your own use" box="60">
                    <Money
                      value={draft.seGoodsOwnUse}
                      onChange={(seGoodsOwnUse) => patch({ seGoodsOwnUse })}
                    />
                  </L>

                  <SubHead>Tax taken off &amp; CIS</SubHead>
                  <L label="Tax taken off trading income" box="tax">
                    <Money
                      value={draft.seTaxTakenOff}
                      onChange={(seTaxTakenOff) => patch({ seTaxTakenOff })}
                    />
                  </L>
                  <L label="CIS deductions suffered" box="CIS">
                    <Money
                      value={draft.seCisDeductions}
                      onChange={(seCisDeductions) =>
                        patch({ seCisDeductions })
                      }
                    />
                  </L>
                  <div className="sm:col-span-2">
                    <YN
                      label="Exempt from Class 4 NICs?"
                      value={draft.seClass4Exempt}
                      onChange={(seClass4Exempt) => patch({ seClass4Exempt })}
                    />
                  </div>
                  <L
                    label="Any other information (SA103F)"
                    className="sm:col-span-2"
                  >
                    <textarea
                      className="input min-h-20"
                      value={draft.seAnyOtherInformation}
                      onChange={(e) =>
                        patch({ seAnyOtherInformation: e.target.value })
                      }
                    />
                  </L>
                </Section>
              )}
              {draft.hasUkProperty && (
                <Section title="UK property (SA105)">
                  <SubHead>Property details</SubHead>
                  <L label="Number of properties rented out" box="1">
                    <Money
                      value={draft.propPropertyCount}
                      onChange={(propPropertyCount) =>
                        patch({ propPropertyCount })
                      }
                    />
                  </L>
                  <div className="sm:col-span-2">
                    <YN
                      label="3 · Income from property let jointly?"
                      value={draft.propJointLet}
                      onChange={(propJointLet) => patch({ propJointLet })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <YN
                      label="4 · Claiming Rent a Room relief (rents ≤ £7,500 / £3,750 joint)?"
                      value={draft.propRentARoom}
                      onChange={(propRentARoom) => patch({ propRentARoom })}
                    />
                  </div>

                  <SubHead>Property income</SubHead>
                  <L label="Total rents and other income from property" box="20">
                    <Money
                      value={draft.propRents}
                      onChange={(propRents) => patch({ propRents })}
                    />
                  </L>
                  <L label="Property income allowance" box="20.1">
                    <Money
                      value={draft.propIncomeAllowance}
                      onChange={(propIncomeAllowance) =>
                        patch({ propIncomeAllowance })
                      }
                    />
                  </L>
                  <div className="sm:col-span-2">
                    <YN
                      label="20.2 · Traditional accounting (not cash basis)?"
                      value={draft.propTraditionalAccounting}
                      onChange={(propTraditionalAccounting) =>
                        patch({ propTraditionalAccounting })
                      }
                    />
                  </div>
                  <L label="Tax taken off any income in box 20" box="21">
                    <Money
                      value={draft.propTaxTakenOff}
                      onChange={(propTaxTakenOff) =>
                        patch({ propTaxTakenOff })
                      }
                    />
                  </L>
                  <L label="Premiums for the grant of a lease" box="22">
                    <Money
                      value={draft.propLeasePremiums}
                      onChange={(propLeasePremiums) =>
                        patch({ propLeasePremiums })
                      }
                    />
                  </L>
                  <L label="Reverse premiums and inducements" box="23">
                    <Money
                      value={draft.propReversePremiums}
                      onChange={(propReversePremiums) =>
                        patch({ propReversePremiums })
                      }
                    />
                  </L>
                  <L label="Other property income (if any)">
                    <Money
                      value={draft.propOtherIncome}
                      onChange={(propOtherIncome) =>
                        patch({ propOtherIncome })
                      }
                    />
                  </L>

                  <SubHead>
                    Property expenses (24–29) — or total only in box 29 if income
                    under £90,000
                  </SubHead>
                  <L label="Rent, rates, insurance and ground rents" box="24">
                    <Money
                      value={draft.propRentRatesInsurance}
                      onChange={(propRentRatesInsurance) =>
                        patch({ propRentRatesInsurance })
                      }
                    />
                  </L>
                  <L label="Property repairs and maintenance" box="25">
                    <Money
                      value={draft.propRepairs}
                      onChange={(propRepairs) => patch({ propRepairs })}
                    />
                  </L>
                  <L label="Non-residential property finance costs" box="26">
                    <Money
                      value={draft.propNonResFinance}
                      onChange={(propNonResFinance) =>
                        patch({ propNonResFinance })
                      }
                    />
                  </L>
                  <L
                    label="Legal, management and other professional fees"
                    box="27"
                  >
                    <Money
                      value={draft.propLegalFees}
                      onChange={(propLegalFees) => patch({ propLegalFees })}
                    />
                  </L>
                  <L label="Costs of services provided, including wages" box="28">
                    <Money
                      value={draft.propServices}
                      onChange={(propServices) => patch({ propServices })}
                    />
                  </L>
                  <L label="Other allowable property expenses" box="29">
                    <Money
                      value={draft.propOtherExpensesDetail}
                      onChange={(propOtherExpensesDetail) =>
                        patch({ propOtherExpensesDetail })
                      }
                    />
                  </L>
                  <L label="Total expenses (or enter total only here)">
                    <Money
                      value={draft.propExpenses}
                      onChange={(propExpenses) => patch({ propExpenses })}
                    />
                  </L>

                  <SubHead>Adjustments &amp; capital allowances</SubHead>
                  <L label="Private use adjustment" box="30">
                    <Money
                      value={draft.propPrivateUse}
                      onChange={(propPrivateUse) => patch({ propPrivateUse })}
                    />
                  </L>
                  <L label="Balancing charges" box="31">
                    <Money
                      value={draft.propBalancingCharges}
                      onChange={(propBalancingCharges) =>
                        patch({ propBalancingCharges })
                      }
                    />
                  </L>
                  <L label="Annual Investment Allowance" box="32">
                    <Money
                      value={draft.propAia}
                      onChange={(propAia) => patch({ propAia })}
                    />
                  </L>
                  <L label="Structures and Buildings Allowance" box="33">
                    <Money
                      value={draft.propSba}
                      onChange={(propSba) => patch({ propSba })}
                    />
                  </L>
                  <L label="Electric charge-point allowance" box="33.1">
                    <Money
                      value={draft.propElectricCharge}
                      onChange={(propElectricCharge) =>
                        patch({ propElectricCharge })
                      }
                    />
                  </L>
                  <L label="Freeport / Investment Zones SBA" box="33.2">
                    <Money
                      value={draft.propFreeportSba}
                      onChange={(propFreeportSba) =>
                        patch({ propFreeportSba })
                      }
                    />
                  </L>
                  <L label="Zero-emission car allowance" box="34.1">
                    <Money
                      value={draft.propZeroEmissionCar}
                      onChange={(propZeroEmissionCar) =>
                        patch({ propZeroEmissionCar })
                      }
                    />
                  </L>
                  <L label="All other capital allowances" box="35">
                    <Money
                      value={draft.propOtherCapitalAllowances}
                      onChange={(propOtherCapitalAllowances) =>
                        patch({ propOtherCapitalAllowances })
                      }
                    />
                  </L>
                  <L
                    label="Costs of replacing domestic items (residential)"
                    box="36"
                  >
                    <Money
                      value={draft.propReplaceDomesticItems}
                      onChange={(propReplaceDomesticItems) =>
                        patch({ propReplaceDomesticItems })
                      }
                    />
                  </L>
                  <L label="Rent a Room exempt amount" box="37">
                    <Money
                      value={draft.propRentARoomExempt}
                      onChange={(propRentARoomExempt) =>
                        patch({ propRentARoomExempt })
                      }
                    />
                  </L>

                  <SubHead>Residential finance costs (tax reduction)</SubHead>
                  <L label="Residential property finance costs" box="44">
                    <Money
                      value={draft.propFinanceCosts}
                      onChange={(propFinanceCosts) =>
                        patch({ propFinanceCosts })
                      }
                    />
                  </L>
                  <L
                    label="Unused residential finance costs brought forward"
                    box="45"
                  >
                    <Money
                      value={draft.propFinanceCostsBroughtForward}
                      onChange={(propFinanceCostsBroughtForward) =>
                        patch({ propFinanceCostsBroughtForward })
                      }
                    />
                  </L>
                </Section>
              )}
              {!draft.hasEmployment &&
                !draft.hasSelfEmployment &&
                !draft.hasUkProperty && (
                  <p className="text-sm text-ink-soft">
                    No employment, self-employment or property selected on TR2 —
                    continue to other income.
                  </p>
                )}
            </div>
          )}

          {step === "income" && (
            <div className="space-y-4">
              <Section title="UK interest & dividends (TR3 boxes 1–7)">
                <L
                  label="Taxed UK interest – the net amount after tax taken off"
                  box="1"
                >
                  <Money
                    value={draft.interestTaxedUk}
                    onChange={(interestTaxedUk) => patch({ interestTaxedUk })}
                  />
                </L>
                <L
                  label="Untaxed UK interest – amounts which have not had tax taken off"
                  box="2"
                >
                  <Money
                    value={draft.interestUntaxedUk}
                    onChange={(interestUntaxedUk) =>
                      patch({ interestUntaxedUk })
                    }
                  />
                </L>
                <L
                  label="Untaxed foreign interest (up to £2,000)"
                  box="3"
                >
                  <Money
                    value={draft.interestUntaxedForeign}
                    onChange={(interestUntaxedForeign) =>
                      patch({ interestUntaxedForeign })
                    }
                  />
                </L>
                <L label="Dividends from UK companies – amount received" box="4">
                  <Money
                    value={draft.dividendsUk}
                    onChange={(dividendsUk) => patch({ dividendsUk })}
                  />
                </L>
                <L label="Other dividends – amount received" box="5">
                  <Money
                    value={draft.dividendsOther}
                    onChange={(dividendsOther) => patch({ dividendsOther })}
                  />
                </L>
                <L
                  label="Foreign dividends (up to £500) – sterling after foreign tax"
                  box="6"
                >
                  <Money
                    value={draft.dividendsForeign}
                    onChange={(dividendsForeign) =>
                      patch({ dividendsForeign })
                    }
                  />
                </L>
                <L
                  label="Tax taken off foreign dividends – sterling equivalent"
                  box="7"
                >
                  <Money
                    value={draft.dividendsForeignTax}
                    onChange={(dividendsForeignTax) =>
                      patch({ dividendsForeignTax })
                    }
                  />
                </L>
              </Section>
              <Section title="UK pensions & state benefits (TR3 boxes 8–16)">
                <L
                  label="State Pension – amount entitled to receive in the year"
                  box="8"
                >
                  <Money
                    value={draft.statePension}
                    onChange={(statePension) => patch({ statePension })}
                  />
                </L>
                <L label="State Pension lump sum – gross amount" box="9">
                  <Money
                    value={draft.statePensionLumpSum}
                    onChange={(statePensionLumpSum) =>
                      patch({ statePensionLumpSum })
                    }
                  />
                </L>
                <L label="Tax taken off box 9" box="10">
                  <Money
                    value={draft.statePensionLumpSumTax}
                    onChange={(statePensionLumpSumTax) =>
                      patch({ statePensionLumpSumTax })
                    }
                  />
                </L>
                <L
                  label="Pensions (other than State Pension), retirement annuities and taxable lump sums – gross"
                  box="11"
                >
                  <Money
                    value={draft.otherPensions}
                    onChange={(otherPensions) => patch({ otherPensions })}
                  />
                </L>
                <L label="Tax taken off box 11" box="12">
                  <Money
                    value={draft.otherPensionsTax}
                    onChange={(otherPensionsTax) =>
                      patch({ otherPensionsTax })
                    }
                  />
                </L>
                <L
                  label="Taxable Incapacity Benefit and contribution-based ESA"
                  box="13"
                >
                  <Money
                    value={draft.incapacityEsa}
                    onChange={(incapacityEsa) => patch({ incapacityEsa })}
                  />
                </L>
                <L label="Tax taken off Incapacity Benefit in box 13" box="14">
                  <Money
                    value={draft.incapacityTax}
                    onChange={(incapacityTax) => patch({ incapacityTax })}
                  />
                </L>
                <L label="Jobseeker’s Allowance" box="15">
                  <Money
                    value={draft.jobseekersAllowance}
                    onChange={(jobseekersAllowance) =>
                      patch({ jobseekersAllowance })
                    }
                  />
                </L>
                <L
                  label="Total of any other taxable State Pensions and benefits"
                  box="16"
                >
                  <Money
                    value={draft.otherStateBenefits}
                    onChange={(otherStateBenefits) =>
                      patch({ otherStateBenefits })
                    }
                  />
                </L>
              </Section>
              <Section title="Other UK income (TR3 boxes 17–21)">
                <L
                  label="Other taxable income – before expenses and tax taken off"
                  box="17"
                >
                  <Money
                    value={draft.otherTaxableIncome}
                    onChange={(otherTaxableIncome) =>
                      patch({ otherTaxableIncome })
                    }
                  />
                </L>
                <L label="Total amount of allowable expenses" box="18">
                  <Money
                    value={draft.otherIncomeExpenses}
                    onChange={(otherIncomeExpenses) =>
                      patch({ otherIncomeExpenses })
                    }
                  />
                </L>
                <L label="Any tax taken off box 17" box="19">
                  <Money
                    value={draft.otherIncomeTax}
                    onChange={(otherIncomeTax) => patch({ otherIncomeTax })}
                  />
                </L>
                <L label="Benefit from pre-owned assets" box="20">
                  <Money
                    value={draft.preOwnedAssets}
                    onChange={(preOwnedAssets) => patch({ preOwnedAssets })}
                  />
                </L>
                <L
                  label="Description of income in boxes 17 and 20"
                  box="21"
                  className="sm:col-span-2"
                >
                  <input
                    className="input"
                    value={draft.otherIncomeDescription}
                    onChange={(e) =>
                      patch({ otherIncomeDescription: e.target.value })
                    }
                  />
                </L>
              </Section>
            </div>
          )}

          {step === "reliefs" && (
            <div className="space-y-4">
              <Section title="Pension contributions (TR4.1–4)">
                <L label="Payments with relief at source" box="TR4.1">
                  <Money
                    value={draft.pensionReliefAtSource}
                    onChange={(pensionReliefAtSource) =>
                      patch({ pensionReliefAtSource })
                    }
                  />
                </L>
                <L label="One-off payments in box 1" box="TR4.1.1">
                  <Money
                    value={draft.pensionOneOff}
                    onChange={(pensionOneOff) => patch({ pensionOneOff })}
                  />
                </L>
                <L label="Retirement annuity contract" box="TR4.2">
                  <Money
                    value={draft.retirementAnnuity}
                    onChange={(retirementAnnuity) =>
                      patch({ retirementAnnuity })
                    }
                  />
                </L>
                <L label="Employer scheme not deducted from pay" box="TR4.3">
                  <Money
                    value={draft.employerPensionNotDeducted}
                    onChange={(employerPensionNotDeducted) =>
                      patch({ employerPensionNotDeducted })
                    }
                  />
                </L>
                <L label="Overseas pension scheme" box="TR4.4">
                  <Money
                    value={draft.overseasPension}
                    onChange={(overseasPension) => patch({ overseasPension })}
                  />
                </L>
              </Section>
              <Section title="Charitable giving (TR4.5–10)">
                <L label="Gift Aid payments" box="TR4.5">
                  <Money
                    value={draft.giftAid}
                    onChange={(giftAid) => patch({ giftAid })}
                  />
                </L>
                <L label="One-off Gift Aid in box 5" box="TR4.6">
                  <Money
                    value={draft.giftAidOneOff}
                    onChange={(giftAidOneOff) => patch({ giftAidOneOff })}
                  />
                </L>
                <L label="Gift Aid carried back" box="TR4.7">
                  <Money
                    value={draft.giftAidCarryBack}
                    onChange={(giftAidCarryBack) =>
                      patch({ giftAidCarryBack })
                    }
                  />
                </L>
                <L label="Gift Aid treated as this year" box="TR4.8">
                  <Money
                    value={draft.giftAidTreatAsThisYear}
                    onChange={(giftAidTreatAsThisYear) =>
                      patch({ giftAidTreatAsThisYear })
                    }
                  />
                </L>
                <L label="Shares gifted to charity" box="TR4.9">
                  <Money
                    value={draft.sharesToCharity}
                    onChange={(sharesToCharity) => patch({ sharesToCharity })}
                  />
                </L>
                <L label="Land / buildings gifted to charity" box="TR4.10">
                  <Money
                    value={draft.landToCharity}
                    onChange={(landToCharity) => patch({ landToCharity })}
                  />
                </L>
              </Section>
              <Section title="Student loan & Child Benefit (TR5)">
                <L label="Student loan plan">
                  <select
                    className="input"
                    value={draft.studentLoanPlan}
                    onChange={(e) =>
                      patch({
                        studentLoanPlan: e.target
                          .value as Sa100Draft["studentLoanPlan"],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="plan1">Plan 1</option>
                    <option value="plan2">Plan 2</option>
                    <option value="plan4">Plan 4</option>
                    <option value="plan5">Plan 5</option>
                  </select>
                </L>
                <L label="Student Loan deducted by employer" box="TR5.2">
                  <Money
                    value={draft.studentLoanDeducted}
                    onChange={(studentLoanDeducted) =>
                      patch({ studentLoanDeducted })
                    }
                  />
                </L>
                <L label="Postgraduate Loan deducted" box="TR5.3">
                  <Money
                    value={draft.postgraduateLoanDeducted}
                    onChange={(postgraduateLoanDeducted) =>
                      patch({ postgraduateLoanDeducted })
                    }
                  />
                </L>
                <L label="Child Benefit received" box="TR5">
                  <Money
                    value={draft.childBenefitAmount}
                    onChange={(childBenefitAmount) =>
                      patch({ childBenefitAmount })
                    }
                  />
                </L>
                <L label="Number of children">
                  <input
                    className="input placeholder:text-ink-soft/50"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={
                      draft.childBenefitChildren
                        ? String(draft.childBenefitChildren)
                        : ""
                    }
                    onChange={(e) =>
                      patch({
                        childBenefitChildren:
                          Number(e.target.value.replace(/\D/g, "")) || 0,
                      })
                    }
                  />
                </L>
              </Section>
              <details className="group rounded-xl border border-line bg-white open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-sea marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>Allowances</span>
                  <span className="text-xs font-semibold normal-case tracking-normal text-ink-soft group-open:hidden">
                    Add details
                  </span>
                  <span className="hidden text-xs font-semibold normal-case tracking-normal text-ink-soft group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="space-y-3 border-t border-line px-4 py-3">
                  <YN
                    label="Blind Person’s Allowance"
                    value={draft.blindPerson}
                    onChange={(blindPerson) => patch({ blindPerson })}
                  />
                  <YN
                    label="Transfer Marriage Allowance out"
                    value={draft.marriageTransferOut}
                    onChange={(marriageTransferOut) =>
                      patch({ marriageTransferOut })
                    }
                  />
                  <YN
                    label="Receive Marriage Allowance"
                    value={draft.marriageReceive}
                    onChange={(marriageReceive) => patch({ marriageReceive })}
                  />
                </div>
              </details>
            </div>
          )}

          {step === "finish" && (
            <>
              <L label="Any other information" box="TR7.19">
                <textarea
                  className="input min-h-24"
                  value={draft.anyOtherInformation}
                  onChange={(e) =>
                    patch({ anyOtherInformation: e.target.value })
                  }
                />
              </L>
              <L label="Your name" box="TR8.22">
                <input
                  className="input"
                  value={draft.declarationName}
                  onChange={(e) =>
                    patch({ declarationName: e.target.value })
                  }
                />
              </L>
              <L label="Date">
                <input
                  className="input"
                  type="date"
                  value={draft.declarationDate}
                  onChange={(e) =>
                    patch({ declarationDate: e.target.value })
                  }
                />
              </L>
              <YN
                label="I declare this return is correct and complete"
                value={draft.declarationAccepted}
                onChange={(declarationAccepted) =>
                  patch({ declarationAccepted })
                }
              />
            </>
          )}

        </div>

        <FormErrorBanner error={error} />
        {ok && <p className="mt-3 text-sm font-semibold text-ok">{ok}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={i === 0 || pending}
            onClick={() => setI((x) => Math.max(0, x - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() =>
              persistDraft({ message: "Draft saved — SA100 & SA302 updated." })
            }
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          {!last ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || (step === "work" && natureMissing)}
              onClick={() => {
                if (step === "work" && natureMissing) {
                  setError(
                    "Confirm the nature of business before continuing.",
                  );
                  return;
                }
                // Autosave as you move through the return.
                persistDraft({
                  advance: true,
                  message: "Progress saved.",
                });
              }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !draft.declarationAccepted}
              onClick={() => {
                setError(null);
                start(async () => {
                  try {
                    // Keep a draft snapshot (with PDFs) before submit.
                    const saved = await saveSa100Draft({
                      clientId,
                      draft,
                      taxpayerId,
                    });
                    setReturnId(saved.id);
                    const res = await submitSa100Return({
                      clientId,
                      draft,
                      taxpayerId,
                      fraudMetadata: gatherFraudMetadata(),
                    });
                    setReturnId(res.id);
                    setOk(
                      res.demo
                        ? `Demo accepted · ${res.correlationId} — SA100 & SA302 PDFs ready`
                        : `Submitted · ${res.correlationId}`,
                    );
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Submit failed",
                    );
                  }
                });
              }}
            >
              {pending ? "Submitting…" : "Submit Self Assessment"}
            </button>
          )}
        </div>

        {returnId ? (
          <div className="mt-4">
            <SaReturnDocuments
              clientId={clientId}
              returnId={returnId}
              taxYear={draft.taxYear || taxYear}
              personName={clientName}
              defaultEmail={contactEmail}
            />
          </div>
        ) : null}
      </div>

      <aside className="panel sticky top-24 h-fit p-4">
        <h3 className="display text-lg">Tax estimate</h3>
        <p className="display mt-2 text-2xl text-ink">
          {calc.amountDue > 0
            ? gbp(calc.amountDue)
            : calc.refundDue > 0
              ? gbp(calc.refundDue)
              : gbp(0)}
        </p>
        <p className="text-xs text-ink-soft">
          {calc.amountDue > 0
            ? "to pay"
            : calc.refundDue > 0
              ? "refund"
              : "balanced"}{" "}
          · {clientName}
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Income</dt>
            <dd className="font-semibold tabular-nums">{gbp(calc.totalIncome)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Personal allowance</dt>
            <dd className="font-semibold tabular-nums">
              {gbp(calc.personalAllowance)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Income Tax</dt>
            <dd className="font-semibold tabular-nums">{gbp(calc.incomeTax)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Class 4 NIC</dt>
            <dd className="font-semibold tabular-nums">{gbp(calc.class4Nic)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Paid already</dt>
            <dd className="font-semibold tabular-nums">{gbp(calc.taxDeducted)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
