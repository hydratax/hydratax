"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { emptySa100Draft, type Sa100Draft } from "@/lib/sa100/schema";
import { calculateSa302 } from "@/lib/sa100/calculate";
import { TAX_YEAR_LABEL } from "@/lib/sa100/rates-2025-26";
import { saveSa100Draft, submitSa100Return } from "@/server/actions/sa100";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const STEPS = [
  "about",
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
}: {
  label: string;
  box?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label">
        {box ? <span className="font-mono text-ink-soft">{box} · </span> : null}
        {label}
      </span>
      {children}
    </label>
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
      className="input font-mono"
      type="number"
      min={0}
      step={1}
      value={value || 0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
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
  utr,
  nino,
  initial,
}: {
  clientId: string;
  clientName: string;
  utr?: string | null;
  nino?: string | null;
  initial?: Partial<Sa100Draft> | null;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState(() =>
    emptySa100Draft({
      taxYear: TAX_YEAR_LABEL,
      utr: utr ?? "",
      nino: nino ?? "",
      ...(initial ?? {}),
    }),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);

  const calc = useMemo(() => calculateSa302(draft), [draft]);
  const patch = (p: Partial<Sa100Draft>) =>
    setDraft((d) => emptySa100Draft({ ...d, ...p }));
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="panel p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          SA100 · {TAX_YEAR_LABEL} · step {i + 1}/{STEPS.length}
        </p>
        <h2 className="display mt-1 text-2xl text-ink">
          {step === "about" && "About you (TR1)"}
          {step === "pages" && "What makes up your return (TR2)"}
          {step === "work" && "Employment, self-employment & property"}
          {step === "income" && "Interest, dividends & pensions (TR3)"}
          {step === "reliefs" && "Reliefs & charges (TR4–TR5)"}
          {step === "finish" && "Declaration (TR7–TR8)"}
          {step === "preview" && "Tax due before you submit"}
        </h2>

        <div className="mt-6 space-y-3">
          {step === "about" && (
            <>
              <L label="UTR" box="Front">
                <input
                  className="input font-mono"
                  value={draft.utr}
                  onChange={(e) => patch({ utr: e.target.value })}
                />
              </L>
              <L label="National Insurance number">
                <input
                  className="input font-mono"
                  value={draft.nino}
                  onChange={(e) =>
                    patch({ nino: e.target.value.toUpperCase() })
                  }
                />
              </L>
              <L label="Date of birth" box="TR1.1">
                <input
                  className="input"
                  type="date"
                  value={draft.dateOfBirth}
                  onChange={(e) => patch({ dateOfBirth: e.target.value })}
                />
              </L>
              <L label="Phone" box="TR1.3">
                <input
                  className="input"
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
              </L>
            </>
          )}

          {step === "pages" && (
            <>
              <YN
                label="1. Employment?"
                value={draft.hasEmployment}
                onChange={(hasEmployment) =>
                  patch({
                    hasEmployment,
                    employments:
                      hasEmployment && !draft.employments.length
                        ? [
                            {
                              employerName: "",
                              payeRef: "",
                              pay: 0,
                              taxTakenOff: 0,
                              tips: 0,
                              benefits: 0,
                            },
                          ]
                        : draft.employments,
                  })
                }
              />
              <YN
                label="2. Self-employment?"
                value={draft.hasSelfEmployment}
                onChange={(hasSelfEmployment) =>
                  patch({ hasSelfEmployment })
                }
              />
              <YN
                label="4. UK property?"
                value={draft.hasUkProperty}
                onChange={(hasUkProperty) => patch({ hasUkProperty })}
              />
              <YN
                label="7. Capital gains?"
                value={draft.hasCapitalGains}
                onChange={(hasCapitalGains) => patch({ hasCapitalGains })}
              />
            </>
          )}

          {step === "work" && (
            <>
              {draft.hasEmployment &&
                draft.employments.map((e, idx) => (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2"
                  >
                    <L label="Employer">
                      <input
                        className="input"
                        value={e.employerName}
                        onChange={(ev) => {
                          const employments = [...draft.employments];
                          employments[idx] = {
                            ...e,
                            employerName: ev.target.value,
                          };
                          patch({ employments });
                        }}
                      />
                    </L>
                    <L label="Pay" box="SA102.1">
                      <Money
                        value={e.pay}
                        onChange={(pay) => {
                          const employments = [...draft.employments];
                          employments[idx] = { ...e, pay };
                          patch({ employments });
                        }}
                      />
                    </L>
                    <L label="Tax taken off" box="SA102.2">
                      <Money
                        value={e.taxTakenOff}
                        onChange={(taxTakenOff) => {
                          const employments = [...draft.employments];
                          employments[idx] = { ...e, taxTakenOff };
                          patch({ employments });
                        }}
                      />
                    </L>
                  </div>
                ))}
              {draft.hasSelfEmployment && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <L label="SE turnover">
                    <Money
                      value={draft.seTurnover}
                      onChange={(seTurnover) => patch({ seTurnover })}
                    />
                  </L>
                  <L label="SE expenses">
                    <Money
                      value={draft.seExpenses}
                      onChange={(seExpenses) => patch({ seExpenses })}
                    />
                  </L>
                  <L label="Capital allowances">
                    <Money
                      value={draft.seCapitalAllowances}
                      onChange={(seCapitalAllowances) =>
                        patch({ seCapitalAllowances })
                      }
                    />
                  </L>
                </div>
              )}
              {draft.hasUkProperty && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <L label="Property rents">
                    <Money
                      value={draft.propRents}
                      onChange={(propRents) => patch({ propRents })}
                    />
                  </L>
                  <L label="Property expenses">
                    <Money
                      value={draft.propExpenses}
                      onChange={(propExpenses) => patch({ propExpenses })}
                    />
                  </L>
                </div>
              )}
              {!draft.hasEmployment &&
                !draft.hasSelfEmployment &&
                !draft.hasUkProperty && (
                  <p className="text-sm text-ink-soft">
                    No employment, self-employment or property selected on TR2 —
                    continue to other income.
                  </p>
                )}
            </>
          )}

          {step === "income" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Taxed UK interest" box="TR3.1">
                <Money
                  value={draft.interestTaxedUk}
                  onChange={(interestTaxedUk) => patch({ interestTaxedUk })}
                />
              </L>
              <L label="Untaxed UK interest" box="TR3.2">
                <Money
                  value={draft.interestUntaxedUk}
                  onChange={(interestUntaxedUk) =>
                    patch({ interestUntaxedUk })
                  }
                />
              </L>
              <L label="UK dividends" box="TR3.4">
                <Money
                  value={draft.dividendsUk}
                  onChange={(dividendsUk) => patch({ dividendsUk })}
                />
              </L>
              <L label="State Pension" box="TR3.8">
                <Money
                  value={draft.statePension}
                  onChange={(statePension) => patch({ statePension })}
                />
              </L>
              <L label="Other pensions" box="TR3.11">
                <Money
                  value={draft.otherPensions}
                  onChange={(otherPensions) => patch({ otherPensions })}
                />
              </L>
              <L label="Tax on other pensions" box="TR3.12">
                <Money
                  value={draft.otherPensionsTax}
                  onChange={(otherPensionsTax) =>
                    patch({ otherPensionsTax })
                  }
                />
              </L>
            </div>
          )}

          {step === "reliefs" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <L label="Pension RAS" box="TR4.1">
                  <Money
                    value={draft.pensionReliefAtSource}
                    onChange={(pensionReliefAtSource) =>
                      patch({ pensionReliefAtSource })
                    }
                  />
                </L>
                <L label="Gift Aid" box="TR4.5">
                  <Money
                    value={draft.giftAid}
                    onChange={(giftAid) => patch({ giftAid })}
                  />
                </L>
                <L label="Child Benefit received">
                  <Money
                    value={draft.childBenefitAmount}
                    onChange={(childBenefitAmount) =>
                      patch({ childBenefitAmount })
                    }
                  />
                </L>
              </div>
              <YN
                label="Blind Person’s Allowance"
                value={draft.blindPerson}
                onChange={(blindPerson) => patch({ blindPerson })}
              />
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
            </>
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

          {step === "preview" && (
            <ul className="divide-y divide-line text-sm">
              {calc.summary.map((row) => (
                <li
                  key={row.label}
                  className="flex justify-between gap-3 py-2"
                >
                  <span className="text-ink-soft">{row.label}</span>
                  <span className="font-mono font-semibold">
                    {gbp(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FormErrorBanner error={error} />
        {ok && <p className="mt-3 text-sm font-semibold text-ok">{ok}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={i === 0 || pending}
            onClick={() => setI((x) => Math.max(0, x - 1))}
          >
            Back
          </button>
          {!last ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setI((x) => Math.min(STEPS.length - 1, x + 1))}
            >
              Continue
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    try {
                      await saveSa100Draft({ clientId, draft });
                      setOk("Draft saved.");
                      router.refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Save failed");
                    }
                  });
                }}
              >
                Save draft
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !draft.declarationAccepted}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    try {
                      const res = await submitSa100Return({
                        clientId,
                        draft,
                        fraudMetadata: gatherFraudMetadata(),
                      });
                      setReturnId(res.id);
                      setOk(
                        res.demo
                          ? `Demo accepted · ${res.correlationId}`
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
            </>
          )}
        </div>

        {returnId && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
            <a
              className="text-sea underline-offset-2 hover:underline"
              href={`/api/clients/${clientId}/sa100/${returnId}/sa100.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Download filled SA100 PDF
            </a>
            <a
              className="text-sea underline-offset-2 hover:underline"
              href={`/api/clients/${clientId}/sa100/${returnId}/sa302.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Download SA302 PDF
            </a>
          </div>
        )}
      </div>

      <aside className="panel sticky top-24 h-fit p-5">
        <h3 className="display text-xl">Tax estimate</h3>
        <p className="display mt-3 text-3xl text-ink">
          {calc.amountDue > 0
            ? gbp(calc.amountDue)
            : calc.refundDue > 0
              ? gbp(calc.refundDue)
              : gbp(0)}
        </p>
        <p className="text-sm text-ink-soft">
          {calc.amountDue > 0
            ? "to pay"
            : calc.refundDue > 0
              ? "refund"
              : "balanced"}{" "}
          · {clientName}
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Income</dt>
            <dd className="font-mono">{gbp(calc.totalIncome)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Income Tax</dt>
            <dd className="font-mono">{gbp(calc.incomeTax)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Class 4 NIC</dt>
            <dd className="font-mono">{gbp(calc.class4Nic)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Paid already</dt>
            <dd className="font-mono">{gbp(calc.taxDeducted)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
