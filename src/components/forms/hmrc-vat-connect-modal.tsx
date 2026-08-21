"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { saveVatHmrcConnectDetails } from "@/server/actions/vat";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const ARN_STORAGE_KEY = "hydratax_hmrc_agent_arn";
const REG_DATE_PREFIX = "hydratax_vat_reg_date_";

type FilingAs = "business" | "agent";

export function HmrcVatConnectModal({
  open,
  onClose,
  clientId,
  initialVrn,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initialVrn?: string | null;
  signedIn: boolean;
}) {
  const [filingAs, setFilingAs] = useState<FilingAs>("business");
  const [vrn, setVrn] = useState(initialVrn?.replace(/\D/g, "").slice(0, 9) ?? "");
  const [arn, setArn] = useState("");
  const [vatRegDate, setVatRegDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setVrn(initialVrn?.replace(/\D/g, "").slice(0, 9) ?? "");
    setError(null);
    try {
      setArn(localStorage.getItem(ARN_STORAGE_KEY) ?? "");
      setVatRegDate(
        localStorage.getItem(`${REG_DATE_PREFIX}${clientId}`) ?? "",
      );
    } catch {
      /* ignore */
    }
  }, [open, initialVrn, clientId]);

  if (!open) return null;

  const agentBlocked = filingAs === "agent" && !signedIn;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect to HMRC"
        className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="display text-2xl text-ink">Connect to HMRC</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xl leading-none text-ink-soft hover:bg-sand hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (agentBlocked) {
              setError("You must be signed in to file as an agent.");
              return;
            }
            start(async () => {
              try {
                const res = await saveVatHmrcConnectDetails({
                  clientId,
                  filingAs,
                  vrn,
                  agentArn: filingAs === "agent" ? arn : undefined,
                  vatRegistrationDate:
                    filingAs === "agent" ? vatRegDate : undefined,
                });
                try {
                  if (filingAs === "agent") {
                    localStorage.setItem(ARN_STORAGE_KEY, arn.trim());
                    localStorage.setItem(
                      `${REG_DATE_PREFIX}${clientId}`,
                      vatRegDate,
                    );
                  }
                } catch {
                  /* ignore */
                }
                window.location.href = res.authorizeUrl;
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not connect",
                );
              }
            });
          }}
        >
          <fieldset>
            <legend className="label mb-2">Filing as</legend>
            <div className="flex flex-wrap gap-5">
              {(
                [
                  { id: "business" as const, label: "My own business" },
                  { id: "agent" as const, label: "Tax agent" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink"
                >
                  <input
                    type="radio"
                    name="filingAs"
                    className="size-4 accent-[var(--sea)]"
                    checked={filingAs === opt.id}
                    onChange={() => {
                      setFilingAs(opt.id);
                      setError(null);
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="hmrc-vrn">
              VAT Number
            </label>
            <input
              id="hmrc-vrn"
              className="input mt-1.5 mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="9-digit VRN"
              value={vrn}
              onChange={(e) =>
                setVrn(e.target.value.replace(/\D/g, "").slice(0, 9))
              }
              required
            />
          </div>

          {filingAs === "agent" && (
            <>
              <div>
                <label className="label" htmlFor="hmrc-arn">
                  Your ARN
                </label>
                <input
                  id="hmrc-arn"
                  className="input mt-1.5 mono"
                  placeholder="TARN0000000"
                  value={arn}
                  onChange={(e) => setArn(e.target.value)}
                  required
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  Your Agent Reference Number from your HMRC Agent Services
                  Account. We store this so you won&apos;t need to enter it
                  again.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="hmrc-vat-reg">
                  VAT registration date
                </label>
                <input
                  id="hmrc-vat-reg"
                  type="date"
                  className="input mt-1.5"
                  value={vatRegDate}
                  onChange={(e) => setVatRegDate(e.target.value)}
                  required
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  HMRC&apos;s one-time anti-fraud check on this client. We store
                  this and won&apos;t ask again — return submissions don&apos;t
                  need it.
                </p>
              </div>
            </>
          )}

          {(error || agentBlocked) && (
            <FormErrorBanner
              error={error ?? "You must be signed in to file as an agent."}
              title="HMRC connection blocked"
            >
              {agentBlocked ? (
                <p className="form-error-banner__body mt-2">
                  <Link
                    href={`/sign-in?next=${encodeURIComponent(`/clients/${clientId}/vat`)}`}
                    className="font-semibold underline"
                  >
                    Sign in
                  </Link>{" "}
                  to continue as an agent.
                </p>
              ) : null}
            </FormErrorBanner>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending || agentBlocked}
          >
            {pending
              ? "Connecting…"
              : filingAs === "agent"
                ? "Submit to HMRC as agent →"
                : "Submit to HMRC →"}
          </button>
        </form>
      </div>
    </div>
  );
}
