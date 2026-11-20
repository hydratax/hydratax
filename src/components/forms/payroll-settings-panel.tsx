"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  PayrollAutomationSettings,
  PayrollDeskSettings,
  PayrollPayRate,
} from "@/lib/desk-profile";
import {
  getPayrollDeskSettings,
  listHmrcPayrollBaseRates,
  savePayrollDeskSettings,
} from "@/server/actions/payroll-settings";
import {
  enableEmployerPayroll,
  savePayrollPackPassword,
} from "@/server/actions/payroll";
import {
  GatewayCredentialsFields,
  gatewayCredentialsReady,
} from "@/components/forms/gateway-credentials-fields";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { AbbrInfo } from "@/components/desk/abbr-info";
import {
  DOCUMENT_PASSWORD_IDENTIFIERS,
  type DocumentPasswordIdentifier,
  type DocumentPasswordPolicy,
} from "@/lib/document-password-policy";
import {
  getDocumentPasswordPolicy,
  saveDocumentPasswordPolicy,
} from "@/server/actions/document-password-policy";

type SettingsTab =
  | "paye"
  | "contact"
  | "hmrc"
  | "payments"
  | "templates"
  | "rates"
  | "security"
  | "automation";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "paye", label: "PAYE Details" },
  { id: "contact", label: "Contact Details" },
  { id: "hmrc", label: "HMRC Credentials" },
  { id: "payments", label: "Staff payments" },
  { id: "templates", label: "Payslip Templates" },
  { id: "rates", label: "Pay Rate" },
  { id: "security", label: "Data Security" },
  { id: "automation", label: "Automation" },
];

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

function defaultAutomation(
  a?: PayrollAutomationSettings | null,
): Required<
  Pick<
    PayrollAutomationSettings,
    | "automatePayroll"
    | "payrollDayOfMonth"
    | "automateRti"
    | "rtiDayOfMonth"
    | "automateEmail"
    | "emailDayOfMonth"
  >
> {
  return {
    automatePayroll: Boolean(a?.automatePayroll),
    payrollDayOfMonth: a?.payrollDayOfMonth ?? 28,
    automateRti: Boolean(a?.automateRti),
    rtiDayOfMonth: a?.rtiDayOfMonth ?? 28,
    automateEmail: Boolean(a?.automateEmail),
    emailDayOfMonth: a?.emailDayOfMonth ?? 28,
  };
}

const PAYROLL_PASSWORD_OPTIONS: Array<{
  id: DocumentPasswordIdentifier | "master";
  label: string;
}> = [
  { id: "none", label: "No password" },
  { id: "date_of_birth", label: "Date of birth (DDMMYYYY)" },
  { id: "paye_ref", label: "PAYE reference" },
  { id: "accounts_office_ref", label: "Accounts Office reference" },
  { id: "company_number", label: "Company number" },
  { id: "company_utr", label: "Company UTR" },
  { id: "master", label: "Custom master password" },
];

const TEMPLATES: Array<{
  id: NonNullable<PayrollDeskSettings["payslipTemplate"]>;
  title: string;
  blurb: string;
}> = [
  {
    id: "hydra_a",
    title: "Hydra A",
    blurb: "Clean practice layout · IRIS-style summary columns",
  },
  {
    id: "hydra_b",
    title: "Hydra B",
    blurb: "Compact SAGE-style earnings / deductions grid",
  },
  {
    id: "hydra_c",
    title: "Hydra C",
    blurb: "Wide YTD columns for month-end packs",
  },
  {
    id: "hydra_secure",
    title: "Hydra Secure",
    blurb: "Minimal face · always pair with pack password",
  },
];

function poundsInputToPence(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function PayrollSettingsPanel({
  clientId,
  payeRef,
  accountsOfficeRef,
  hasPackPassword,
  contactEmail,
  initialSettings,
}: {
  clientId: string;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  hasPackPassword: boolean;
  contactEmail: string | null;
  initialSettings?: PayrollDeskSettings | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>("paye");
  const [rateSub, setRateSub] = useState<"customer" | "hmrc">("customer");
  const [settings, setSettings] = useState<PayrollDeskSettings>(
    initialSettings ?? {
      payslipTemplate: "hydra_a",
      bulkDownloadFormat: "zip",
      documentPasswordEnabled: true,
      payRates: [],
      contactEmail: contactEmail ?? "",
    },
  );
  const [hmrcRates, setHmrcRates] = useState<
    Awaited<ReturnType<typeof listHmrcPayrollBaseRates>>
  >([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ggUserId, setGgUserId] = useState("");
  const [ggPassword, setGgPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [rateName, setRateName] = useState("");
  const [rateValue, setRateValue] = useState("0.00");
  const [rateUnit, setRateUnit] = useState<"hour" | "day" | "fixed">("hour");
  const [practicePolicy, setPracticePolicy] =
    useState<DocumentPasswordPolicy | null>(null);
  const [pwMode, setPwMode] = useState<DocumentPasswordIdentifier | "master">(
    "none",
  );

  useEffect(() => {
    start(async () => {
      try {
        const [s, rates, policy] = await Promise.all([
          getPayrollDeskSettings(clientId),
          listHmrcPayrollBaseRates(),
          getDocumentPasswordPolicy(),
        ]);
        setSettings(s);
        setHmrcRates(rates);
        setPracticePolicy(policy);
        const payrollId = policy.payroll;
        if (
          hasPackPassword &&
          (payrollId === "none" || !payrollId)
        ) {
          setPwMode("master");
        } else {
          setPwMode(payrollId);
        }
      } catch {
        // keep initial
      }
    });
  }, [clientId, hasPackPassword]);

  async function syncPracticePayrollPassword(
    identifier: DocumentPasswordIdentifier,
  ) {
    const base = practicePolicy ?? (await getDocumentPasswordPolicy());
    const next = await saveDocumentPasswordPolicy({
      ...base,
      payroll: identifier,
    });
    setPracticePolicy(next);
  }

  function savePatch(patch: Partial<PayrollDeskSettings>) {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        const next = await savePayrollDeskSettings({
          clientId,
          contactName: patch.contactName ?? settings.contactName,
          contactEmail: patch.contactEmail ?? settings.contactEmail,
          contactPhone: patch.contactPhone ?? settings.contactPhone,
          payslipTemplate: patch.payslipTemplate ?? settings.payslipTemplate,
          bulkDownloadFormat:
            patch.bulkDownloadFormat ?? settings.bulkDownloadFormat,
          documentPasswordEnabled:
            patch.documentPasswordEnabled ?? settings.documentPasswordEnabled,
          payRates: patch.payRates ?? settings.payRates,
          activeTaxYear: patch.activeTaxYear ?? settings.activeTaxYear,
          bacsServiceUserNumber:
            patch.bacsServiceUserNumber ?? settings.bacsServiceUserNumber,
          bacsOriginatorSortCode:
            patch.bacsOriginatorSortCode ?? settings.bacsOriginatorSortCode,
          bacsOriginatorAccountNumber:
            patch.bacsOriginatorAccountNumber ??
            settings.bacsOriginatorAccountNumber,
          bacsOriginatorName:
            patch.bacsOriginatorName ?? settings.bacsOriginatorName,
          bacsFileSerial: patch.bacsFileSerial ?? settings.bacsFileSerial,
          payFrequency: patch.payFrequency ?? settings.payFrequency,
          automation: patch.automation ?? settings.automation,
        });
        setSettings(next);
        setOk("Payroll settings saved.");
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  const automation = defaultAutomation(settings.automation);

  function saveAutomation(
    patch: Partial<ReturnType<typeof defaultAutomation>>,
  ) {
    savePatch({
      automation: {
        ...automation,
        ...patch,
        lastRunYmd: settings.automation?.lastRunYmd,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-sea text-white"
                : "text-ink-soft hover:bg-sand hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FormErrorBanner error={error} />
      {ok ? (
        <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">
          {ok}
        </p>
      ) : null}

      {tab === "paye" ? (
        <form
          className="panel space-y-4 p-5"
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
                setOk("PAYE details saved.");
                router.refresh();
              } catch (err) {
                setError(messageFromUnknown(err, "Could not save PAYE details"));
              }
            });
          }}
        >
          <h3 className="display inline-flex items-center gap-1.5 text-xl text-ink">
            PAYE
            <AbbrInfo code="PAYE" />
            Details
          </h3>
          <p className="text-sm text-ink-soft">
            Employer PAYE and Accounts Office references from the HMRC letter.
            Required for every FPS and EPS.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              <span className="inline-flex items-center gap-1">
                PAYE reference
                <AbbrInfo code="PAYE" />
              </span>
              <input
                name="payeRef"
                className="input mt-1.5"
                defaultValue={payeRef ?? ""}
                placeholder="123/AB45678"
                required
              />
            </label>
            <label className="text-sm font-semibold">
              Accounts Office reference
              <input
                name="accountsOfficeRef"
                className="input mt-1.5"
                defaultValue={accountsOfficeRef ?? ""}
                placeholder="123PA00123456"
                required
              />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            Save PAYE details
          </button>
        </form>
      ) : null}

      {tab === "paye" ? (
        <div className="panel space-y-3 p-5">
          <h3 className="display text-xl text-ink">Pay cycle</h3>
          {settings.payFrequencyLocked || settings.payFrequency ? (
            <>
              <p className="text-sm text-ink">
                {settings.payFrequency === "W1"
                  ? "Weekly + timesheet"
                  : "Monthly salary"}
              </p>
              <p className="text-xs text-ink-soft">
                Set when payroll was first enabled. It cannot be changed.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                Choose once — monthly or weekly. After you save, it stays fixed.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-sea"
                  disabled={pending}
                  onClick={() =>
                    savePatch({
                      payFrequency: "M1",
                      payFrequencyLocked: true,
                    })
                  }
                >
                  Monthly salary
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-sea"
                  disabled={pending}
                  onClick={() =>
                    savePatch({
                      payFrequency: "W1",
                      payFrequencyLocked: true,
                    })
                  }
                >
                  Weekly + timesheet
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "contact" ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            savePatch({
              contactName: String(fd.get("contactName") || ""),
              contactEmail: String(fd.get("contactEmail") || ""),
              contactPhone: String(fd.get("contactPhone") || ""),
            });
          }}
        >
          <h3 className="display text-xl text-ink">Contact Details</h3>
          <p className="text-sm text-ink-soft">
            Payroll contact for this employer — used when emailing packs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Contact name
              <input
                name="contactName"
                className="input mt-1.5"
                defaultValue={settings.contactName ?? ""}
              />
            </label>
            <label className="text-sm font-semibold">
              Email
              <input
                name="contactEmail"
                type="email"
                className="input mt-1.5"
                defaultValue={settings.contactEmail || contactEmail || ""}
              />
            </label>
            <label className="text-sm font-semibold">
              Phone
              <input
                name="contactPhone"
                className="input mt-1.5"
                defaultValue={settings.contactPhone ?? ""}
              />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            Save contact
          </button>
        </form>
      ) : null}

      {tab === "payments" ? (
        <form
          className="panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            savePatch({
              bacsServiceUserNumber: String(fd.get("bacsServiceUserNumber") || ""),
              bacsOriginatorSortCode: String(
                fd.get("bacsOriginatorSortCode") || "",
              ),
              bacsOriginatorAccountNumber: String(
                fd.get("bacsOriginatorAccountNumber") || "",
              ),
              bacsOriginatorName: String(fd.get("bacsOriginatorName") || ""),
              bacsFileSerial: String(fd.get("bacsFileSerial") || ""),
            });
          }}
        >
          <h3 className="display text-xl text-ink">Staff payments</h3>
          <p className="text-sm text-ink-soft">
            Paying account details from your bank or payment bureau. Needed to
            download a bank payment file from a completed pay run. Staff sort
            codes and account numbers stay on each employee card.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Service user number
              <input
                name="bacsServiceUserNumber"
                className="input mt-1.5 paye-digits"
                maxLength={6}
                defaultValue={settings.bacsServiceUserNumber ?? ""}
                placeholder="6 digits"
              />
            </label>
            <label className="text-sm font-semibold">
              File serial (optional)
              <input
                name="bacsFileSerial"
                className="input mt-1.5 paye-digits"
                maxLength={6}
                defaultValue={settings.bacsFileSerial ?? ""}
              />
            </label>
            <label className="text-sm font-semibold">
              Paying sort code
              <input
                name="bacsOriginatorSortCode"
                className="input mt-1.5 paye-digits"
                maxLength={8}
                defaultValue={settings.bacsOriginatorSortCode ?? ""}
              />
            </label>
            <label className="text-sm font-semibold">
              Paying account number
              <input
                name="bacsOriginatorAccountNumber"
                className="input mt-1.5 paye-digits"
                maxLength={8}
                defaultValue={settings.bacsOriginatorAccountNumber ?? ""}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Paying account name
              <input
                name="bacsOriginatorName"
                className="input mt-1.5"
                maxLength={18}
                defaultValue={settings.bacsOriginatorName ?? ""}
              />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            Save payment details
          </button>
        </form>
      ) : null}

      {tab === "hmrc" ? (
        <div className="panel space-y-4 p-5">
          <h3 className="display text-xl text-ink">HMRC Credentials</h3>
          <p className="text-sm text-ink-soft">
            Government Gateway user ID and password for{" "}
            <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
              RTI
              <AbbrInfo code="RTI" />
            </span>
            . Stored encrypted when you tick remember. Used for{" "}
            <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
              FPS
              <AbbrInfo code="FPS" />
            </span>{" "}
            and{" "}
            <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
              EPS
              <AbbrInfo code="EPS" />
            </span>
            .
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
            hint="Same credentials you use on the Pay run tab to submit FPS / EPS."
          />
          <p className="text-xs text-ink-soft">
            Status:{" "}
            {gatewayCredentialsReady(ggUserId, ggPassword, hasSavedPassword)
              ? "Ready to submit"
              : "Enter Gateway credentials before filing"}
          </p>
        </div>
      ) : null}

      {tab === "templates" ? (
        <div className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="display text-xl text-ink">Payslip Templates</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Select a default theme for employee payslips.
              </p>
            </div>
            <fieldset className="flex items-center gap-3 text-sm">
              <legend className="sr-only">Bulk download format</legend>
              <span className="font-semibold text-ink-soft">
                Bulk download format
              </span>
              {(["pdf", "zip"] as const).map((fmt) => (
                <label key={fmt} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="bulkFormat"
                    checked={(settings.bulkDownloadFormat ?? "zip") === fmt}
                    onChange={() => savePatch({ bulkDownloadFormat: fmt })}
                  />
                  {fmt.toUpperCase()}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t) => {
              const selected =
                (settings.payslipTemplate ?? "hydra_a") === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => savePatch({ payslipTemplate: t.id })}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-sea bg-sea/5 ring-2 ring-sea/30"
                      : "border-line hover:border-sea/40"
                  }`}
                >
                  <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-sand/60">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                      Preview
                    </span>
                  </div>
                  <p className="font-semibold text-ink">{t.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {t.id === "hydra_c" ? (
                      <span className="inline-flex flex-wrap items-center gap-x-1">
                        Wide
                        <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                          YTD
                          <AbbrInfo code="YTD" />
                        </span>
                        columns for month-end packs
                      </span>
                    ) : (
                      t.blurb
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "rates" ? (
        <div className="panel space-y-4 p-5">
          <h3 className="display text-xl text-ink">Pay Rate</h3>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                rateSub === "customer"
                  ? "bg-sea text-white"
                  : "bg-sand text-ink-soft"
              }`}
              onClick={() => setRateSub("customer")}
            >
              Customer Rates
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                rateSub === "hmrc"
                  ? "bg-sea text-white"
                  : "bg-sand text-ink-soft"
              }`}
              onClick={() => setRateSub("hmrc")}
            >
              HMRC Base Rates
            </button>
          </div>

          {rateSub === "customer" ? (
            <>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!rateName.trim()) return;
                  const row: PayrollPayRate = {
                    id: crypto.randomUUID(),
                    name: rateName.trim(),
                    ratePence: poundsInputToPence(rateValue),
                    unit: rateUnit,
                    isDefault: (settings.payRates ?? []).length === 0,
                    createdAt: new Date().toISOString(),
                  };
                  savePatch({
                    payRates: [...(settings.payRates ?? []), row],
                  });
                  setRateName("");
                  setRateValue("0.00");
                }}
              >
                <label className="text-xs font-semibold">
                  Pay rate name
                  <input
                    className="input mt-1"
                    value={rateName}
                    onChange={(e) => setRateName(e.target.value)}
                    required
                  />
                </label>
                <label className="text-xs font-semibold">
                  Rate £
                  <input
                    className="input mt-1 paye-digits w-28"
                    value={rateValue}
                    onChange={(e) => setRateValue(e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Unit
                  <select
                    className="input mt-1"
                    value={rateUnit}
                    onChange={(e) =>
                      setRateUnit(e.target.value as typeof rateUnit)
                    }
                  >
                    <option value="hour">Per hour</option>
                    <option value="day">Per day</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-primary text-sm">
                  + Pay Rate
                </button>
              </form>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-ink-soft">
                  <tr>
                    <th className="py-2">Pay Rate Name</th>
                    <th className="py-2">Rate</th>
                    <th className="py-2">Default</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(settings.payRates ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-ink-soft"
                      >
                        No Item To Display
                      </td>
                    </tr>
                  ) : (
                    (settings.payRates ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="py-2 font-medium">{r.name}</td>
                        <td className="py-2 paye-digits">
                          £{(r.ratePence / 100).toFixed(2)} / {r.unit}
                        </td>
                        <td className="py-2">{r.isDefault ? "Yes" : "—"}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-danger"
                            onClick={() =>
                              savePatch({
                                payRates: (settings.payRates ?? []).filter(
                                  (x) => x.id !== r.id,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {hmrcRates.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{r.label}</p>
                    <p className="paye-digits font-semibold text-sea">{r.value}</p>
                  </div>
                  {r.detail ? (
                    <p className="mt-1 text-xs text-ink-soft">{r.detail}</p>
                  ) : null}
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-sea hover:underline"
                  >
                    {r.sourceTitle} →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "security" ? (
        <div className="panel space-y-4 p-5">
          <h3 className="display text-xl text-sea">Password Protection</h3>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.documentPasswordEnabled !== false}
              onChange={(e) => {
                const on = e.target.checked;
                savePatch({ documentPasswordEnabled: on });
                if (!on) {
                  start(async () => {
                    try {
                      await syncPracticePayrollPassword("none");
                      setPwMode("none");
                    } catch {
                      /* freeze */
                    }
                  });
                }
              }}
            />
            <span>
              <span className="font-semibold text-ink">
                Enable document password protection
              </span>
              <span className="mt-1 block text-ink-soft">
                Protects payslips, P45s and P60s. Choosing DOB, PAYE reference or
                Accounts Office reference also updates Account → Password
                protection for Payroll.
              </span>
            </span>
          </label>

          {settings.documentPasswordEnabled !== false ? (
            <div className="space-y-3 rounded-xl border border-line bg-sand/30 p-4">
              <label className="block text-sm font-semibold text-ink">
                Password source
                <select
                  className="input mt-1.5 max-w-md"
                  value={pwMode}
                  onChange={(e) => {
                    const v = e.target.value as
                      | DocumentPasswordIdentifier
                      | "master";
                    setPwMode(v);
                    if (v === "master") return;
                    start(async () => {
                      try {
                        await syncPracticePayrollPassword(v);
                        setOk(
                          "Payroll password protection updated for this practice.",
                        );
                        router.refresh();
                      } catch (err) {
                        setError(
                          messageFromUnknown(
                            err,
                            "Could not update password settings",
                          ),
                        );
                      }
                    });
                  }}
                >
                  {PAYROLL_PASSWORD_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-ink-soft">
                {pwMode === "master"
                  ? hasPackPassword
                    ? "A custom master password is stored for this employer."
                    : "Enter a custom master password for this employer’s packs."
                  : DOCUMENT_PASSWORD_IDENTIFIERS.find((i) => i.id === pwMode)
                      ?.hint}
                {payeRef ? ` · PAYE ${payeRef}` : null}
                {accountsOfficeRef ? ` · AO ${accountsOfficeRef}` : null}
              </p>

              {pwMode === "master" ? (
                <form
                  className="space-y-3"
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
                        await syncPracticePayrollPassword("none");
                        setOk("Master pack password saved.");
                        router.refresh();
                      } catch (err) {
                        setError(
                          messageFromUnknown(
                            err,
                            "Could not save pack password",
                          ),
                        );
                      }
                    });
                  }}
                >
                  <label className="block text-sm font-semibold text-ink">
                    Master password
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      className="input mt-1.5 max-w-sm"
                      placeholder="At least 8 characters"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={pending}
                  >
                    Save
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "automation" ? (
        <div className="panel space-y-4 p-5">
          <h3 className="display text-xl text-ink">Automation</h3>
          <p className="text-sm text-ink-soft">
            Choose the day of each month. On that day HydraTax can run payroll,
            file FPS, and email the payslip pack plus payroll summary.
          </p>
          <ul className="space-y-3">
            {(
              [
                {
                  key: "payroll" as const,
                  label: "Automate payroll",
                  on: automation.automatePayroll,
                  day: automation.payrollDayOfMonth,
                  setOn: (v: boolean) =>
                    saveAutomation({ automatePayroll: v }),
                  setDay: (d: number) =>
                    saveAutomation({ payrollDayOfMonth: d }),
                },
                {
                  key: "rti" as const,
                  label: "Automate FPS / RTI submissions",
                  on: automation.automateRti,
                  day: automation.rtiDayOfMonth,
                  setOn: (v: boolean) => saveAutomation({ automateRti: v }),
                  setDay: (d: number) => saveAutomation({ rtiDayOfMonth: d }),
                },
                {
                  key: "email" as const,
                  label: "Automate client email",
                  on: automation.automateEmail,
                  day: automation.emailDayOfMonth,
                  setOn: (v: boolean) => saveAutomation({ automateEmail: v }),
                  setDay: (d: number) =>
                    saveAutomation({ emailDayOfMonth: d }),
                },
              ] as const
            ).map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold text-ink">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.on}
                    disabled={pending}
                    onClick={() => row.setOn(!row.on)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      row.on ? "bg-sea" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        row.on ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                  <span>{row.label}</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                  Day of month
                  <select
                    className="input w-20 py-1.5 text-sm"
                    value={row.day}
                    disabled={pending || !row.on}
                    onChange={(e) => row.setDay(Number(e.target.value))}
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            FPS needs Gateway login under HMRC Credentials. Email uses Contact
            Details. Days are 1–28 so every month has that date.
          </p>
        </div>
      ) : null}
    </div>
  );
}
