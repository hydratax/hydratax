"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  fileConfirmationStatement,
  prepareConfirmationStatementFiling,
} from "@/server/actions/confirmation-statement";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

type DirectorRow = {
  fullName: string;
  dateOfBirth: string;
  personalCode: string;
  codeOnFile: boolean;
};

const emptyDirector = (name = ""): DirectorRow => ({
  fullName: name,
  dateOfBirth: "",
  personalCode: "",
  codeOnFile: false,
});

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
  const [companyNumber, setCompanyNumber] = useState(
    defaults?.companyNumber ?? snapshot?.companyNumber ?? "",
  );
  const [companyName, setCompanyName] = useState(snapshot?.companyName ?? "");
  const [confirmationDate, setConfirmationDate] = useState(
    snapshot?.confirmationStatementLastMadeUpTo?.slice(0, 10) ?? "",
  );
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
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

  const steps = useMemo(
    () => ["Company", "Confirm register", "Identity codes", "File"],
    [],
  );

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
          Confirm the Companies House register, capture director personal codes,
          then submit CS01 from HydraTax.
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
        <div className="space-y-3">
          <label className="label" htmlFor="cs-co-no">
            Company number
          </label>
          <input
            id="cs-co-no"
            className="input"
            value={companyNumber}
            onChange={(e) => setCompanyNumber(e.target.value.toUpperCase())}
            placeholder="12345678"
            required
          />
          <label className="label" htmlFor="cs-co-name">
            Company name
          </label>
          <input
            id="cs-co-name"
            className="input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
          <label className="label" htmlFor="cs-date">
            Confirmation statement date
          </label>
          <input
            id="cs-date"
            type="date"
            className="input"
            value={confirmationDate}
            onChange={(e) => setConfirmationDate(e.target.value)}
            required
          />
          <label className="label" htmlFor="cs-auth">
            Company authentication code
          </label>
          <input
            id="cs-auth"
            className="input"
            value={companyAuthCode}
            onChange={(e) => setCompanyAuthCode(e.target.value)}
            placeholder="From Companies House online filing"
            autoComplete="off"
            required
          />
          <label className="label" htmlFor="cs-email">
            Registered email{" "}
            <span className="font-normal text-ink-soft">(if required)</span>
          </label>
          <input
            id="cs-email"
            type="email"
            className="input"
            value={registeredEmail}
            onChange={(e) => setRegisteredEmail(e.target.value)}
          />
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
            Please confirm all information below is correct. If anything needs
            changing, update it with Companies House separately before filing
            this statement.
          </p>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Registered office
            </h3>
            <p className="mt-2 text-sm font-medium text-ink">
              {snapshot?.registeredOffice ?? "Not loaded — sync Companies House on the client."}
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              To change, file form AD01 with Companies House.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Directors &amp; officers
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {(snapshot?.directors ?? [])
                .filter((d) => !d.resignedOn)
                .map((d) => (
                  <li key={`${d.name}-${d.appointedOn}`}>
                    {d.name}
                    {d.role ? ` — ${d.role}` : ""}
                    {d.appointedOn
                      ? ` (appointed ${new Date(d.appointedOn).toLocaleDateString("en-GB")})`
                      : ""}
                  </li>
                ))}
              {!snapshot?.directors?.length && (
                <li className="text-ink-soft">No officers loaded.</li>
              )}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              To change, file forms AP01/TM01 with Companies House.
            </p>
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
                {editingSic ? "Done" : "Edit SIC codes"}
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
              {(snapshot?.pscs ?? []).map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  {p.name ?? "PSC"}
                  {p.naturesOfControl?.length
                    ? ` — ${p.naturesOfControl.join("; ").replace(/-/g, " ")}`
                    : ""}
                </li>
              ))}
              {!snapshot?.pscs?.length && (
                <li className="text-ink-soft">No PSCs loaded.</li>
              )}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">
              To change, file PSC forms with Companies House.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Director identity verification
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-soft">
                    <th className="pb-2 font-semibold">Director</th>
                    <th className="pb-2 font-semibold">CH verification</th>
                    <th className="pb-2 font-semibold">Codes</th>
                  </tr>
                </thead>
                <tbody>
                  {directors.map((d, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className="py-2 font-medium text-ink">
                        {d.fullName || "—"}
                      </td>
                      <td className="py-2 text-ink-soft">Updating</td>
                      <td className="py-2">
                        <span className="text-ink-soft">
                          {d.personalCode.length === 11
                            ? "On file"
                            : "Needed next"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            HydraTax does not issue personal codes. Each director gets an
            11-character code after verifying identity via{" "}
            <Link
              href="https://www.gov.uk/guidance/verify-your-identity-for-companies-house"
              className="font-semibold text-sea"
              target="_blank"
              rel="noreferrer"
            >
              GOV.UK One Login
            </Link>{" "}
            or an ACSP — then paste it here for filing.
          </p>
          {directors.map((d, i) => (
            <fieldset
              key={i}
              className="space-y-2 rounded-lg border border-line p-3"
            >
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
                Director {i + 1}
              </legend>
              <input
                className="input"
                placeholder="Full name (as on register)"
                value={d.fullName}
                onChange={(e) =>
                  updateDirector(i, { fullName: e.target.value })
                }
              />
              <input
                className="input"
                type="date"
                value={d.dateOfBirth}
                onChange={(e) =>
                  updateDirector(i, { dateOfBirth: e.target.value })
                }
              />
              <input
                className="input mono"
                placeholder="Personal code (11 characters)"
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
            </fieldset>
          ))}
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setDirectors((rows) => [...rows, emptyDirector()])}
          >
            Add another director
          </button>
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
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Gateway</dt>
              <dd className="font-semibold text-ink">
                {readiness.canAttemptLiveSubmit
                  ? "Live XML submit ready"
                  : "Dry-run only (presenter credentials missing)"}
              </dd>
            </div>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            {readiness.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
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
                if (
                  !companyNumber ||
                  !companyName ||
                  !confirmationDate ||
                  !companyAuthCode ||
                  !lawful
                ) {
                  setError(
                    "Complete company details and the lawful-purpose tick.",
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
                    "Each director needs name, date of birth, and an 11-character personal code.",
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
                    registeredEmail,
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
                      registeredEmail,
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
