"use client";

import { useState, useTransition } from "react";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChFeeBreakdown } from "@/lib/ch-services";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function ChRequestForm({
  service,
  defaults,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
}) {
  const fees = formatChFeeBreakdown(service);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="panel gloss-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const fd = new FormData(e.currentTarget);
        const fields: Record<string, string | boolean> = {};
        for (const field of service.formFields) {
          if (field.type === "checkbox" || field.type === "personal_code_ack") {
            fields[field.name] = fd.get(field.name) === "on";
          } else {
            fields[field.name] = String(fd.get(field.name) ?? "");
          }
        }
        if (defaults?.clientId) {
          fields.clientId = defaults.clientId;
        }
        startTransition(async () => {
          try {
            const res = await submitCompaniesHouseRequest({
              serviceId: service.id,
              fields,
            });
            setOk(`Request ${res.requestId.slice(0, 8)}… saved.`);
            // Start Stripe checkout for this CH plan
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
              window.location.href = data.url;
              return;
            }
            setOk(
              `Request saved. Payment not configured yet — queued for admin. ${
                data.error ?? ""
              }`,
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Submit failed");
          }
        });
      }}
    >
      <div>
        <h2 className="display text-2xl text-ink">Request this filing</h2>
        <p className="mt-1 text-sm text-ink-soft">
          You pay {fees.total} ({fees.statutory} Companies House + {fees.hydra}{" "}
          Hydra). Company authentication code is required before checkout opens.
        </p>
      </div>

      {service.formFields.map((field) => {
        if (field.type === "checkbox" || field.type === "personal_code_ack") {
          return (
            <label
              key={field.name}
              className="flex items-start gap-3 text-sm text-ink"
            >
              <input
                type="checkbox"
                name={field.name}
                className="mt-1"
                required={field.required}
              />
              <span>
                {field.label}
                {field.required ? (
                  <span className="text-danger"> *</span>
                ) : null}
              </span>
            </label>
          );
        }

        if (field.type === "textarea") {
          return (
            <label
              key={field.name}
              className="block text-sm font-semibold text-ink"
            >
              {field.label}
              {field.required ? <span className="text-danger"> *</span> : null}
              <textarea
                name={field.name}
                required={field.required}
                placeholder={field.placeholder}
                rows={3}
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
              />
              {field.help && (
                <span className="mt-1 block text-xs font-normal text-ink-soft">
                  {field.help}
                </span>
              )}
            </label>
          );
        }

        if (field.type === "select") {
          return (
            <label
              key={field.name}
              className="block text-sm font-semibold text-ink"
            >
              {field.label}
              {field.required ? <span className="text-danger"> *</span> : null}
              <select
                name={field.name}
                required={field.required}
                className="mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal"
                defaultValue=""
              >
                <option value="" disabled>
                  Select…
                </option>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        const isAuth = field.name === "companyAuthCode";
        return (
          <label
            key={field.name}
            className={`block text-sm font-semibold text-ink ${
              isAuth ? "rounded-xl border border-sea/30 bg-sea/5 p-4" : ""
            }`}
          >
            {field.label}
            {field.required ? <span className="text-danger"> *</span> : null}
            <input
              type={
                field.type === "date"
                  ? "date"
                  : field.type === "email"
                    ? "email"
                    : field.sensitive
                      ? "password"
                      : "text"
              }
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              defaultValue={defaults?.[field.name] ?? ""}
              autoComplete={field.sensitive ? "off" : undefined}
              className={`mt-1.5 w-full rounded-lg border border-line px-3 py-2 font-normal ${
                isAuth ? "mono" : ""
              }`}
            />
            {field.help && (
              <span className="mt-1 block text-xs font-normal text-ink-soft">
                {field.help}
              </span>
            )}
          </label>
        );
      })}

      <FormErrorBanner error={error} />
      {ok && <p className="text-sm text-ok">{ok}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving & opening checkout…" : `Pay ${fees.total} & submit`}
      </button>
    </form>
  );
}
