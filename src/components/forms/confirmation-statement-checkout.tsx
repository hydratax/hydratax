"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CH_GUIDANCE, formatChFeeBreakdown, type ChServiceDetail } from "@/lib/ch-services";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { authEntryHref } from "@/lib/auth-return";
import {
  clearCs01Draft,
  cs01ResumePath,
  loadCs01Draft,
  saveCs01Draft,
} from "@/lib/cs01-checkout-draft";
import { hasSignedInSession } from "@/server/actions/session-check";

type RegisterView = {
  companyNumber: string;
  companyName: string;
  confirmationDate: string;
  nextDue: string | null;
  registeredOffice: string;
  sicCodes: string;
  directors: { name: string; role: string | null; appointedOn: string | null }[];
  pscs: { name: string | null; naturesOfControl: string[] }[];
};

type DirectorCodes = {
  fullName: string;
  dateOfBirth: string;
  personalCode: string;
};

function formatAddress(addr?: Record<string, string | undefined> | null) {
  if (!addr) return "";
  return [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function ConfirmationStatementCheckout({
  service,
  defaults,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
}) {
  const fees = formatChFeeBreakdown(service);
  const presetCompany =
    defaults?.companyNumber?.trim().toUpperCase() ||
    defaults?.company_number?.trim().toUpperCase() ||
    "";
  const wantResume = defaults?.resume === "1" || defaults?.pay === "1";
  const [phase, setPhase] = useState<"search" | "confirm">(
    presetCompany || wantResume ? "confirm" : "search",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<
    Array<{
      company_number: string;
      title: string;
      company_status?: string;
      address_snippet?: string;
    }>
  >([]);
  const [register, setRegister] = useState<RegisterView | null>(null);
  const [directorCodes, setDirectorCodes] = useState<DirectorCodes[]>([]);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attemptedPay, setAttemptedPay] = useState(false);
  const [lookupPending, setLookupPending] = useState(Boolean(presetCompany));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const confirmBoxRef = useRef<HTMLLabelElement>(null);
  const skipNextChWipe = useRef(false);

  const authCodeMissing = !companyAuthCode.trim();
  const authCodeFormatOk =
    !authCodeMissing &&
    /^[A-Za-z0-9]{6,12}$/.test(companyAuthCode.trim());
  const directorsReady =
    directorCodes.length > 0 &&
    directorCodes.every(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth) &&
        d.personalCode.trim().length === 11,
    );
  /** Auth + directors filled — confirmation checkbox still required before checkout */
  const fieldsReady = authCodeFormatOk && directorsReady;
  const canPay = fieldsReady && confirmed;

  function persistDraft(partial?: Partial<ReturnType<typeof buildDraft>>) {
    const base = buildDraft();
    if (!base) return;
    saveCs01Draft({ ...base, ...partial });
  }

  function buildDraft() {
    if (!register) return null;
    return {
      v: 1 as const,
      phase,
      companyNumber: register.companyNumber,
      companyName: register.companyName,
      confirmationDate: register.confirmationDate,
      nextDue: register.nextDue,
      registeredOffice: register.registeredOffice,
      sicCodes: register.sicCodes,
      directors: register.directors,
      pscs: register.pscs,
      directorCodes,
      companyAuthCode,
      confirmed,
      updatedAt: new Date().toISOString(),
    };
  }

  useEffect(() => {
    if (hydrated) return;
    setHydrated(true);
    const draft = loadCs01Draft(presetCompany || undefined);
    if (!draft) return;
    skipNextChWipe.current = true;
    setRegister({
      companyNumber: draft.companyNumber,
      companyName: draft.companyName,
      confirmationDate: draft.confirmationDate,
      nextDue: draft.nextDue,
      registeredOffice: draft.registeredOffice,
      sicCodes: draft.sicCodes,
      directors: draft.directors,
      pscs: draft.pscs,
    });
    setDirectorCodes(draft.directorCodes);
    setCompanyAuthCode(draft.companyAuthCode);
    setConfirmed(Boolean(draft.confirmed));
    setSearchQuery(draft.companyName);
    setPhase(
      wantResume || draft.phase === "confirm" ? "confirm" : draft.phase,
    );
    setLookupPending(false);
  }, [hydrated, presetCompany, wantResume]);

  useEffect(() => {
    if (!hydrated || !register) return;
    persistDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    phase,
    register,
    directorCodes,
    companyAuthCode,
    confirmed,
  ]);

  useEffect(() => {
    if (!presetCompany) return;
    if (register?.companyNumber === presetCompany) return;
    void loadCompany(presetCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCompany]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (phase !== "search" || q.length < 2) {
      if (q.length < 2) setSearchHits([]);
      return;
    }
    if (register && q === register.companyName) return;

    const t = setTimeout(() => {
      void searchByName(q);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, phase]);

  async function searchByName(q: string) {
    setLookupPending(true);
    setError(null);
    try {
      if (/^[A-Z0-9]{6,8}$/i.test(q) && !/\s/.test(q)) {
        await loadCompany(q.toUpperCase());
        return;
      }
      const res = await fetch(
        `/api/companies-house/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const items = (data.items ?? []) as typeof searchHits;
      setSearchHits(items);
      if (items.length === 0) {
        setError(data.message ?? "No companies matched that name.");
      } else if (items.length === 1) {
        await loadCompany(items[0].company_number);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLookupPending(false);
    }
  }

  async function loadCompany(companyNumber: string) {
    setLookupPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?company_number=${encodeURIComponent(companyNumber)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      const profile = data.profile as {
        company_name?: string;
        company_number?: string;
        sic_codes?: string[];
        registered_office_address?: Record<string, string | undefined>;
        confirmation_statement?: {
          next_due?: string;
          next_made_up_to?: string;
          last_made_up_to?: string;
        };
      } | undefined;
      if (!profile?.company_name || !profile.company_number) {
        setError("Company not found on Companies House.");
        return;
      }
      const officers = (data.officers ?? []) as Array<{
        name: string;
        officer_role?: string;
        appointed_on?: string;
        resigned_on?: string;
      }>;
      const pscs = (data.pscs ?? []) as Array<{
        name?: string;
        natures_of_control?: string[];
        ceased_on?: string;
        ceased?: boolean;
      }>;
      const activeDirectors = officers.filter(
        (o) => !o.resigned_on && /director/i.test(o.officer_role ?? "director"),
      );
      const directorList = (
        activeDirectors.length
          ? activeDirectors
          : officers.filter((o) => !o.resigned_on)
      ).map((o) => ({
        name: o.name,
        role: o.officer_role ?? null,
        appointedOn: o.appointed_on ?? null,
      }));
      const next: RegisterView = {
        companyNumber: profile.company_number,
        companyName: profile.company_name,
        confirmationDate:
          profile.confirmation_statement?.next_made_up_to?.slice(0, 10) ??
          profile.confirmation_statement?.next_due?.slice(0, 10) ??
          profile.confirmation_statement?.last_made_up_to?.slice(0, 10) ??
          "",
        nextDue: profile.confirmation_statement?.next_due ?? null,
        registeredOffice: formatAddress(profile.registered_office_address),
        sicCodes: (profile.sic_codes ?? []).join(", "),
        directors: directorList,
        pscs: pscs
          .filter((p) => !p.ceased && !p.ceased_on)
          .map((p) => ({
            name: p.name ?? null,
            naturesOfControl: p.natures_of_control ?? [],
          })),
      };
      setRegister(next);
      if (skipNextChWipe.current) {
        skipNextChWipe.current = false;
        // Keep draft auth code / director codes / confirmation after CH refresh
      } else {
        setDirectorCodes(
          next.directors.map((d) => ({
            fullName: d.name,
            dateOfBirth: "",
            personalCode: "",
          })),
        );
        setConfirmed(false);
      }
      setSearchQuery(next.companyName);
      setSearchHits([]);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupPending(false);
    }
  }

  function pay() {
    if (!register) return;
    setAttemptedPay(true);
    setError(null);
    if (!register.confirmationDate) {
      setError("Confirmation statement date missing from Companies House.");
      return;
    }
    if (authCodeMissing) {
      setError("Enter the company authentication code.");
      return;
    }
    if (!authCodeFormatOk) {
      setError(
        "Company authentication code must be 6–12 letters or digits.",
      );
      return;
    }
    const badDirector = directorCodes.find(
      (d) =>
        !d.dateOfBirth ||
        !/^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth) ||
        d.personalCode.trim().length !== 11,
    );
    if (badDirector || directorCodes.length === 0) {
      setError(
        "Each director needs date of birth and an 11-character personal code.",
      );
      return;
    }
    if (!confirmed) {
      setError(
        "Tick the confirmation box before paying — checkout cannot continue without it.",
      );
      confirmBoxRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    const resumePath = cs01ResumePath(register.companyNumber);
    persistDraft({ phase: "confirm", confirmed: true });

    start(async () => {
      try {
        const signedIn = await hasSignedInSession();
        if (!signedIn) {
          window.location.assign(authEntryHref("sign-in", resumePath));
          return;
        }

        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          returnPath: resumePath,
          fields: {
            companyNumber: register.companyNumber,
            companyName: register.companyName,
            confirmationDate: register.confirmationDate,
            companyAuthCode: companyAuthCode.trim(),
            registeredOffice: register.registeredOffice,
            sicCodes: register.sicCodes,
            directorsJson: JSON.stringify(
              directorCodes.map((d) => ({
                fullName: d.fullName,
                dateOfBirth: d.dateOfBirth,
                personalCode: d.personalCode.trim().toUpperCase(),
              })),
            ),
            pscsJson: JSON.stringify(register.pscs),
            lawfulPurpose: true,
            ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
          },
        });
        const checkout = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: res.checkoutPlanKey }),
        });
        const data = (await checkout.json()) as {
          url?: string;
          error?: string;
        };
        if (checkout.ok && data.url) {
          clearCs01Draft();
          window.location.href = data.url;
          return;
        }
        setError(
          data.error ??
            "Request saved, but checkout is not configured yet. Contact support.",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Checkout failed";
        if (/NEXT_REDIRECT|sign in|unauthori|session/i.test(msg)) {
          window.location.assign(authEntryHref("sign-in", resumePath));
          return;
        }
        setError(msg);
      }
    });
  }

  return (
    <div className="panel gloss-card mx-auto max-w-2xl space-y-5 overflow-visible p-4 safe-bottom sm:p-5 md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Confirmation statement
        </p>
        <h2 className="display mt-1 text-2xl text-ink md:text-3xl">
          {phase === "search"
            ? "Find your company"
            : lookupPending && !register
              ? "Loading company…"
              : "Confirm & pay"}
        </h2>
        {phase === "search" && (
          <p className="mt-1 text-sm text-ink-soft">
            Search Companies House by name. We’ll load the register details next.
          </p>
        )}
      </div>

      {lookupPending && !register && (
        <p className="text-sm text-ink-soft">Loading company from Companies House…</p>
      )}

      {phase === "search" && (
        <div className="space-y-3">
          <label className="label" htmlFor="cs-search">
            Company name
            <input
              id="cs-search"
              className="input mt-1.5"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setRegister(null);
                setSearchHits([]);
              }}
              placeholder="search company by name"
              autoComplete="organization"
            />
          </label>
          {lookupPending && (
            <p className="text-xs text-ink-soft">Searching Companies House…</p>
          )}
          {searchHits.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {searchHits.map((item) => (
                <li key={item.company_number}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-sea/5"
                    onClick={() => void loadCompany(item.company_number)}
                  >
                    <span className="font-semibold text-ink">{item.title}</span>
                    <span className="mono text-xs text-ink-soft">
                      {item.company_number}
                      {item.company_status ? ` · ${item.company_status}` : ""}
                    </span>
                    {item.address_snippet ? (
                      <span className="text-xs text-ink-soft">
                        {item.address_snippet}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === "confirm" && register && (
        <div className="space-y-5">
          {presetCompany ? (
            <a
              href={`/companies-house/company/${encodeURIComponent(register.companyNumber)}`}
              className="text-sm font-semibold text-sea"
            >
              ← Back to company hub
            </a>
          ) : (
            <button
              type="button"
              className="text-sm font-semibold text-sea"
              onClick={() => {
                setPhase("search");
                setConfirmed(false);
                setAttemptedPay(false);
                setRegister(null);
                setDirectorCodes([]);
                setSearchHits([]);
              }}
            >
              ← Search again
            </button>
          )}

          <p className="rounded-xl border border-line bg-sand/40 px-4 py-3 text-sm text-ink-soft">
            CS01 confirms the register is already correct. To change directors,
            PSC, or registered office, update those with Companies House first,
            then search again here.
          </p>

          <div className="rounded-2xl border border-line bg-sea/[0.06] px-5 py-4">
            <p className="display text-2xl leading-tight text-ink md:text-3xl">
              {register.companyName}
            </p>
            <p className="mono mt-2 text-sm text-ink-soft">
              {register.companyNumber}
            </p>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              attemptedPay && (!authCodeFormatOk || authCodeMissing)
                ? "border-danger/40 bg-danger/5"
                : "border-sea/30 bg-white"
            }`}
          >
            <label className="label" htmlFor="cs-auth-pay">
              Company authentication code
              <span className="font-normal text-danger"> *</span>
              <input
                id="cs-auth-pay"
                className={`input mt-1.5 mono ${
                  attemptedPay && (!authCodeFormatOk || authCodeMissing)
                    ? "border-danger focus:border-danger"
                    : ""
                }`}
                value={companyAuthCode}
                onChange={(e) => setCompanyAuthCode(e.target.value)}
                placeholder="Authentication code"
                autoComplete="off"
                required
                aria-required
                aria-invalid={
                  attemptedPay && (!authCodeFormatOk || authCodeMissing)
                }
              />
            </label>
            <p className="mt-2 text-xs text-ink-soft">
              Required before payment. Company-level code from Companies House
              online filing (not on the public register).
            </p>
            {attemptedPay && authCodeMissing && (
              <p className="mt-2 text-sm text-danger" role="alert">
                Enter the company authentication code.
              </p>
            )}
            {attemptedPay && !authCodeMissing && !authCodeFormatOk && (
              <p className="mt-2 text-sm text-danger" role="alert">
                Company authentication code must be 6–12 letters or digits.
              </p>
            )}
          </div>

          <section className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="grid gap-px bg-line sm:grid-cols-2">
              <div className="bg-white px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Made up to
                </p>
                <p className="mt-1.5 text-base font-semibold text-ink">
                  {register.confirmationDate
                    ? new Date(register.confirmationDate).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )
                    : "—"}
                </p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Due by
                </p>
                <p className="mt-1.5 text-base font-semibold text-ink">
                  {register.nextDue
                    ? new Date(register.nextDue).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-5 border-t border-line px-5 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Registered office
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  {register.registeredOffice || "—"}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  SIC codes
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(register.sicCodes
                    ? register.sicCodes.split(",").map((s) => s.trim())
                    : []
                  ).map((code) => (
                    <span
                      key={code}
                      className="mono rounded-md border border-sea/20 bg-sea/5 px-2.5 py-1 text-xs font-semibold text-ink"
                    >
                      {code}
                    </span>
                  ))}
                  {!register.sicCodes && (
                    <span className="text-sm text-ink-soft">—</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Directors
                </p>
                <ul className="mt-2 space-y-2">
                  {register.directors.map((d) => (
                    <li
                      key={`${d.name}-${d.appointedOn}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-line/80 bg-sand/30 px-3 py-2.5"
                    >
                      <span className="text-sm font-semibold text-ink">
                        {d.name}
                      </span>
                      {d.role ? (
                        <span className="shrink-0 text-xs capitalize text-ink-soft">
                          {d.role}
                        </span>
                      ) : null}
                    </li>
                  ))}
                  {!register.directors.length && (
                    <li className="text-sm text-ink-soft">—</li>
                  )}
                </ul>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                  Persons with significant control
                </p>
                <ul className="mt-2 space-y-2">
                  {register.pscs.map((p, i) => (
                    <li
                      key={`${p.name}-${i}`}
                      className="rounded-lg border border-line/80 bg-sand/30 px-3 py-2.5 text-sm font-semibold text-ink"
                    >
                      {p.name ?? "PSC"}
                    </li>
                  ))}
                  {!register.pscs.length && (
                    <li className="text-sm text-ink-soft">—</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Director personal codes
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                Required for CS01. Each director gets an 11-character code after
                verifying identity via GOV.UK One Login or an ACSP. There is no
                live check that a code belongs to that director until Companies
                House processes the filing.
              </p>
            </div>
            {directorCodes.map((d, i) => {
              const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(d.dateOfBirth);
              const codeOk = d.personalCode.trim().length === 11;
              const incomplete = attemptedPay && (!dobOk || !codeOk);
              return (
                <fieldset
                  key={`${d.fullName}-${i}`}
                  className={`space-y-3 rounded-xl border p-4 ${
                    incomplete
                      ? "border-danger/40 bg-danger/5"
                      : "border-line bg-white"
                  }`}
                >
                  <legend className="px-1 text-sm font-semibold text-ink">
                    {d.fullName}
                  </legend>
                  <label className="label">
                    Date of birth
                    <input
                      type="date"
                      className={`input mt-1.5 ${
                        attemptedPay && !dobOk
                          ? "border-danger focus:border-danger"
                          : ""
                      }`}
                      value={d.dateOfBirth}
                      aria-invalid={attemptedPay && !dobOk}
                      onChange={(e) =>
                        setDirectorCodes((rows) =>
                          rows.map((row, idx) =>
                            idx === i
                              ? { ...row, dateOfBirth: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="label">
                    Personal code
                    <input
                      className={`input mt-1.5 mono ${
                        attemptedPay && !codeOk
                          ? "border-danger focus:border-danger"
                          : ""
                      }`}
                      value={d.personalCode}
                      maxLength={11}
                      placeholder="11 characters"
                      autoComplete="off"
                      aria-invalid={attemptedPay && !codeOk}
                      onChange={(e) =>
                        setDirectorCodes((rows) =>
                          rows.map((row, idx) =>
                            idx === i
                              ? {
                                  ...row,
                                  personalCode: e.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]/g, ""),
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  {incomplete && (
                    <p className="text-sm text-danger" role="alert">
                      {!dobOk
                        ? "Enter date of birth."
                        : "Enter the 11-character personal code."}
                    </p>
                  )}
                  <a
                    href={CH_GUIDANCE.personalCodes}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-semibold text-sea"
                  >
                    Get personal code ↗
                  </a>
                </fieldset>
              );
            })}
          </div>

          <label
            ref={confirmBoxRef}
            className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm text-ink ${
              attemptedPay && !confirmed
                ? "border-danger bg-danger/5 ring-2 ring-danger/30"
                : "border-line bg-white"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              required
              aria-invalid={attemptedPay && !confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
            />
            <span>
              I confirm these Companies House details are correct and the
              company’s intended future activities are lawful
              <span className="text-danger"> *</span>
            </span>
          </label>
          {attemptedPay && !confirmed && (
            <p className="text-sm font-semibold text-danger" role="alert">
              You must tick this confirmation before paying.
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={pending || !fieldsReady}
            onClick={pay}
          >
            {pending
              ? "Opening checkout…"
              : !authCodeFormatOk
                ? "Enter authentication code to pay"
                : !directorsReady
                  ? "Complete director personal codes to pay"
                  : !confirmed
                    ? "Confirm details to pay"
                    : `Pay ${fees.total}`}
          </button>
          {!canPay && (
            <p className="text-center text-xs text-ink-soft">
              Checkout stays locked until the company authentication code,
              director personal codes, and confirmation are complete.
            </p>
          )}
        </div>
      )}

      <FormErrorBanner error={error} />
    </div>
  );
}
