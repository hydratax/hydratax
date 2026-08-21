"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  fileConfirmationStatement,
  prepareConfirmationStatementFiling,
} from "@/server/actions/confirmation-statement";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type DirectorRow = {
  fullName: string;
  dateOfBirth: string;
  personalCode: string;
  codeOnFile: boolean;
};

type RegisterView = {
  companyName: string;
  confirmationDate: string;
  nextDue: string | null;
  registeredOffice: string;
  sicCodes: string;
  directors: { name: string; role: string | null; appointedOn: string | null }[];
  pscs: { name: string | null; naturesOfControl: string[] }[];
};

const emptyDirector = (name = ""): DirectorRow => ({
  fullName: name,
  dateOfBirth: "",
  personalCode: "",
  codeOnFile: false,
});

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

function registerFromSnapshot(
  snap: ClientCompaniesHouseSnapshot | null | undefined,
): RegisterView | null {
  if (!snap?.companyNumber) return null;
  return {
    companyName: snap.companyName,
    confirmationDate:
      snap.confirmationStatementNextDue?.slice(0, 10) ??
      snap.confirmationStatementLastMadeUpTo?.slice(0, 10) ??
      "",
    nextDue: snap.confirmationStatementNextDue,
    registeredOffice: snap.registeredOffice ?? "",
    sicCodes: (snap.sicCodes ?? []).join(", "),
    directors: (snap.directors ?? [])
      .filter((d) => !d.resignedOn)
      .map((d) => ({
        name: d.name,
        role: d.role,
        appointedOn: d.appointedOn,
      })),
    pscs: (snap.pscs ?? []).map((p) => ({
      name: p.name,
      naturesOfControl: p.naturesOfControl ?? [],
    })),
  };
}

export function ConfirmationStatementWizard({
  defaults,
  readiness,
  snapshot,
}: {
  defaults?: Record<string, string>;
  readiness: {
    xmlGateway: boolean;
    canAttemptLiveSubmit: boolean;
    notes: string[];
  };
  snapshot?: ClientCompaniesHouseSnapshot | null;
}) {
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState(
    snapshot?.companyName ?? defaults?.companyNumber ?? "",
  );
  const [companyNumber, setCompanyNumber] = useState(
    defaults?.companyNumber ?? snapshot?.companyNumber ?? "",
  );
  const [searchHits, setSearchHits] = useState<
    Array<{
      company_number: string;
      title: string;
      company_status?: string;
      address_snippet?: string;
    }>
  >([]);
  const [register, setRegister] = useState<RegisterView | null>(() =>
    registerFromSnapshot(snapshot),
  );
  const [lookupPending, setLookupPending] = useState(false);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [lawful, setLawful] = useState(false);
  const [registerConfirmed, setRegisterConfirmed] = useState(false);
  const [sicCodes, setSicCodes] = useState(
    (snapshot?.sicCodes ?? []).join(", "),
  );
  const [editingSic, setEditingSic] = useState(false);
  const [directors, setDirectors] = useState<DirectorRow[]>(() => {
    const fromSnap = (snapshot?.directors ?? [])
      .filter((d) => !d.resignedOn)
      .map((d) => emptyDirector(d.name));
    return fromSnap.length ? fromSnap : [emptyDirector()];
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filingId, setFilingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const companyName = register?.companyName ?? "";
  const confirmationDate = register?.confirmationDate ?? "";

  const steps = useMemo(
    () => ["Company", "Confirm register", "Identity codes", "File"],
    [],
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    // Don't re-search once a company is selected and the field shows its name
    if (register && q === register.companyName) return;

    const t = setTimeout(() => {
      void searchByName();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on query only
  }, [searchQuery]);

  async function searchByName() {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters of the company name.");
      return;
    }
    setLookupPending(true);
    setError(null);
    setSearchHits([]);
    setRegister(null);
    try {
      // Pure digits → treat as company number shortcut
      if (/^[A-Z0-9]{6,8}$/i.test(q) && !/\s/.test(q)) {
        setCompanyNumber(q.toUpperCase());
        await lookupCompany(q.toUpperCase());
        return;
      }
      const res = await fetch(
        `/api/companies-house/search?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const items = (data.items ?? []) as Array<{
        company_number: string;
        title: string;
        company_status?: string;
        address_snippet?: string;
      }>;
      setSearchHits(items);
      if (items.length === 0) {
        setError(data.message ?? "No companies matched that name.");
      } else if (items.length === 1) {
        setCompanyNumber(items[0].company_number);
        setSearchQuery(items[0].title);
        await lookupCompany(items[0].company_number);
        setSearchHits([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLookupPending(false);
    }
  }

  async function lookupCompany(num: string) {
    setLookupPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies-house/search?company_number=${encodeURIComponent(num)}`,
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
      if (!profile?.company_name) {
        setError("Company not found on Companies House.");
        setRegister(null);
        return;
      }
      if (profile.company_number) {
        setCompanyNumber(profile.company_number);
      }
      setSearchQuery(profile.company_name);
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
      }>;
      const activeDirectors = officers.filter(
        (o) =>
          !o.resigned_on &&
          /director/i.test(o.officer_role ?? "director"),
      );
      const directorList = (activeDirectors.length ? activeDirectors : officers.filter((o) => !o.resigned_on)).map(
        (o) => ({
          name: o.name,
          role: o.officer_role ?? null,
          appointedOn: o.appointed_on ?? null,
        }),
      );
      const csDate =
        profile.confirmation_statement?.next_made_up_to?.slice(0, 10) ??
        profile.confirmation_statement?.next_due?.slice(0, 10) ??
        profile.confirmation_statement?.last_made_up_to?.slice(0, 10) ??
        "";
      const next: RegisterView = {
        companyName: profile.company_name,
        confirmationDate: csDate,
        nextDue: profile.confirmation_statement?.next_due ?? null,
        registeredOffice: formatAddress(profile.registered_office_address),
        sicCodes: (profile.sic_codes ?? []).join(", "),
        directors: directorList,
        pscs: pscs
          .filter((p) => !p.ceased_on)
          .map((p) => ({
            name: p.name ?? null,
            naturesOfControl: p.natures_of_control ?? [],
          })),
      };
      setRegister(next);
      setSicCodes(next.sicCodes);
      setDirectors(
        next.directors.length
          ? next.directors.map((d) => emptyDirector(d.name))
          : [emptyDirector()],
      );
      setRegisterConfirmed(false);
      setSearchHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupPending(false);
    }
  }

  function updateDirector(i: number, patch: Partial<DirectorRow>) {
    setDirectors((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="panel gloss-card space-y-5 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          Confirmation Statement
        </p>
        <h2 className="display mt-1 text-2xl text-ink">
          File confirmation statement
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Search by company name — we pull the rest from Companies House. You
          only need the authentication code and director personal codes.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              i === step
                ? "bg-sea text-white"
                : i < step
                  ? "bg-sea/15 text-sea"
                  : "bg-sand text-ink-soft"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="cs-co-search">
              Company name
            </label>
            <input
              id="cs-co-search"
              className="input mt-1.5"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setRegister(null);
                setSearchHits([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchByName();
                }
              }}
              placeholder="search company by name"
              autoComplete="organization"
            />
          </div>

          {searchHits.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {searchHits.map((item) => (
                <li key={item.company_number}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-sea/5"
                    onClick={() => {
                      setCompanyNumber(item.company_number);
                      setSearchQuery(item.title);
                      void lookupCompany(item.company_number);
                    }}
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

          {register && (
            <div className="rounded-xl border border-sea/25 bg-sea/5 px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{register.companyName}</p>
              <p className="mono mt-0.5 text-xs text-ink-soft">
                {companyNumber}
              </p>
              <p className="mt-1 text-ink-soft">
                CS made up to{" "}
                <span className="font-semibold text-ink">
                  {register.confirmationDate || "—"}
                </span>
                {register.nextDue
                  ? ` · due ${register.nextDue.slice(0, 10)}`
                  : ""}
              </p>
              <p className="mt-1 text-ink-soft">
                {register.directors.length} director
                {register.directors.length === 1 ? "" : "s"} · SIC{" "}
                {register.sicCodes || "—"}
              </p>
            </div>
          )}

          <label className="label" htmlFor="cs-auth">
            Company authentication code
            <span className="font-normal text-danger"> *</span>
            <span className="font-normal text-ink-soft">
              {" "}
              (from Companies House online filing — not on the public register)
            </span>
            <input
              id="cs-auth"
              className={`input mt-1.5 mono ${
                !companyAuthCode.trim() ? "border-sea/40" : ""
              }`}
              value={companyAuthCode}
              onChange={(e) => setCompanyAuthCode(e.target.value)}
              placeholder="Authentication code"
              autoComplete="off"
              required
            />
          </label>
          <p className="text-xs text-ink-soft">
            Required before you can continue — Hydra will not open checkout
            without this code.
          </p>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={lawful}
              onChange={(e) => setLawful(e.target.checked)}
            />
            I confirm the company’s intended future activities are lawful
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Pulled from Companies House. Confirm these details are correct for
            this filing.
          </p>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Company
            </h3>
            <p className="mt-2 text-sm font-medium text-ink">
              {companyName} ({companyNumber})
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Confirmation statement date:{" "}
              <span className="font-semibold text-ink">
                {confirmationDate || "—"}
              </span>
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Registered office
            </h3>
            <p className="mt-2 text-sm font-medium text-ink">
              {register?.registeredOffice || "Not available from Companies House"}
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Directors &amp; officers
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {(register?.directors ?? []).map((d) => (
                <li key={`${d.name}-${d.appointedOn}`}>
                  {d.name}
                  {d.role ? ` — ${d.role}` : ""}
                  {d.appointedOn
                    ? ` (appointed ${new Date(d.appointedOn).toLocaleDateString("en-GB")})`
                    : ""}
                </li>
              ))}
              {!register?.directors?.length && (
                <li className="text-ink-soft">No officers loaded.</li>
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-sea/40 bg-sea/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                SIC codes
              </h3>
              <button
                type="button"
                className="text-sm font-semibold text-sea"
                onClick={() => setEditingSic((v) => !v)}
              >
                {editingSic ? "Done" : "Edit"}
              </button>
            </div>
            {editingSic ? (
              <input
                className="input mt-2 mono"
                value={sicCodes}
                onChange={(e) => setSicCodes(e.target.value)}
                placeholder="e.g. 62020, 69201"
              />
            ) : (
              <p className="mt-2 mono text-sm font-medium text-ink">
                {sicCodes || "—"}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              People with significant control
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {(register?.pscs ?? []).map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  {p.name ?? "PSC"}
                  {p.naturesOfControl?.length
                    ? ` — ${p.naturesOfControl.join("; ").replace(/-/g, " ")}`
                    : ""}
                </li>
              ))}
              {!register?.pscs?.length && (
                <li className="text-ink-soft">No PSCs loaded.</li>
              )}
            </ul>
          </section>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              checked={registerConfirmed}
              onChange={(e) => setRegisterConfirmed(e.target.checked)}
            />
            I confirm the register details above are correct for this filing
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Directors are from Companies House. Enter each person’s date of birth
            and 11-character personal code (from GOV.UK One Login / ACSP).
          </p>
          {directors.map((d, i) => (
            <fieldset
              key={i}
              className="space-y-2 rounded-lg border border-line p-3"
            >
              <legend className="px-1 text-sm font-semibold text-ink">
                {d.fullName || `Director ${i + 1}`}
              </legend>
              <label className="label">
                Date of birth
                <input
                  className="input mt-1.5"
                  type="date"
                  value={d.dateOfBirth}
                  onChange={(e) =>
                    updateDirector(i, { dateOfBirth: e.target.value })
                  }
                />
              </label>
              <label className="label">
                Personal code
                <input
                  className="input mt-1.5 mono"
                  placeholder="11 characters"
                  value={d.personalCode}
                  maxLength={11}
                  autoComplete="off"
                  onChange={(e) =>
                    updateDirector(i, {
                      personalCode: e.target.value.toUpperCase(),
                      codeOnFile: e.target.value.length === 11,
                    })
                  }
                />
              </label>
            </fieldset>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-sm">
          <dl className="grid gap-2 rounded-lg bg-sand/50 p-4">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Company</dt>
              <dd className="font-semibold text-ink">
                {companyName} ({companyNumber})
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">CS date</dt>
              <dd className="font-semibold text-ink">{confirmationDate}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">SIC codes</dt>
              <dd className="text-right font-semibold text-ink">
                {sicCodes || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Directors</dt>
              <dd className="text-right font-semibold text-ink">
                {directors.map((d) => d.fullName).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <FormErrorBanner error={error} />
      {message && (
        <p className="text-sm text-ok" role="status">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              if (step === 0) {
                if (!companyNumber || !register || !confirmationDate) {
                  setError("Look up a valid company number first.");
                  return;
                }
                if (!companyAuthCode || !lawful) {
                  setError(
                    "Enter the company authentication code and confirm lawful purpose.",
                  );
                  return;
                }
              }
              if (step === 1 && !registerConfirmed) {
                setError("Confirm the register details before continuing.");
                return;
              }
              if (step === 2) {
                if (
                  directors.some(
                    (d) =>
                      !d.fullName ||
                      !d.dateOfBirth ||
                      d.personalCode.length !== 11,
                  )
                ) {
                  setError(
                    "Each director needs date of birth and an 11-character personal code.",
                  );
                  return;
                }
              }
              setStep((s) => s + 1);
            }}
          >
            Continue
          </button>
        )}
        {step === 3 && (
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMessage(null);
                start(async () => {
                  const prepared = await prepareConfirmationStatementFiling({
                    companyNumber,
                    companyName,
                    confirmationDate,
                    companyAuthCode,
                    lawfulPurposeConfirmed: true as const,
                    directors: directors.map(
                      ({ fullName, dateOfBirth, personalCode }) => ({
                        fullName,
                        dateOfBirth,
                        personalCode,
                      }),
                    ),
                    clientId: defaults?.clientId || undefined,
                  });
                  if (!prepared.ok) {
                    setError(prepared.error);
                    return;
                  }
                  setFilingId(prepared.filingId);
                  const filed = await fileConfirmationStatement(
                    prepared.filingId,
                    { dryRun: true },
                  );
                  if (!filed.ok) {
                    setError(filed.error);
                    return;
                  }
                  setMessage(filed.message);
                });
              }}
            >
              {pending ? "Working…" : "Validate package"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !readiness.canAttemptLiveSubmit}
              title={
                readiness.canAttemptLiveSubmit
                  ? "Submit to Companies House"
                  : "Add presenter credentials first"
              }
              onClick={() => {
                setError(null);
                setMessage(null);
                start(async () => {
                  let id = filingId;
                  if (!id) {
                    const prepared = await prepareConfirmationStatementFiling({
                      companyNumber,
                      companyName,
                      confirmationDate,
                      companyAuthCode,
                      lawfulPurposeConfirmed: true as const,
                      directors: directors.map(
                        ({ fullName, dateOfBirth, personalCode }) => ({
                          fullName,
                          dateOfBirth,
                          personalCode,
                        }),
                      ),
                      clientId: defaults?.clientId || undefined,
                    });
                    if (!prepared.ok) {
                      setError(prepared.error);
                      return;
                    }
                    id = prepared.filingId;
                    setFilingId(id);
                  }
                  const filed = await fileConfirmationStatement(id, {
                    dryRun: false,
                  });
                  if (!filed.ok) {
                    setError(filed.error);
                    return;
                  }
                  setMessage(
                    filed.submissionNumber
                      ? `${filed.message} Ref: ${filed.submissionNumber}`
                      : filed.message,
                  );
                });
              }}
            >
              {pending ? "Submitting…" : "Submit to Companies House"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
