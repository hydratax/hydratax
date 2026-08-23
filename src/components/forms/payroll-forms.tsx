"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEmployee,
  createAndSubmitPayRun,
  submitEpsNoPayment,
} from "@/server/actions/payroll";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";

export function AddEmployeeForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        start(async () => {
          try {
            await addEmployee({
              clientId,
              forename: String(fd.get("forename") || ""),
              surname: String(fd.get("surname") || ""),
              nino: String(fd.get("nino") || ""),
              taxCode: String(fd.get("taxCode") || "1257L"),
              annualSalaryPounds: String(fd.get("annualSalaryPounds") || ""),
              startDate: String(fd.get("startDate") || ""),
            });
            form.reset();
            router.refresh();
          } catch (err) {
            setError(
              messageFromUnknown(
                err,
                "Could not add this employee. Check the details and try again.",
              ),
            );
          }
        });
      }}
    >
      <div>
        <label className="label">Forename</label>
        <input name="forename" className="input" required />
      </div>
      <div>
        <label className="label">Surname</label>
        <input name="surname" className="input" required />
      </div>
      <div>
        <label className="label">NINO</label>
        <input
          name="nino"
          className="input mono"
          placeholder="AB123456C"
          required
        />
      </div>
      <div>
        <label className="label">Tax code</label>
        <input name="taxCode" className="input" defaultValue="1257L" />
      </div>
      <div>
        <label className="label">Annual salary (£)</label>
        <input name="annualSalaryPounds" className="input mono" required />
      </div>
      <div>
        <label className="label">Start date</label>
        <input name="startDate" type="date" className="input" required />
      </div>
      <FormErrorBanner error={error} title="Couldn’t add employee" />
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add employee
        </button>
      </div>
    </form>
  );
}

export function PayRunForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setMessage(null);
          start(async () => {
            try {
              const run = await createAndSubmitPayRun({
                clientId,
                payDate: String(fd.get("payDate") || ""),
                periodStart: String(fd.get("periodStart") || ""),
                periodEnd: String(fd.get("periodEnd") || ""),
              });
              setMessage(`FPS submitted · ${String(run.hmrcCorrelationId)}`);
              router.refresh();
            } catch (err) {
              setError(
                messageFromUnknown(
                  err,
                  "Could not run payroll. Check the pay dates and try again.",
                ),
              );
            }
          });
        }}
      >
        <div>
          <label className="label">Pay date</label>
          <input
            name="payDate"
            type="date"
            className="input"
            defaultValue="2026-03-28"
            required
          />
        </div>
        <div>
          <label className="label">Period start</label>
          <input
            name="periodStart"
            type="date"
            className="input"
            defaultValue="2026-03-01"
            required
          />
        </div>
        <div>
          <label className="label">Period end</label>
          <input
            name="periodEnd"
            type="date"
            className="input"
            defaultValue="2026-03-31"
            required
          />
        </div>
        <FormErrorBanner error={error} title="Couldn’t run payroll" />
        {message ? (
          <p className="text-sm font-semibold text-ok sm:col-span-3">{message}</p>
        ) : null}
        <div className="sm:col-span-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Running…" : "Run payroll & submit FPS"}
          </button>
        </div>
      </form>

      <button
        type="button"
        className="btn btn-secondary text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const res = await submitEpsNoPayment(clientId, "25-26");
              setMessage(`EPS submitted · ${res.correlationId}`);
              router.refresh();
            } catch (err) {
              setError(
                messageFromUnknown(err, "Could not submit EPS. Please try again."),
              );
            }
          })
        }
      >
        Submit EPS (no payment)
      </button>
    </div>
  );
}
