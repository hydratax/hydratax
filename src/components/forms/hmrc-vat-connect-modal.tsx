"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useEffect, useState, useTransition } from "react";
import { saveVatHmrcConnectDetails } from "@/server/actions/vat";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const ARN_STORAGE_KEY = "hydratax_hmrc_agent_arn";

type FilingAs = "business" | "agent";

export function HmrcVatConnectModal({
  open,
  onClose,
  clientId,
  initialVrn,
  initialVatRegistrationDate,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initialVrn?: string | null;
  initialVatRegistrationDate?: string | null;
  signedIn: boolean;
}) {
  const [filingAs, setFilingAs] = useState<FilingAs>("business");
  const [vrn, setVrn] = useState(initialVrn?.replace(/\D/g, "").slice(0, 9) ?? "");
  const [arn, setArn] = useState("");
  const [vatRegDate, setVatRegDate] = useState(
    initialVatRegistrationDate?.slice(0, 10) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setVrn(initialVrn?.replace(/\D/g, "").slice(0, 9) ?? "");
    setVatRegDate(initialVatRegistrationDate?.slice(0, 10) ?? "");
    setError(null);
    try {
      setArn(localStorage.getItem(ARN_STORAGE_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, [open, initialVrn, initialVatRegistrationDate, clientId]);

  if (!open) return null;

  const agentBlocked = filingAs === "agent" && !signedIn;
  const canSubmit =
    vrn.length === 9 && /^\d{4}-\d{2}-\d{2}$/.test(vatRegDate) && !agentBlocked;

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
            if (agentBlocked || !canSubmit) return;
            start(async () => {
              try {
                const res = await saveVatHmrcConnectDetails({
                  clientId,
                  filingAs,
                  vrn,
                  agentArn: filingAs === "agent" ? arn : undefined,
                  vatRegistrationDate: vatRegDate,
                });
                try {
                  if (filingAs === "agent") {
                    localStorage.setItem(ARN_STORAGE_KEY, arn.trim());
                  }
                } catch {
                  /* ignore */
                }
                window.location.href = res.authorizeUrl;
              } catch {
                // Desk UI: freeze — FormErrorBanner is silent on desk surface.
                setError("connect_failed");
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

          <div>
            <label className="label" htmlFor="hmrc-vat-reg">
              VAT registration date
            </label>
            <UkDateField
              id="hmrc-vat-reg"
              className="input mt-1.5"
              value={vatRegDate}
              onChange={(iso) => setVatRegDate(iso)}
              required
            />
          </div>

          {filingAs === "agent" && (
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
            </div>
          )}

          <FormErrorBanner error={error} />

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={pending || !canSubmit}
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
