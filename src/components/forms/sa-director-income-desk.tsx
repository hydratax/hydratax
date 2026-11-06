"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  companyRoleLabel,
  type SaTaxpayer,
} from "@/lib/sa-taxpayer";
import type { PracticeDirector } from "@/server/actions/sa-directors";
import {
  SA_OTHER_KIND_LABELS,
  SA_PROP_EXPENSE_FIELDS,
  SA_SE_EXPENSE_FIELDS,
  companyIncomeTotal,
  emptyPropExpenses,
  emptySeExpenses,
  otherIncomeExpenseTotal,
  otherIncomeNet,
  sumPropExpenses,
  sumSeExpenses,
  type SaCompanyIncome,
  type SaOtherIncome,
  type SaOtherIncomeKind,
  type SaPropertyExpenses,
  type SaSeExpenses,
} from "@/lib/sa-income";
import {
  addOtherIncomeLine,
  removeOtherIncomeLine,
  saveTaxpayerIncomes,
} from "@/server/actions/sa-directors";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

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
    <label className="block text-xs font-semibold text-ink-soft">
      <span className="flex flex-wrap items-baseline justify-between gap-1">
        <span>{label}</span>
        {box ? (
          <span className="mono text-[10px] font-bold text-sea">Box {box}</span>
        ) : null}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        className="input mono mt-1 w-full text-sm"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
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
}: {
  homeClientId: string;
  person: PracticeDirector;
  initialTaxpayer: SaTaxpayer;
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

  function patchOther(id: string, patch: Partial<SaOtherIncome>) {
    setOthers((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function patchSe(id: string, key: keyof SaSeExpenses, n: number) {
    setOthers((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const se = emptySeExpenses(r.seExpenses);
        se[key] = n;
        return {
          ...r,
          seExpenses: se,
          expenses: sumSeExpenses(se),
          claimTradingAllowance: false,
        };
      }),
    );
  }

  function patchProp(id: string, key: keyof SaPropertyExpenses, n: number) {
    setOthers((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const prop = emptyPropExpenses(r.propExpenses);
        prop[key] = n;
        return {
          ...r,
          propExpenses: prop,
          expenses: sumPropExpenses(prop),
          claimPropertyAllowance: false,
        };
      }),
    );
  }

  function save() {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        await saveTaxpayerIncomes({
          clientId: homeClientId,
          taxpayerId: initialTaxpayer.id,
          companyIncomes: companies,
          otherIncomes: others,
        });
        setOk("Income saved — SA100 will use these totals.");
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
          <h3 className="display text-2xl text-ink">Income by company</h3>
          <p className="mono text-sm font-semibold text-sea">
            Total £
            {totals.all.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
          </p>
        </div>
        {companies.map((c) => (
          <Accordion
            key={c.clientId}
            title={c.companyName}
            subtitle={`${c.companyNumber || "No company number"} · ${companyRoleLabel(c.role)}`}
            trailing={
              <span className="text-sm font-semibold text-sea">
                £
                {companyIncomeTotal(c).toLocaleString("en-GB", {
                  maximumFractionDigits: 0,
                })}
              </span>
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-sea">
                  SA102 Employment
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <label className="block text-xs font-semibold text-ink-soft">
                    <span className="flex justify-between gap-1">
                      <span>Employer PAYE reference</span>
                      <span className="mono text-[10px] font-bold text-sea">
                        Box 4
                      </span>
                    </span>
                    <input
                      className="input mono mt-1 w-full text-sm"
                      value={c.payeRef}
                      onChange={(e) =>
                        patchCompany(c.clientId, { payeRef: e.target.value })
                      }
                    />
                  </label>
                  <MoneyInput
                    label="Other benefits (P11D)"
                    box="15"
                    value={c.benefits ?? 0}
                    onChange={(n) => patchCompany(c.clientId, { benefits: n })}
                  />
                  <MoneyInput
                    label="Employment expenses (travel, subs, etc.)"
                    box="17–20"
                    value={c.employmentExpenses ?? 0}
                    onChange={(n) =>
                      patchCompany(c.clientId, { employmentExpenses: n })
                    }
                  />
                </div>
                {!isDirectorRole(c.role) ? (
                  <p className="mt-2 text-xs text-ink-soft">
                    Shareholder only — leave pay blank unless they also had PAYE
                    from this company. Dividends still apply.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-sea">
                  Dividends &amp; shareholding
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <p className="text-[11px] font-bold uppercase tracking-wide text-sea">
                    Director loan / CIS
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-ink">
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
            </div>
          </Accordion>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="display text-2xl text-ink">
            Self-employment, property &amp; other
          </h3>
          <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
            Add
            <select
              className="input text-sm"
              defaultValue=""
              disabled={pending}
              onChange={(e) => {
                const kind = e.target.value as SaOtherIncomeKind | "";
                e.target.value = "";
                if (!kind) return;
                start(async () => {
                  try {
                    const saved = await addOtherIncomeLine({
                      clientId: homeClientId,
                      taxpayerId: initialTaxpayer.id,
                      kind,
                      label: SA_OTHER_KIND_LABELS[kind],
                    });
                    setOthers(saved.otherIncomes ?? []);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                });
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              {(
                [
                  "rental",
                  "taxi",
                  "payroll_other",
                  "self_employment",
                  "other",
                ] as SaOtherIncomeKind[]
              ).map((kind) => (
                <option key={kind} value={kind}>
                  {SA_OTHER_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {others.length === 0 ? null : (
          <ul className="space-y-3">
            {others.map((o) => {
              const net = otherIncomeNet(o);
              const expTotal = otherIncomeExpenseTotal(o);
              return (
                <li key={o.id}>
                  <Accordion
                    title={SA_OTHER_KIND_LABELS[o.kind]}
                    subtitle={o.label || undefined}
                    trailing={
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-sea">
                          Net £
                          {net.toLocaleString("en-GB", {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-ink-soft hover:text-amber-800"
                          disabled={pending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!confirm("Remove this income source?")) return;
                            start(async () => {
                              try {
                                const saved = await removeOtherIncomeLine({
                                  clientId: homeClientId,
                                  taxpayerId: initialTaxpayer.id,
                                  lineId: o.id,
                                });
                                setOthers(saved.otherIncomes ?? []);
                                router.refresh();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Remove failed",
                                );
                              }
                            });
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    }
                    defaultOpen={false}
                  >
                    {(o.kind === "taxi" || o.kind === "self_employment") && (
                      <SeIncomeForm
                        o={o}
                        expTotal={expTotal}
                        patchOther={patchOther}
                        patchSe={patchSe}
                      />
                    )}
                    {o.kind === "rental" && (
                      <PropIncomeForm
                        o={o}
                        expTotal={expTotal}
                        patchOther={patchOther}
                        patchProp={patchProp}
                      />
                    )}
                    {o.kind === "payroll_other" && (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
                          Employer name (SA102 box 5)
                          <input
                            className="input mt-1 w-full text-sm"
                            value={o.label}
                            onChange={(e) =>
                              patchOther(o.id, { label: e.target.value })
                            }
                          />
                        </label>
                        <MoneyInput
                          label="Pay before tax"
                          box="1"
                          value={o.amount}
                          onChange={(n) => patchOther(o.id, { amount: n })}
                        />
                        <MoneyInput
                          label="UK tax taken off"
                          box="2"
                          value={o.taxTakenOff}
                          onChange={(n) =>
                            patchOther(o.id, { taxTakenOff: n })
                          }
                        />
                      </div>
                    )}
                    {o.kind === "other" && (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
                          Description (SA100)
                          <input
                            className="input mt-1 w-full text-sm"
                            value={o.label}
                            onChange={(e) =>
                              patchOther(o.id, { label: e.target.value })
                            }
                          />
                        </label>
                        <MoneyInput
                          label="Other taxable income"
                          box="17"
                          value={o.amount}
                          onChange={(n) => patchOther(o.id, { amount: n })}
                        />
                        <MoneyInput
                          label="Expenses against that income"
                          value={o.expenses}
                          onChange={(n) => patchOther(o.id, { expenses: n })}
                        />
                        <MoneyInput
                          label="Tax taken off"
                          value={o.taxTakenOff}
                          onChange={(n) =>
                            patchOther(o.id, { taxTakenOff: n })
                          }
                        />
                      </div>
                    )}
                  </Accordion>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={save}
      >
        {pending ? "Saving…" : "Save income & refresh SA100"}
      </button>
    </div>
  );
}

function SeIncomeForm({
  o,
  expTotal,
  patchOther,
  patchSe,
}: {
  o: SaOtherIncome;
  expTotal: number;
  patchOther: (id: string, patch: Partial<SaOtherIncome>) => void;
  patchSe: (id: string, key: keyof SaSeExpenses, n: number) => void;
}) {
  const se = emptySeExpenses(o.seExpenses);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          Business / trading name
          <input
            className="input mt-1 w-full text-sm"
            value={o.label}
            onChange={(e) => patchOther(o.id, { label: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          <span className="flex justify-between">
            <span>Description of business</span>
            <span className="mono text-[10px] font-bold text-sea">Box 1</span>
          </span>
          <input
            className="input mt-1 w-full text-sm"
            value={o.businessDescription ?? ""}
            placeholder={
              o.kind === "taxi" ? "Taxi / private hire" : "e.g. Plumbing"
            }
            onChange={(e) =>
              patchOther(o.id, { businessDescription: e.target.value })
            }
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          <span className="flex justify-between">
            <span>Business postcode</span>
            <span className="mono text-[10px] font-bold text-sea">Box 2</span>
          </span>
          <input
            className="input mono mt-1 w-full text-sm"
            value={o.businessPostcode ?? ""}
            onChange={(e) =>
              patchOther(o.id, { businessPostcode: e.target.value })
            }
          />
        </label>
        <MoneyInput
          label="Turnover (takings, fees, sales)"
          box="9"
          value={o.amount}
          onChange={(n) => patchOther(o.id, { amount: n })}
        />
        <MoneyInput
          label="Any other business income"
          box="10"
          value={o.otherBusinessIncome ?? 0}
          onChange={(n) => patchOther(o.id, { otherBusinessIncome: n })}
        />
        <MoneyInput
          label="CIS / tax taken off"
          box="38"
          value={o.taxTakenOff}
          onChange={(n) => patchOther(o.id, { taxTakenOff: n })}
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
        <input
          type="checkbox"
          checked={Boolean(o.claimTradingAllowance)}
          onChange={(e) =>
            patchOther(o.id, {
              claimTradingAllowance: e.target.checked,
              expenses: e.target.checked ? Math.min(1000, o.amount) : expTotal,
            })
          }
        />
        Claim £1,000 trading income allowance (SA103S box 10.1) — cannot also
        claim expenses
      </label>

      {!o.claimTradingAllowance ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sea">
              Allowable expenses (SA103S boxes 11–19)
            </p>
            <p className="mono text-xs text-ink-soft">
              Box 20 total £
              {expTotal.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SA_SE_EXPENSE_FIELDS.map((f) => (
              <MoneyInput
                key={f.key}
                label={f.label}
                box={f.box}
                value={se[f.key]}
                onChange={(n) => patchSe(o.id, f.key, n)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PropIncomeForm({
  o,
  expTotal,
  patchOther,
  patchProp,
}: {
  o: SaOtherIncome;
  expTotal: number;
  patchOther: (id: string, patch: Partial<SaOtherIncome>) => void;
  patchProp: (id: string, key: keyof SaPropertyExpenses, n: number) => void;
}) {
  const prop = emptyPropExpenses(o.propExpenses);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          Property label
          <input
            className="input mt-1 w-full text-sm"
            value={o.label}
            onChange={(e) => patchOther(o.id, { label: e.target.value })}
          />
        </label>
        <MoneyInput
          label="Number of properties"
          box="1"
          value={o.propertyCount ?? 0}
          onChange={(n) => patchOther(o.id, { propertyCount: n })}
        />
        <MoneyInput
          label="Total rents and other income"
          box="20"
          value={o.amount}
          onChange={(n) => patchOther(o.id, { amount: n })}
        />
        <MoneyInput
          label="Tax taken off any income in box 20"
          box="21"
          value={o.taxTakenOff}
          onChange={(n) => patchOther(o.id, { taxTakenOff: n })}
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
        <input
          type="checkbox"
          checked={Boolean(o.claimPropertyAllowance)}
          onChange={(e) =>
            patchOther(o.id, {
              claimPropertyAllowance: e.target.checked,
              expenses: e.target.checked ? Math.min(1000, o.amount) : expTotal,
            })
          }
        />
        Claim £1,000 property income allowance (SA105 box 20.1) — cannot also
        claim expenses or residential finance relief
      </label>

      {!o.claimPropertyAllowance ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sea">
              Property expenses (SA105)
            </p>
            <p className="mono text-xs text-ink-soft">
              Deductible £
              {expTotal.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Residential mortgage interest goes in box 44 (20% tax reduction) —
            it is not deducted from profit like boxes 24–29.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SA_PROP_EXPENSE_FIELDS.map((f) => (
              <MoneyInput
                key={f.key}
                label={f.label}
                box={f.box}
                value={prop[f.key]}
                onChange={(n) => patchProp(o.id, f.key, n)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
