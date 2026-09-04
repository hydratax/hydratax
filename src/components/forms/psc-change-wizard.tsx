"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChServicePrice } from "@/lib/ch-services";
import {
  PSC_NATURE_OPTIONS,
  emptyAddress,
  isValidPersonalCode,
  splitFullName,
  stringifyAddress,
  validateStructuredAddress,
} from "@/lib/ch-wizard-shared";
import { useChCompanyLookup } from "@/hooks/use-ch-company-lookup";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import { ChAddressFields } from "@/components/forms/ch-address-fields";
import {
  ChAuthCodeField,
  ChCompanySearchStep,
  ChCompanySummaryCard,
  ChWizardShell,
  ChWizardStepNav,
} from "@/components/forms/ch-wizard-shell";

const STEPS = [
  { id: "search", label: "Find company" },
  { id: "psc", label: "PSC details" },
  { id: "pay", label: "Confirm & pay" },
] as const;

type Phase = (typeof STEPS)[number]["id"];
type PscMode = "notify" | "change" | "cease";

export function PscChangeWizard({
  service,
  defaults,
  mode,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
  mode: PscMode;
}) {
  const price = formatChServicePrice(service);
  const presetCompany = defaults?.companyNumber?.trim().toUpperCase() ?? "";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const lookup = useChCompanyLookup(presetCompany || undefined);
  const [phase, setPhase] = useState<Phase>(presetCompany ? "psc" : "search");
  const [selectedPsc, setSelectedPsc] = useState("");
  const [forename, setForename] = useState("");
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("British");
  const [countryOfResidence, setCountryOfResidence] = useState("United Kingdom");
  const [personalCode, setPersonalCode] = useState("");
  const [notificationDate, setNotificationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [cessationDate, setCessationDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [natures, setNatures] = useState<string[]>([]);
  const [residentialAddress, setResidentialAddress] = useState(emptyAddress());
  const [consentAck, setConsentAck] = useState(false);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [pending, start] = useTransition();

  const stepIndex = STEPS.findIndex((s) => s.id === phase);

  const pscName = useMemo(
    () =>
      mode === "notify"
        ? `${forename.trim()} ${surname.trim()}`.trim()
        : selectedPsc.trim(),
    [mode, forename, surname, selectedPsc],
  );

  const detailsReady = useMemo(() => {
    if (mode === "cease") {
      return Boolean(selectedPsc && cessationDate);
    }
    if (mode === "change") {
      return Boolean(selectedPsc && natures.length > 0 && notificationDate);
    }
    const addrErr = validateStructuredAddress(
      residentialAddress,
      "Residential address",
    );
    return (
      forename.trim().length > 0 &&
      surname.trim().length > 1 &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) &&
      isValidPersonalCode(personalCode) &&
      natures.length > 0 &&
      notificationDate &&
      consentAck &&
      !addrErr
    );
  }, [
    mode,
    selectedPsc,
    cessationDate,
    forename,
    surname,
    dateOfBirth,
    personalCode,
    natures,
    notificationDate,
    consentAck,
    residentialAddress,
  ]);

  function pickPsc(name: string) {
    setSelectedPsc(name);
    const parts = splitFullName(name);
    setForename(parts.forename);
    setSurname(parts.surname);
  }

  function toggleNature(value: string) {
    setNatures((prev) =>
      prev.includes(value) ? prev.filter((n) => n !== value) : [...prev, value],
    );
  }

  function pay() {
    if (!lookup.company) return;
    lookup.setError(null);
    if (!companyAuthCode.trim()) {
      lookup.setError("Enter the company authentication code.");
      return;
    }
    if (!detailsReady) {
      lookup.setError("Complete all PSC details first.");
      return;
    }

    start(async () => {
      try {
        const fields: Record<string, string | boolean> = {
          companyNumber: lookup.company!.companyNumber,
          companyName: lookup.company!.companyName,
          companyAuthCode: companyAuthCode.trim(),
          pscName,
          forename: forename.trim(),
          surname: surname.trim(),
          naturesOfControlJson: JSON.stringify(natures),
          ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
        };

        if (mode === "notify") {
          Object.assign(fields, {
            dateOfBirth,
            nationality,
            countryOfResidence,
            personalCode: personalCode.trim().toUpperCase(),
            notificationDate,
            residentialAddress: stringifyAddress(residentialAddress),
            consentAck: true,
          });
        } else if (mode === "change") {
          Object.assign(fields, {
            changeDate: notificationDate,
            dateOfBirth: dateOfBirth || undefined,
          });
        } else {
          Object.assign(fields, { cessationDate });
        }

        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          returnPath,
          fields,
        });
        if (!res.ok) {
          lookup.setError(res.error);
          return;
        }
        const checkout = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: res.checkoutPlanKey }),
        });
        const data = (await checkout.json()) as { url?: string; error?: string };
        if (checkout.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        lookup.setError(data.error ?? "Checkout is not configured yet.");
      } catch (err) {
        lookup.setError(err instanceof Error ? err.message : "Checkout failed");
      }
    });
  }

  const modeLabel =
    mode === "notify"
      ? "PSC01 · Notify PSC"
      : mode === "change"
        ? "PSC04 · Change PSC details"
        : "PSC07 · Cease PSC";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          {modeLabel}
        </p>
        <h1 className="display mt-2 text-3xl text-ink">{service.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{service.summary}</p>
      </div>

      <ChWizardStepNav steps={[...STEPS]} currentIndex={stepIndex} />

      {phase === "search" && (
        <div className="panel gloss-card space-y-4 p-5">
          <ChCompanySearchStep
            searchQuery={lookup.searchQuery}
            onSearchQueryChange={lookup.setSearchQuery}
            searchHits={lookup.searchHits}
            lookupPending={lookup.lookupPending}
            onSelectCompany={(n) => void lookup.loadCompany(n)}
            onSearch={() => void lookup.searchByName(lookup.searchQuery.trim())}
          />
          {lookup.company && (
            <>
              <ChCompanySummaryCard company={lookup.company} />
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => setPhase("psc")}
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {phase === "psc" && lookup.company && (
        <div className="panel gloss-card space-y-4 p-5">
          <ChCompanySummaryCard company={lookup.company} />

          {(mode === "change" || mode === "cease") && (
            <label className="label">
              Person with significant control
              <select
                className="input mt-1.5"
                value={selectedPsc}
                onChange={(e) => pickPsc(e.target.value)}
              >
                <option value="">Select PSC…</option>
                {lookup.company.pscs.map((p, i) => (
                  <option key={`${p.name}-${i}`} value={p.name ?? ""}>
                    {p.name ?? "Name protected"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === "notify" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Forename(s)
                  <input
                    className="input mt-1.5"
                    value={forename}
                    onChange={(e) => setForename(e.target.value)}
                  />
                </label>
                <label className="label">
                  Surname
                  <input
                    className="input mt-1.5"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                  />
                </label>
              </div>
              <label className="label">
                Date of birth
                <input
                  type="date"
                  className="input mt-1.5"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </label>
              <label className="label">
                Notification date
                <input
                  type="date"
                  className="input mt-1.5"
                  value={notificationDate}
                  onChange={(e) => setNotificationDate(e.target.value)}
                />
              </label>
              <label className="label">
                Personal code
                <input
                  className="input mt-1.5 mono uppercase"
                  value={personalCode}
                  onChange={(e) => setPersonalCode(e.target.value.toUpperCase())}
                  maxLength={11}
                />
              </label>
              <div>
                <p className="label mb-2">Residential address</p>
                <ChAddressFields
                  idPrefix="psc-res"
                  value={residentialAddress}
                  onChange={setResidentialAddress}
                />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consentAck}
                  onChange={(e) => setConsentAck(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  The PSC confirms the notification details and has verified
                  identity where required.
                </span>
              </label>
            </>
          )}

          {mode === "change" && (
            <label className="label">
              Change date
              <input
                type="date"
                className="input mt-1.5"
                value={notificationDate}
                onChange={(e) => setNotificationDate(e.target.value)}
              />
            </label>
          )}

          {mode === "cease" && (
            <label className="label">
              Cessation date
              <input
                type="date"
                className="input mt-1.5"
                value={cessationDate}
                onChange={(e) => setCessationDate(e.target.value)}
              />
            </label>
          )}

          {mode !== "cease" && (
            <fieldset className="space-y-2">
              <legend className="label">Nature of control</legend>
              {PSC_NATURE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={natures.includes(opt.value)}
                    onChange={() => toggleNature(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPhase("search")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={!detailsReady}
              onClick={() => setPhase("pay")}
            >
              Review & pay
            </button>
          </div>
        </div>
      )}

      {phase === "pay" && lookup.company && (
        <ChWizardShell
          returnPath={returnPath}
          price={price}
          error={lookup.error}
          pending={pending}
          onPay={pay}
          payDisabled={!companyAuthCode.trim()}
          footer={
            <>
              <ChCompanySummaryCard company={lookup.company} />
              <div className="rounded-xl border border-line bg-white p-4 text-sm">
                <p className="font-semibold text-ink">{pscName || "PSC"}</p>
                {mode !== "cease" && natures.length > 0 && (
                  <p className="mt-2 text-xs text-ink-soft">
                    {natures.length} nature-of-control selection
                    {natures.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <ChAuthCodeField
                value={companyAuthCode}
                onChange={setCompanyAuthCode}
              />
            </>
          }
        >
          <h2 className="display text-xl text-ink">Confirm & pay</h2>
        </ChWizardShell>
      )}
    </div>
  );
}
