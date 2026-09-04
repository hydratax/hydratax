"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChServicePrice } from "@/lib/ch-services";
import {
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

const APPOINT_STEPS = [
  { id: "search", label: "Find company" },
  { id: "director", label: "New director" },
  { id: "pay", label: "Confirm & pay" },
] as const;

const RESIGN_STEPS = [
  { id: "search", label: "Find company" },
  { id: "director", label: "Director" },
  { id: "pay", label: "Confirm & pay" },
] as const;

export function DirectorChangeWizard({
  service,
  defaults,
  mode,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
  mode: "appoint" | "resign";
}) {
  const price = formatChServicePrice(service);
  const presetCompany = defaults?.companyNumber?.trim().toUpperCase() ?? "";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const steps = mode === "appoint" ? APPOINT_STEPS : RESIGN_STEPS;
  const lookup = useChCompanyLookup(presetCompany || undefined);
  const [phase, setPhase] = useState<(typeof steps)[number]["id"]>(
    presetCompany ? "director" : "search",
  );

  const [selectedDirector, setSelectedDirector] = useState("");
  const [forename, setForename] = useState("");
  const [surname, setSurname] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [appointedOn, setAppointedOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [resignedOn, setResignedOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [personalCode, setPersonalCode] = useState("");
  const [nationality, setNationality] = useState("British");
  const [countryOfResidence, setCountryOfResidence] = useState("United Kingdom");
  const [serviceAddress, setServiceAddress] = useState(emptyAddress());
  const [residentialAddress, setResidentialAddress] = useState(emptyAddress());
  const [serviceSameAsRegistered, setServiceSameAsRegistered] = useState(true);
  const [consentToAct, setConsentToAct] = useState(false);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [pending, start] = useTransition();

  const stepIndex = steps.findIndex((s) => s.id === phase);

  const directorName = useMemo(() => {
    if (mode === "resign") return selectedDirector.trim();
    return `${forename.trim()} ${surname.trim()}`.trim();
  }, [mode, selectedDirector, forename, surname]);

  const detailsReady = useMemo(() => {
    if (mode === "resign") {
      return Boolean(selectedDirector && resignedOn);
    }
    const svcErr = serviceSameAsRegistered
      ? null
      : validateStructuredAddress(serviceAddress, "Service address");
    const resErr = validateStructuredAddress(
      residentialAddress,
      "Residential address",
    );
    return (
      forename.trim().length > 0 &&
      surname.trim().length > 1 &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) &&
      /^\d{4}-\d{2}-\d{2}$/.test(appointedOn) &&
      isValidPersonalCode(personalCode) &&
      consentToAct &&
      !svcErr &&
      !resErr
    );
  }, [
    mode,
    selectedDirector,
    resignedOn,
    forename,
    surname,
    dateOfBirth,
    appointedOn,
    personalCode,
    consentToAct,
    serviceSameAsRegistered,
    serviceAddress,
    residentialAddress,
  ]);

  function pickDirector(name: string) {
    setSelectedDirector(name);
    const parts = splitFullName(name);
    setForename(parts.forename);
    setSurname(parts.surname);
  }

  function pay() {
    if (!lookup.company) return;
    lookup.setError(null);
    if (!companyAuthCode.trim()) {
      lookup.setError("Enter the company authentication code.");
      return;
    }
    if (!detailsReady) {
      lookup.setError("Complete all director details first.");
      return;
    }

    start(async () => {
      try {
        const fields: Record<string, string | boolean> = {
          companyNumber: lookup.company!.companyNumber,
          companyName: lookup.company!.companyName,
          companyAuthCode: companyAuthCode.trim(),
          directorName,
          ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
        };

        if (mode === "appoint") {
          Object.assign(fields, {
            forename: forename.trim(),
            surname: surname.trim(),
            dateOfBirth,
            appointedOn,
            personalCode: personalCode.trim().toUpperCase(),
            nationality,
            countryOfResidence,
            serviceAddress: serviceSameAsRegistered
              ? lookup.company!.registeredOffice
              : stringifyAddress(serviceAddress),
            residentialAddress: stringifyAddress(residentialAddress),
            serviceSameAsRegistered,
            consentToAct: true,
          });
        } else {
          Object.assign(fields, { resignedOn });
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          {mode === "appoint" ? "AP01 · Add director" : "TM01 · Remove director"}
        </p>
        <h1 className="display mt-2 text-3xl text-ink">{service.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{service.summary}</p>
      </div>

      <ChWizardStepNav steps={[...steps]} currentIndex={stepIndex} />

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
                onClick={() => setPhase("director")}
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {phase === "director" && lookup.company && (
        <div className="panel gloss-card space-y-4 p-5">
          <ChCompanySummaryCard company={lookup.company} />

          {mode === "resign" ? (
            <>
              <label className="label">
                Director to remove
                <select
                  className="input mt-1.5"
                  value={selectedDirector}
                  onChange={(e) => pickDirector(e.target.value)}
                  required
                >
                  <option value="">Select director…</option>
                  {lookup.company.directors.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                      {d.appointedOn ? ` (appointed ${d.appointedOn})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Resignation / termination date
                <input
                  type="date"
                  className="input mt-1.5"
                  value={resignedOn}
                  onChange={(e) => setResignedOn(e.target.value)}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Forename(s)
                  <input
                    className="input mt-1.5"
                    value={forename}
                    onChange={(e) => setForename(e.target.value)}
                    required
                  />
                </label>
                <label className="label">
                  Surname
                  <input
                    className="input mt-1.5"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    required
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
                  required
                />
              </label>
              <label className="label">
                Appointment date
                <input
                  type="date"
                  className="input mt-1.5"
                  value={appointedOn}
                  onChange={(e) => setAppointedOn(e.target.value)}
                  required
                />
              </label>
              <label className="label">
                Companies House personal code
                <input
                  className="input mt-1.5 mono uppercase"
                  value={personalCode}
                  onChange={(e) => setPersonalCode(e.target.value.toUpperCase())}
                  placeholder="11-character code"
                  maxLength={11}
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Nationality
                  <input
                    className="input mt-1.5"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                  />
                </label>
                <label className="label">
                  Country of residence
                  <input
                    className="input mt-1.5"
                    value={countryOfResidence}
                    onChange={(e) => setCountryOfResidence(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={serviceSameAsRegistered}
                  onChange={(e) => setServiceSameAsRegistered(e.target.checked)}
                />
                Service address same as registered office
              </label>
              {!serviceSameAsRegistered && (
                <div>
                  <p className="label mb-2">Service address</p>
                  <ChAddressFields
                    idPrefix="svc"
                    value={serviceAddress}
                    onChange={setServiceAddress}
                  />
                </div>
              )}
              <div>
                <p className="label mb-2">Residential address</p>
                <ChAddressFields
                  idPrefix="res"
                  value={residentialAddress}
                  onChange={setResidentialAddress}
                />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consentToAct}
                  onChange={(e) => setConsentToAct(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  The director consents to act and has verified identity via
                  GOV.UK One Login or an ACSP.
                </span>
              </label>
            </>
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
                <p className="text-ink-soft">
                  {mode === "appoint" ? "Appointing" : "Removing"}
                </p>
                <p className="font-semibold text-ink">{directorName}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  {mode === "appoint"
                    ? `Appointment date: ${appointedOn}`
                    : `Resignation date: ${resignedOn}`}
                </p>
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
