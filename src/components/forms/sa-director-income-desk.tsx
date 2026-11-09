"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  companyRoleLabel,
  type SaTaxpayer,
} from "@/lib/sa-taxpayer";
import type { PracticeDirector } from "@/server/actions/sa-directors";
import {
  companyIncomeTotal,
  otherIncomeNet,
  type SaCompanyIncome,
  type SaOtherIncome,
} from "@/lib/sa-income";
import {
  refreshCompanyPayeFromPayroll,
  saveTaxpayerIncomes,
} from "@/server/actions/sa-directors";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import type { PayePullMeta } from "@/server/sa/pull-paye-into-company";

function FieldLabel({
  label,
  box,
}: {
  label: string;
  box?: string;
}) {
  return (
    <span className="flex min-h-[2.75rem] items-start justify-between gap-2">
      <span className="leading-snug">{label}</span>
      {box ? (
        <span className="shrink-0 text-[10px] font-semibold text-sea">
          Box {box}
        </span>
      ) : null}
    </span>
  );
}

function MoneyInput({
  value,
  onChange,
  label,
  box,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  box?: string;
}) {
  return (
    <label className="flex flex-col text-xs font-semibold text-ink-soft">
      <FieldLabel label={label} box={box} />
      <input
        type="number"
        min={0}
        step={1}
        className="input mt-1 w-full text-sm"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

function TextField({
  value,
  onChange,
  label,
  box,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  box?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col text-xs font-semibold text-ink-soft">
      <FieldLabel label={label} box={box} />
      <input
        className="input mt-1 w-full text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Accordion({
  title,
  subtitle,
  trailing,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="group gloss-card overflow-hidden rounded-2xl border border-line/80 bg-white/90"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 md:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 mono text-xs text-ink-soft">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {trailing}
          <span className="text-xs font-bold text-sea group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs font-bold text-sea group-open:inline">
            Close
          </span>
        </div>
      </summary>
      <div className="border-t border-line/70 px-4 pb-4 pt-3 md:px-5 md:pb-5">
        {children}
      </div>
    </details>
  );
}

export function SaDirectorIncomeDesk({
  homeClientId,
  person,
  initialTaxpayer,
  taxYear,
}: {
  homeClientId: string;
  person: PracticeDirector;
  initialTaxpayer: SaTaxpayer;
  /** Active SA tax year â€” company save refreshes this draft. */
  taxYear?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [companies, setCompanies] = useState<SaCompanyIncome[]>(
    () => initialTaxpayer.companyIncomes ?? [],
  );
  const [others, setOthers] = useState<SaOtherIncome[]>(
    () => initialTaxpayer.otherIncomes ?? [],
  );
  const [payePulls, setPayePulls] = useState<PayePullMeta[]>([]);

  const totals = useMemo(() => {
    const fromCos = companies.reduce((s, c) => s + companyIncomeTotal(c), 0);
    const fromOther = others.reduce((s, o) => s + otherIncomeNet(o), 0);
    return { fromCos, fromOther, all: fromCos + fromOther };
  }, [companies, others]);

  function patchCompany(clientId: string, patch: Partial<SaCompanyIncome>) {
    setCompanies((rows) =>
      rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
    );
  }

  function save(companyClientId?: string) {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        await saveTaxpayerIncomes({
          clientId: homeClientId,
          taxpayerId: initialTaxpayer.id,
          companyIncomes: companies,
          otherIncomes: others,
          taxYear,
        });
        const name = companyClientId
          ? companies.find((c) => c.clientId === companyClientId)?.companyName
          : null;
        setOk(
          name
            ? `${name} saved â€” current Self Assessment draft updated.`
            : "Income saved â€” current Self Assessment draft updated.",
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  const isDirectorRole = (role: SaCompanyIncome["role"]) =>
    role === "director" || role === "director_shareholder";

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="display text-2xl text-ink">Income by company</h3>
            <p className="mt-1 max-w-2xl text-xs text-ink-soft">
              PAYE pay and tax fill in automatically when this personâ€™s NINO,
              date of birth and address match an employee on that companyâ€™s
              payroll. If any check fails, PAYE figures are left blank.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="mono text-sm font-semibold text-sea">
              Total Â£
              {totals.all.toLocaleString("en-GB", {
                maximumFractionDigits: 0,
              })}
            </p>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              disabled={pending}
              onClick={() => {
                setError(null);
                setOk(null);
                start(async () => {
                  try {
                    const result = await refreshCompanyPayeFromPayroll({
                      clientId: homeClientId,
                      taxpayerId: initialTaxpayer.id,
                      taxYear,
                    });
                    setCompanies(result.taxpayer.companyIncomes ?? []);
                    setPayePulls(result.pulls);
                    const matched = result.pulls.filter((p) => p.matched).length;
                    setOk(
                      matched
                        ? `Pulled PAYE for ${matched} compan${matched === 1 ? "y" : "ies"} â€” Self Assessment draft updated.`
                        : "No PAYE match (need matching NINO, date of birth and address on the employee).",
                    );
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "PAYE refresh failed",
                    );
                  }
                });
              }}
            >
              {pending ? "Refreshingâ€¦" : "Refresh from PAYE"}
            </button>
          </div>
        </div>
        {companies.map((c) => {
          const pull = payePulls.find((p) => p.clientId === c.clientId);
          return (
          <Accordion
            key={c.clientId}
            title={c.companyName}
            subtitle={`${c.companyNumber || "No company number"} Â· ${companyRoleLabel(c.role)}${
              pull?.matched
                ? " Â· From PAYE"
                : pull && !pull.matched
                  ? " Â· PAYE not matched"
                  : ""
            }`}
            trailing={
              <span className="flex items-center gap-3">
                <span className="text-sm font-semibold text-sea">
                  Â£
                  {companyIncomeTotal(c).toLocaleString("en-GB", {
                    maximumFractionDigits: 0,
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn-primary text-xs"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    save(c.clientId);
                  }}
                >
                  {pending ? "Savingâ€¦" : "Save"}
                </button>
              </span>
            }
          >
            <div className="space-y-4">
              {pull && !pull.matched && pull.reason ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {pull.reason}
                </p>
              ) : null}
              {pull?.matched ? (
                <p className="rounded-lg border border-sea/20 bg-sea/5 px-3 py-2 text-xs text-ink-soft">
                  Employment pay and tax taken from this companyâ€™s PAYE for the
                  current tax year (identity matched on NINO, date of birth and
                  address).
                </p>
              ) : null}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sea">
                  SA102 Employment
                </p>
                <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MoneyInput
                    label="Pay from this employment (P60/P45)"
                    box="1"
                    value={c.payePay}
                    onChange={(n) => patchCompany(c.clientId, { payePay: n })}
                  />
                  <MoneyInput
                    label="UK tax taken off"
                    box="2"
                    value={c.payeTax}
                    onChange={(n) => patchCompany(c.clientId, { payeTax: n })}
                  />
                  <MoneyInput
                    label="Tips / other not on P60"
                    box="3"
                    value={c.tips ?? 0}
                    onChange={(n) => patchCompany(c.clientId, { tips: n })}
                  />
                  <TextField
                    label="Employer PAYE reference"
                    box="4"
                    value={c.payeRef}
                    placeholder="123/AB45678"
                    onChange={(payeRef) =>
                      patchCompany(c.clientId, { payeRef })
                    }
                  />
                  <MoneyInput
                    label="Other benefits (P11D)"
                    box="15"
                    value={c.benefits ?? 0}
                    onChange={(n) => patchCompany(c.clientId, { benefits: n })}
                  />
                  <MoneyInput
                    label="Employment expenses (travel, subs, etc.)"
                    box="17â€“20"
                    value={c.employmentExpenses ?? 0}
                    onChange={(n) =>
                      patchCompany(c.clientId, { employmentExpenses: n })
                    }
                  />
                </div>
                {!isDirectorRole(c.role) ? (
                  <p className="mt-2 text-xs text-ink-soft">
                    Shareholder only â€” leave pay blank unless they also had PAYE
                    from this company. Dividends still apply.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sea">
                  Dividends &amp; shareholding
                </p>
                <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MoneyInput
                    label="UK dividends from this company"
                    box="SA100.4 / 7.3"
                    value={c.dividends}
                    onChange={(n) =>
                      patchCompany(c.clientId, { dividends: n })
                    }
                  />
                  <MoneyInput
                    label="Shareholding %"
                    box="7.4"
                    value={c.shareholdingPct ?? 0}
                    onChange={(n) =>
                      patchCompany(c.clientId, { shareholdingPct: n })
                    }
                  />
                </div>
              </div>

              {isDirectorRole(c.role) ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sea">
                    Director loan / CIS
                  </p>
                  <div className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MoneyInput
                      label="CIS / subcontractor gross"
                      box="SA103S.9"
                      value={c.subcontractorGross}
                      onChange={(n) =>
                        patchCompany(c.clientId, { subcontractorGross: n })
                      }
                    />
                    <MoneyInput
                      label="CIS tax deducted"
                      box="SA103S.38"
                      value={c.subcontractorTax}
                      onChange={(n) =>
                        patchCompany(c.clientId, { subcontractorTax: n })
                      }
                    />
                    <MoneyInput
                      label="Director loan drawn"
                      value={c.directorLoan}
                      onChange={(n) =>
                        patchCompany(c.clientId, { directorLoan: n })
                      }
                    />
                    <label className="flex min-h-[4.5rem] items-end gap-2 pb-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={c.directorLoanTaxable}
                        onChange={(e) =>
                          patchCompany(c.clientId, {
                            directorLoanTaxable: e.target.checked,
                          })
                        }
                      />
                      Treat loan as taxable this year
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => save(c.clientId)}
                >
                  {pending ? "Savingâ€¦" : "Save company income"}
                </button>
              </div>
            </div>
          </Accordion>
          );
        })}
      </section>

      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
    </div>
  );
}
