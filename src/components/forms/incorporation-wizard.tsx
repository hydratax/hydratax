"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChServicePrice } from "@/lib/ch-services";
import { searchSicCodes, type SicCode } from "@/lib/sic-codes";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import {
  fileIncorporation,
  prepareIncorporationFiling,
} from "@/server/actions/incorporation";
import { authEntryHref } from "@/lib/auth-return";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Address = {
  premise: string;
  street: string;
  thoroughfare: string;
  postTown: string;
  county: string;
  postcode: string;
  country: string;
};

type Director = {
  forename: string;
  surname: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  personalCode: string;
  serviceAddressSameAsRo: boolean;
  residentialAddress: Address;
  isSubscriber: boolean;
  shares: string;
};

type Subscriber = {
  forename: string;
  surname: string;
  address: Address;
  shares: string;
  personalCode: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  residentialAddress: Address;
  isPsc: boolean;
};

const STEPS = [
  { id: "name", label: "Name" },
  { id: "company", label: "Company" },
  { id: "people", label: "People" },
  { id: "shares", label: "Shares" },
  { id: "bank", label: "Bank" },
  { id: "review", label: "File" },
] as const;

const BANK_OPTIONS = [
  {
    id: "tide",
    name: "Tide",
    tagline: "Free business account built for limited companies",
  },
  {
    id: "starling",
    name: "Starling",
    tagline: "Award-winning app banking with no monthly fee",
  },
  {
    id: "monzo",
    name: "Monzo Business",
    tagline: "Simple business banking with strong spend tools",
  },
  {
    id: "revolut",
    name: "Revolut Business",
    tagline: "Multi-currency account for growing companies",
  },
  {
    id: "natwest",
    name: "NatWest",
    tagline: "Free banking for start-ups for up to 24 months",
  },
  {
    id: "hsbc",
    name: "HSBC Kinetic",
    tagline: "Digital business account with cashflow tools",
  },
  {
    id: "lloyds",
    name: "Lloyds",
    tagline: "Established high-street business banking",
  },
  {
    id: "barclays",
    name: "Barclays",
    tagline: "Business current account with branch support",
  },
  {
    id: "metro",
    name: "Metro Bank",
    tagline: "7-day branch access and free digital banking",
  },
  {
    id: "santander",
    name: "Santander",
    tagline: "Business banking with start-up offers",
  },
  {
    id: "anna",
    name: "ANNA Money",
    tagline: "Company + account package for new directors",
  },
  {
    id: "cashplus",
    name: "Cashplus",
    tagline: "Fast business account with card and app",
  },
] as const;

type BankOptionId = (typeof BANK_OPTIONS)[number]["id"] | "skip";

function isValidPersonalCode(code: string) {
  return /^[A-Z0-9]{11}$/i.test(code.trim());
}

const emptyAddress = (): Address => ({
  premise: "",
  street: "",
  thoroughfare: "",
  postTown: "",
  county: "",
  postcode: "",
  country: "GBR",
});

const emptyDirector = (): Director => ({
  forename: "",
  surname: "",
  dateOfBirth: "",
  nationality: "British",
  countryOfResidence: "United Kingdom",
  personalCode: "",
  serviceAddressSameAsRo: true,
  residentialAddress: emptyAddress(),
  isSubscriber: true,
  shares: "",
});

function normalizeCompanyName(name: string) {
  return name
    .toUpperCase()
    .replace(/\bLIMITED\b/g, "LTD")
    .replace(/[^A-Z0-9]/g, "");
}

function ensureLtd(name: string) {
  const t = name.trim();
  if (!t) return t;
  if (/\b(ltd|limited|llp|plc)\.?$/i.test(t)) return t;
  return `${t} Ltd`;
}

function AddressFields({
  value,
  onChange,
  idPrefix,
}: {
  value: Address;
  onChange: (next: Address) => void;
  idPrefix: string;
}) {
  const set = (key: keyof Address, v: string) =>
    onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-ink sm:col-span-1">
        Building / number
        <input
          id={`${idPrefix}-premise`}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          value={value.premise}
          onChange={(e) => set("premise", e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Street
        <input
          id={`${idPrefix}-street`}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          value={value.street}
          onChange={(e) => set("street", e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold text-ink sm:col-span-2">
        Area (optional)
        <input
          id={`${idPrefix}-area`}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          value={value.thoroughfare}
          onChange={(e) => set("thoroughfare", e.target.value)}
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Town / city
        <input
          id={`${idPrefix}-town`}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
          value={value.postTown}
          onChange={(e) => set("postTown", e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Postcode
        <input
          id={`${idPrefix}-postcode`}
          className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal uppercase"
          value={value.postcode}
          onChange={(e) => set("postcode", e.target.value)}
          required
        />
      </label>
    </div>
  );
}

export function IncorporationWizard({
  service,
  sameDay = false,
  readiness,
}: {
  service: ChServiceDetail;
  sameDay?: boolean;
  readiness: {
    xmlGateway: boolean;
    canAttemptLiveSubmit: boolean;
    notes: string[];
  };
}) {
  const price = formatChServicePrice(service);
  const [step, setStep] = useState(0);
  const [proposedName, setProposedName] = useState("");
  const [nameStatus, setNameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "similar" | "error"
  >("idle");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [countryOfIncorporation, setCountryOfIncorporation] = useState<
    "EW" | "SC" | "WA" | "NI"
  >("EW");
  const [registeredOffice, setRegisteredOffice] = useState<Address>(
    emptyAddress(),
  );
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [modeOfBusiness, setModeOfBusiness] = useState("");
  const [selectedSic, setSelectedSic] = useState<SicCode[]>([]);
  const [shareClass, setShareClass] = useState("Ordinary");
  const [nominalValue, setNominalValue] = useState("1.00");
  const [directors, setDirectors] = useState<Director[]>([emptyDirector()]);
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [authoriserForename, setAuthoriserForename] = useState("");
  const [authoriserSurname, setAuthoriserSurname] = useState("");
  const [lawful, setLawful] = useState(false);
  const [personalCodeAck, setPersonalCodeAck] = useState(false);
  const [cutOffAck, setCutOffAck] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<BankOptionId | null>(
    null,
  );
  const [bankShareConsent, setBankShareConsent] = useState(false);
  const [filingId, setFilingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [maxReached, setMaxReached] = useState(0);
  const [stepAnimKey, setStepAnimKey] = useState(0);

  const selectedBank =
    selectedBankId && selectedBankId !== "skip"
      ? BANK_OPTIONS.find((b) => b.id === selectedBankId) ?? null
      : null;

  const progressPct =
    STEPS.length <= 1 ? 0 : (step / (STEPS.length - 1)) * 100;

  function moveToStep(next: number) {
    setError(null);
    setStep(next);
    setMaxReached((m) => Math.max(m, next));
    setStepAnimKey((k) => k + 1);
  }

  const sicSuggestions = useMemo(
    () => searchSicCodes(modeOfBusiness, 8),
    [modeOfBusiness],
  );

  const effectiveSubscribers = useMemo(() => {
    if (subscribers) return subscribers;
    return directors
      .filter((d) => d.isSubscriber)
      .map((d) => ({
        forename: d.forename,
        surname: d.surname,
        address: d.residentialAddress,
        shares: d.shares || "1",
        personalCode: d.personalCode,
        dateOfBirth: d.dateOfBirth,
        nationality: d.nationality,
        countryOfResidence: d.countryOfResidence,
        residentialAddress: d.residentialAddress,
        isPsc: true,
      }));
  }, [subscribers, directors]);

  const totalShares = useMemo(
    () =>
      effectiveSubscribers.reduce((sum, s) => sum + (Number(s.shares) || 0), 0),
    [effectiveSubscribers],
  );

  useEffect(() => {
    const name = proposedName.trim();
    if (name.length < 3) {
      setNameStatus("idle");
      setNameMessage(null);
      return;
    }
    const t = setTimeout(() => {
      void checkNameAvailability(ensureLtd(name));
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedName]);

  async function checkNameAvailability(name: string) {
    setNameStatus("checking");
    setNameMessage(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?q=${encodeURIComponent(name)}`,
      );
      const data = (await res.json()) as {
        items?: Array<{ title: string; company_status?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Name check failed");
      const items = data.items ?? [];
      const normalized = normalizeCompanyName(name);
      const exact = items.find(
        (i) =>
          normalizeCompanyName(i.title) === normalized &&
          (i.company_status ?? "active").toLowerCase() === "active",
      );
      if (exact) {
        setNameStatus("taken");
        setNameMessage(`“${exact.title}” is already on the register.`);
        return;
      }
      if (items.length > 0) {
        setNameStatus("similar");
        setNameMessage(
          `No exact active match. ${items.length} similar name${items.length === 1 ? "" : "s"} — review carefully.`,
        );
        return;
      }
      setNameStatus("available");
      setNameMessage("Looking clear on the public register.");
    } catch (err) {
      setNameStatus("error");
      setNameMessage(
        err instanceof Error ? err.message : "Could not check name availability",
      );
    }
  }

  function toggleSic(row: SicCode) {
    setSelectedSic((prev) => {
      if (prev.some((s) => s.code === row.code)) {
        return prev.filter((s) => s.code !== row.code);
      }
      if (prev.length >= 4) return prev;
      return [...prev, row];
    });
  }

  function buildPayload() {
    const companyName = ensureLtd(proposedName);
    return {
      companyName,
      countryOfIncorporation,
      registeredOffice: {
        ...registeredOffice,
        thoroughfare: registeredOffice.thoroughfare || "",
        county: registeredOffice.county || "",
      },
      registeredEmail: registeredEmail.trim(),
      sicCodes: selectedSic.map((s) => s.code),
      shareClass,
      shareCurrency: "GBP" as const,
      nominalValue: Number(nominalValue),
      amountPaidPerShare: Number(nominalValue),
      directors: directors.map((d) => ({
        forename: d.forename.trim(),
        surname: d.surname.trim(),
        dateOfBirth: d.dateOfBirth,
        nationality: d.nationality.trim(),
        countryOfResidence: d.countryOfResidence.trim(),
        personalCode: d.personalCode.trim().toUpperCase(),
        serviceAddressSameAsRo: d.serviceAddressSameAsRo,
        residentialAddress: d.residentialAddress,
        isSubscriber: d.isSubscriber,
        shares: Number(d.shares) || 0,
      })),
      subscribers: effectiveSubscribers.map((s) => ({
        forename: s.forename.trim(),
        surname: s.surname.trim(),
        address: s.address,
        shares: Number(s.shares) || 0,
        personalCode: s.personalCode.trim().toUpperCase(),
        dateOfBirth: s.dateOfBirth,
        nationality: s.nationality,
        countryOfResidence: s.countryOfResidence,
        residentialAddress: s.residentialAddress,
        isPsc: s.isPsc,
      })),
      sameDay,
      lawfulPurposeConfirmed: lawful,
      personalCodesConfirmed: personalCodeAck,
      sameDayCutOffAck: cutOffAck,
      authoriserForename:
        authoriserForename.trim() || directors[0]?.forename.trim() || "",
      authoriserSurname:
        authoriserSurname.trim() || directors[0]?.surname.trim() || "",
    };
  }

  function canAdvance(from: number): string | null {
    if (from === 0) {
      if (proposedName.trim().length < 3) return "Enter a proposed company name.";
      if (nameStatus === "taken") return "Choose an available company name.";
      return null;
    }
    if (from === 1) {
      if (
        !registeredOffice.premise ||
        !registeredOffice.street ||
        !registeredOffice.postTown ||
        !registeredOffice.postcode
      ) {
        return "Complete the registered office address.";
      }
      if (!registeredEmail.trim()) return "Add a registered email address.";
      if (selectedSic.length === 0) return "Select at least one SIC code.";
      return null;
    }
    if (from === 2) {
      if (
        directors.some(
          (d) =>
            !d.forename.trim() ||
            !d.surname.trim() ||
            !d.dateOfBirth ||
            !d.residentialAddress.premise ||
            !d.residentialAddress.postcode,
        )
      ) {
        return "Each director needs name, date of birth and home address.";
      }
      const badCode = directors.findIndex(
        (d) => !isValidPersonalCode(d.personalCode),
      );
      if (badCode >= 0) {
        return `Director ${badCode + 1}: personal code must be exactly 11 letters/digits from Companies House.`;
      }
      if (!personalCodeAck) {
        return "Confirm personal codes are correct before continuing.";
      }
      return null;
    }
    if (from === 3) {
      if (totalShares < 1) return "Issue at least one share.";
      if (effectiveSubscribers.some((s) => !s.forename.trim() || !s.shares)) {
        return "Each subscriber needs a name and share count.";
      }
      return null;
    }
    if (from === 4) {
      if (!selectedBankId) {
        return "Choose a bank offer, or select “No thanks” to skip.";
      }
      if (selectedBankId !== "skip" && !bankShareConsent) {
        return `Tick the consent box to allow sharing information with ${selectedBank?.name ?? "the bank"}.`;
      }
      return null;
    }
    return null;
  }

  function goNext() {
    setError(null);
    const block = canAdvance(step);
    if (block) {
      setError(block);
      return;
    }
    if (step === 2 && !authoriserForename && directors[0]) {
      setAuthoriserForename(directors[0].forename);
      setAuthoriserSurname(directors[0].surname);
    }
    moveToStep(Math.min(step + 1, STEPS.length - 1));
  }

  function goBack() {
    if (step === 0) return;
    moveToStep(Math.max(0, step - 1));
  }

  function runPrepare(then?: "pay" | "live") {
    setError(null);
    setOk(null);
    if (!personalCodeAck) {
      setError("Confirm personal codes on the People step before filing.");
      moveToStep(2);
      return;
    }
    if (!lawful) {
      setError("Confirm lawful purpose before continuing.");
      return;
    }
    if (sameDay && !cutOffAck) {
      setError("Confirm same-day cut-off acknowledgement.");
      return;
    }
    const payload = buildPayload();
    startTransition(async () => {
      try {
        const prepared = await prepareIncorporationFiling(payload);
        if (!prepared.ok) {
          const entries = prepared.fieldErrors
            ? Object.entries(prepared.fieldErrors)
            : [];
          const personalIssue = entries.find(([key]) =>
            /personalCode|personalCodes/i.test(key),
          );
          if (personalIssue) {
            moveToStep(2);
            setError(personalIssue[1]);
            return;
          }
          setError(entries[0]?.[1] || prepared.error);
          return;
        }
        setFilingId(prepared.filingId);
        setOk(prepared.message);

        if (then === "live") {
          const live = await fileIncorporation(prepared.filingId, {
            dryRun: false,
          });
          if (!live.ok) {
            setError(live.error);
            return;
          }
          setOk(
            `${live.message}${live.submissionNumber ? ` Ref ${live.submissionNumber}.` : ""}`,
          );
          return;
        }

        if (then === "pay") {
          const shareCapital = `${totalShares} ${shareClass.toLowerCase()} shares of £${nominalValue} each`;
          const fields: Record<string, string | boolean> = {
            proposedName: payload.companyName,
            registeredOffice: [
              registeredOffice.premise,
              registeredOffice.street,
              registeredOffice.postTown,
              registeredOffice.postcode,
            ]
              .filter(Boolean)
              .join(", "),
            modeOfBusiness: modeOfBusiness.trim() || selectedSic[0]?.description || "",
            sicCodes: selectedSic.map((s) => s.code).join(", "),
            shareClass,
            nominalValue,
            totalShares: String(totalShares),
            shareCapital,
            directorCount: String(directors.length),
            directorsJson: JSON.stringify(payload.directors),
            shareholdersJson: JSON.stringify(
              payload.subscribers.map((s) => ({
                ...s,
                percentage:
                  totalShares > 0
                    ? ((s.shares / totalShares) * 100).toFixed(2)
                    : "0",
              })),
            ),
            personalCodeAck: true,
            filingId: prepared.filingId,
            registeredEmail: payload.registeredEmail,
            in01Ready: true,
            bankOffer: selectedBankId ?? "skip",
            bankName: selectedBank?.name ?? "",
            bankShareConsent:
              selectedBankId !== null &&
              selectedBankId !== "skip" &&
              bankShareConsent,
          };
          if (sameDay) fields.cutOffAck = true;

          const res = await submitCompaniesHouseRequest({
            serviceId: service.id,
            fields,
          });
          if (!res.ok) {
            if (res.needsAuth) {
              setError("Sign in to continue to payment.");
              return;
            }
            setError(res.error);
            return;
          }
          setOk(`Request ${res.requestId.slice(0, 8)}… saved.`);
          const checkout = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              planKey: res.checkoutPlanKey,
              chRequestId: res.requestId,
            }),
          });
          const data = (await checkout.json()) as {
            url?: string;
            error?: string;
          };
          if (checkout.ok && data.url) {
            window.location.href = data.url;
            return;
          }
          setOk(
            `Package ready and request saved. Payment not configured yet — ${data.error ?? "queued for admin."}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        if (/sign in|unauthori|session/i.test(msg)) {
          setError("Sign in to pay or file your incorporation.");
          return;
        }
        setError(msg);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(14rem,0.65fr)] lg:items-start">
        <div className="min-w-0">
          <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
            {sameDay ? "Same-day IN01" : "Company incorporation · IN01"}
          </p>
          <h1 className="display mt-4 text-[clamp(2rem,4.2vw,3.2rem)] leading-[1.08] tracking-tight text-ink">
            Form your limited company
          </h1>
          <p className="mt-3 max-w-xl text-base text-ink-soft">
            Step {step + 1} of {STEPS.length}: {STEPS[step]?.label}. Live name
            check, directors, shares and optional bank offer — then pay or file.
          </p>
        </div>
        <div className="gloss-card relative overflow-hidden rounded-2xl border border-sea/25 bg-white/90 p-5 shadow-[0_20px_50px_-28px_rgba(15,118,110,0.35)]">
          <div className="gloss-shine" aria-hidden />
          <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
            Filing fee
          </p>
          <p className="display relative mt-2 text-3xl text-ink">{price}</p>
          <p className="relative mt-1 text-sm text-ink-soft">
            Companies House digital fee shown upfront.
          </p>
        </div>
      </div>

      <nav aria-label="Incorporation steps" className="incorp-stepper">
        <div className="incorp-stepper__rail" aria-hidden>
          <div
            className="incorp-stepper__rail-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = i <= maxReached;
          return (
            <button
              key={s.id}
              type="button"
              className={`incorp-stepper__item ${
                current ? "is-current" : done ? "is-done" : "is-todo"
              }`}
              disabled={!reachable}
              aria-current={current ? "step" : undefined}
              onClick={() => {
                if (reachable) moveToStep(i);
              }}
            >
              <span className="incorp-stepper__dot">
                {done ? (
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5 10.5 8.2 13.5 15 6.5"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="incorp-stepper__label">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-5 border-t border-line/70 pt-5">
        <div key={stepAnimKey} className="incorp-step-pane space-y-5">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="display text-2xl text-ink">Choose a name</h2>
              <p className="mt-1 text-sm text-ink-soft">
                We’ll check the public register as you type. We add “Ltd” if you
                leave it off.
              </p>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Proposed company name
              <input
                value={proposedName}
                onChange={(e) => setProposedName(e.target.value)}
                placeholder="Example Trading"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-3 text-lg font-normal"
                autoComplete="organization"
              />
            </label>
            {nameMessage && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  nameStatus === "taken"
                    ? "bg-danger/10 text-danger"
                    : nameStatus === "available"
                      ? "bg-sea/10 text-sea-deep"
                      : "bg-sand text-ink-soft"
                }`}
              >
                {nameStatus === "checking" ? "Checking…" : nameMessage}
                {proposedName.trim().length >= 3 && (
                  <span className="mt-1 block text-xs opacity-80">
                    Filing as {ensureLtd(proposedName)}
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="display text-2xl text-ink">Company details</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Registered office, email for Companies House, and what the
                company does.
              </p>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Country of incorporation
              <select
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                value={countryOfIncorporation}
                onChange={(e) =>
                  setCountryOfIncorporation(
                    e.target.value as "EW" | "SC" | "WA" | "NI",
                  )
                }
              >
                <option value="EW">England and Wales</option>
                <option value="WA">Wales</option>
                <option value="SC">Scotland</option>
                <option value="NI">Northern Ireland</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-semibold text-ink">
                Registered office address
              </p>
              <div className="mt-2">
                <AddressFields
                  idPrefix="ro"
                  value={registeredOffice}
                  onChange={setRegisteredOffice}
                />
              </div>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Registered email address
              <input
                type="email"
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                value={registeredEmail}
                onChange={(e) => setRegisteredEmail(e.target.value)}
                placeholder="company@example.com"
                required
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              What does the company do?
              <input
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                value={modeOfBusiness}
                onChange={(e) => setModeOfBusiness(e.target.value)}
                placeholder="e.g. software consultancy, online retail"
              />
            </label>
            {sicSuggestions.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {sicSuggestions.map((row) => {
                  const on = selectedSic.some((s) => s.code === row.code);
                  return (
                    <li key={row.code}>
                      <button
                        type="button"
                        onClick={() => toggleSic(row)}
                        className={`rounded-md border px-2.5 py-1 text-left text-xs ${
                          on
                            ? "border-sea bg-sea text-white"
                            : "border-line bg-white text-ink hover:border-sea"
                        }`}
                      >
                        <span className="font-mono font-semibold">
                          {row.code}
                        </span>{" "}
                        {row.description}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedSic.length > 0 && (
              <p className="text-xs text-ink-soft">
                Selected:{" "}
                {selectedSic.map((s) => `${s.code} ${s.description}`).join(" · ")}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="display text-2xl text-ink">Directors</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Each director needs a Companies House personal code from GOV.UK
                One Login or an ACSP.{" "}
                <Link
                  href="https://www.gov.uk/guidance/verify-your-identity-for-companies-house"
                  className="text-sea underline"
                  target="_blank"
                >
                  How to get a personal code
                </Link>
              </p>
            </div>
            {directors.map((d, i) => (
              <div
                key={i}
                className="space-y-3 rounded-xl border border-line bg-white px-4 py-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">Director {i + 1}</p>
                  {directors.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() =>
                        setDirectors((rows) => rows.filter((_, j) => j !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Forename
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.forename}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, forename: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Surname
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.surname}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, surname: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Date of birth
                    <input
                      type="date"
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.dateOfBirth}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? { ...r, dateOfBirth: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Personal code
                    <input
                      className={`mt-1.5 w-full rounded-lg border px-3 py-2 font-mono font-normal uppercase tracking-wide ${
                        d.personalCode.trim() &&
                        !isValidPersonalCode(d.personalCode)
                          ? "border-danger"
                          : "border-line"
                      }`}
                      value={d.personalCode}
                      maxLength={11}
                      placeholder="11 characters"
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  personalCode: e.target.value
                                    .replace(/[^a-zA-Z0-9]/g, "")
                                    .slice(0, 11),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                    {d.personalCode.trim() &&
                    !isValidPersonalCode(d.personalCode) ? (
                      <span className="mt-1 block text-xs font-normal text-danger">
                        Must be exactly 11 letters or digits from Companies
                        House.
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs font-normal text-ink-soft">
                        From GOV.UK One Login or an ACSP — required now.
                      </span>
                    )}
                  </label>
                  <label className="text-sm font-semibold">
                    Nationality
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.nationality}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? { ...r, nationality: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Country of residence
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.countryOfResidence}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i
                              ? { ...r, countryOfResidence: e.target.value }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <p className="text-sm font-semibold text-ink">Home address</p>
                <AddressFields
                  idPrefix={`dir-${i}-home`}
                  value={d.residentialAddress}
                  onChange={(next) =>
                    setDirectors((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, residentialAddress: next } : r,
                      ),
                    )
                  }
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.isSubscriber}
                    onChange={(e) =>
                      setDirectors((rows) =>
                        rows.map((r, j) =>
                          j === i
                            ? { ...r, isSubscriber: e.target.checked }
                            : r,
                        ),
                      )
                    }
                  />
                  Also a founding shareholder
                </label>
                {d.isSubscriber && (
                  <label className="block text-sm font-semibold">
                    Shares (optional — set on next step if preferred)
                    <input
                      type="number"
                      min={0}
                      className="mt-1.5 w-40 rounded-lg border border-line px-3 py-2 font-normal"
                      value={d.shares}
                      onChange={(e) =>
                        setDirectors((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, shares: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                )}
              </div>
            ))}
            <button
              type="button"
              className="rounded-lg border border-dashed border-sea px-3 py-2 text-sm font-semibold text-sea"
              onClick={() => setDirectors((rows) => [...rows, emptyDirector()])}
            >
              + Add director
            </button>
            <label className="flex items-start gap-2 rounded-xl border border-line bg-white/70 px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={personalCodeAck}
                onChange={(e) => setPersonalCodeAck(e.target.checked)}
              />
              <span>
                I confirm each director has verified identity via GOV.UK / ACSP
                and the personal codes entered above are correct for filing.
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="display text-2xl text-ink">Share capital</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Model articles for a private company limited by shares. We map
                shareholders over 25% as persons with significant control.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Share class
                <input
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                  value={shareClass}
                  onChange={(e) => setShareClass(e.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Nominal value (£)
                <input
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                  value={nominalValue}
                  onChange={(e) => setNominalValue(e.target.value)}
                />
              </label>
            </div>
            <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">
              {totalShares} {shareClass.toLowerCase()} shares · £
              {(totalShares * (Number(nominalValue) || 0)).toFixed(2)}{" "}
              aggregate nominal
            </p>
            {effectiveSubscribers.map((s, i) => (
              <div
                key={i}
                className="space-y-3 rounded-xl border border-line bg-white px-4 py-4"
              >
                <p className="text-sm font-bold text-ink">
                  Shareholder {i + 1}
                  {!subscribers && " (from directors)"}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-semibold">
                    Forename
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={s.forename}
                      onChange={(e) => {
                        const next = [...effectiveSubscribers];
                        next[i] = { ...s, forename: e.target.value };
                        setSubscribers(next);
                      }}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Surname
                    <input
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={s.surname}
                      onChange={(e) => {
                        const next = [...effectiveSubscribers];
                        next[i] = { ...s, surname: e.target.value };
                        setSubscribers(next);
                      }}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Shares
                    <input
                      type="number"
                      min={1}
                      className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                      value={s.shares}
                      onChange={(e) => {
                        const next = [...effectiveSubscribers];
                        next[i] = { ...s, shares: e.target.value };
                        setSubscribers(next);
                        if (!subscribers) {
                          setDirectors((dirs) =>
                            dirs.map((d) =>
                              d.forename === s.forename &&
                              d.surname === s.surname
                                ? { ...d, shares: e.target.value }
                                : d,
                            ),
                          );
                        }
                      }}
                    />
                  </label>
                </div>
                {totalShares > 0 && (
                  <p className="text-xs text-ink-soft">
                    {(
                      ((Number(s.shares) || 0) / totalShares) *
                      100
                    ).toFixed(1)}
                    % ownership
                    {(Number(s.shares) || 0) / totalShares > 0.25
                      ? " · PSC"
                      : ""}
                  </p>
                )}
              </div>
            ))}
            <button
              type="button"
              className="rounded-lg border border-dashed border-sea px-3 py-2 text-sm font-semibold text-sea"
              onClick={() => {
                const base = [...effectiveSubscribers];
                base.push({
                  forename: "",
                  surname: "",
                  address: { ...registeredOffice },
                  shares: "1",
                  personalCode: "",
                  dateOfBirth: "",
                  nationality: "British",
                  countryOfResidence: "United Kingdom",
                  residentialAddress: { ...registeredOffice },
                  isPsc: true,
                });
                setSubscribers(base);
              }}
            >
              + Add shareholder
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="display text-2xl text-ink">
                Free business bank account?
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Optional — pick a provider if you want an introduction after
                incorporation. Skip if you already bank elsewhere.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {BANK_OPTIONS.map((bank) => {
                const selected = selectedBankId === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => {
                      setSelectedBankId(bank.id);
                      setBankShareConsent(false);
                      setError(null);
                    }}
                    className={`rounded-xl border bg-white px-4 py-3 text-left transition hover:border-sea/40 ${
                      selected
                        ? "border-sea ring-2 ring-sea/20"
                        : "border-line"
                    }`}
                  >
                    <span className="font-semibold text-ink line-clamp-1">
                      {bank.name}
                    </span>
                    <span className="mt-1 block text-xs text-ink-soft">
                      {bank.tagline}
                    </span>
                    {selected && (
                      <span className="mt-2 block text-xs font-semibold text-sea">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedBankId("skip");
                setBankShareConsent(false);
                setError(null);
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                selectedBankId === "skip"
                  ? "border-ink bg-sand font-semibold text-ink"
                  : "border-dashed border-line text-ink-soft hover:border-ink/40 hover:text-ink"
              }`}
            >
              No thanks — I already have a bank account / skip for now
            </button>

            {selectedBank && (
              <label className="flex items-start gap-2 rounded-xl border border-sea/30 bg-sea/5 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={bankShareConsent}
                  onChange={(e) => {
                    setBankShareConsent(e.target.checked);
                    setError(null);
                  }}
                />
                <span>
                  I allow this website to share my company and personal
                  information with <strong>{selectedBank.name}</strong> so they
                  can contact me about opening a free business account.
                </span>
              </label>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="display text-2xl text-ink">Review & file</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Model articles (BYSHRMODEL) · data memorandum ·{" "}
                {sameDay ? "same-day flag on" : "standard speed"}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-white px-4 py-3">
                <span className="font-semibold text-ink line-clamp-1">
                  {ensureLtd(proposedName) || "Company"}
                </span>
                <span className="mt-1 block text-xs text-ink-soft">
                  {[
                    registeredOffice.premise,
                    registeredOffice.street,
                    registeredOffice.postTown,
                    registeredOffice.postcode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Address pending"}
                </span>
                <span className="mt-1 block mono text-xs text-ink-soft">
                  {registeredEmail || "Email pending"}
                  {selectedSic.length
                    ? ` · SIC ${selectedSic.map((s) => s.code).join(", ")}`
                    : ""}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-white px-4 py-3">
                <span className="font-semibold text-ink">
                  {directors.length} director
                  {directors.length === 1 ? "" : "s"} · {totalShares} shares
                </span>
                <span className="mt-1 block text-xs text-ink-soft">
                  {directors
                    .map((d) => `${d.forename} ${d.surname}`.trim())
                    .filter(Boolean)
                    .join(" · ") || "People pending"}
                </span>
                <span className="mt-1 block mono text-xs text-ink-soft">
                  Bank:{" "}
                  {selectedBankId === "skip"
                    ? "Skipped"
                    : selectedBank?.name ?? "Not chosen"}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Authoriser forename
                <input
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                  value={authoriserForename}
                  onChange={(e) => setAuthoriserForename(e.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Authoriser surname
                <input
                  className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                  value={authoriserSurname}
                  onChange={(e) => setAuthoriserSurname(e.target.value)}
                />
              </label>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={lawful}
                onChange={(e) => setLawful(e.target.checked)}
              />
              <span>
                I confirm the company’s intended future activities are lawful.
              </span>
            </label>
            {sameDay && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={cutOffAck}
                  onChange={(e) => setCutOffAck(e.target.checked)}
                />
                <span>
                  I understand same-day filing must meet Companies House cut-off
                  times.
                </span>
              </label>
            )}

            {readiness.canAttemptLiveSubmit && (
              <p className="rounded-lg bg-sea/10 px-3 py-2 text-xs text-sea-deep">
                XML gateway ready — you can submit live after signing in.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={pending}
                onClick={() => runPrepare("pay")}
                className="rounded-lg bg-sea px-4 py-3 text-sm font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
              >
                {pending ? "Working…" : `Pay ${price} & continue`}
              </button>
              {readiness.canAttemptLiveSubmit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runPrepare("live")}
                  className="rounded-lg border border-ink px-4 py-3 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
                >
                  Submit to Companies House
                </button>
              )}
            </div>
            <p className="text-xs text-ink-soft">
              Need an account?{" "}
              <Link
                href={authEntryHref(
                  "create-account",
                  sameDay
                    ? "/companies-house/incorporation-same-day"
                    : "/companies-house/incorporation",
                )}
                className="text-sea underline"
              >
                Create one
              </Link>{" "}
              or{" "}
              <Link
                href={authEntryHref(
                  "sign-in",
                  sameDay
                    ? "/companies-house/incorporation-same-day"
                    : "/companies-house/incorporation",
                )}
                className="text-sea underline"
              >
                sign in
              </Link>{" "}
              before paying or filing.
              {filingId ? ` Draft ${filingId.slice(0, 8)}…` : ""}
            </p>
          </div>
        )}

        </div>

        {ok && (
          <p className="rounded-lg bg-sea/10 px-3 py-2 text-sm text-sea-deep">
            {ok}
          </p>
        )}
        <FormErrorBanner error={error} />

        <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-4">
          <button
            type="button"
            disabled={step === 0 || pending}
            onClick={goBack}
            className="rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-sand hover:text-ink disabled:opacity-40"
          >
            Back
          </button>
          <p className="hidden text-xs text-ink-soft sm:block">
            Step {step + 1} of {STEPS.length}
          </p>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-sea px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sea-deep hover:shadow-md active:scale-[0.98]"
            >
              Continue
            </button>
          ) : (
            <span className="text-xs font-semibold text-sea self-center">
              Ready to file
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
