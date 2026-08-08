"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  fileConfirmationStatement,
  prepareConfirmationStatementFiling,
} from "@/server/actions/confirmation-statement";

type DirectorRow = {
  fullName: string;
  dateOfBirth: string;
  personalCode: string;
};

const emptyDirector = (): DirectorRow => ({
  fullName: "",
  dateOfBirth: "",
  personalCode: "",
});

export function ConfirmationStatementWizard({
  defaults,
  readiness,
}: {
  defaults?: Record<string, string>;
  readiness: {
    xmlGateway: boolean;
    canAttemptLiveSubmit: boolean;
    notes: string[];
  };
}) {
  const [step, setStep] = useState(0);
  const [companyNumber, setCompanyNumber] = useState(
    defaults?.companyNumber ?? "",
  );
  const [companyName, setCompanyName] = useState("");
  const [confirmationDate, setConfirmationDate] = useState("");
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [lawful, setLawful] = useState(false);
  const [directors, setDirectors] = useState<DirectorRow[]>([emptyDirector()]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filingId, setFilingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const steps = useMemo(
    () => ["Company", "Directors & codes", "Review & file"],
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
          Direct filing
        </p>
        <h2 className="display mt-1 text-2xl text-ink">
          File confirmation statement
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Collect company auth code and each director’s personal code, then
          submit to Companies House from HydraTax.
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
          <p className="text-xs text-ink-soft">
            Not the same as a personal code. Request or reset the company auth
            code via Companies House if the client does not have it.
          </p>
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

      {step === 2 && (
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
          <p className="text-xs text-ink-soft">
            Personal codes are encrypted at rest and never shown on admin boards.
          </p>
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
        {step < 2 && (
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
                  setError("Complete company details and the lawful-purpose tick.");
                  return;
                }
              }
              if (step === 1) {
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
        {step === 2 && (
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
                    directors,
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
                      directors,
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
