"use client";

import { useState, useTransition } from "react";
import { saveEngagement } from "@/server/actions/desk";
import type { EngagementRecord } from "@/lib/desk-profile";

const SERVICE_OPTIONS = [
  "Bookkeeping",
  "MTD VAT",
  "Corporation Tax and accounts",
  "Self Assessment",
  "PAYE",
  "Companies House filings",
];

export function EngagementForm({
  clientId,
  clientName,
  initial,
}: {
  clientId: string;
  clientName: string;
  initial: EngagementRecord | null;
}) {
  const [status, setStatus] = useState<EngagementRecord["status"]>(
    initial?.status ?? "draft",
  );
  const [feePounds, setFeePounds] = useState(String(initial?.feePounds ?? ""));
  const [services, setServices] = useState<string[]>(
    initial?.services?.length ? initial.services : ["Bookkeeping", "MTD VAT"],
  );
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? "");
  const [signedOn, setSignedOn] = useState(initial?.signedOn ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const letter = `Engagement letter — ${clientName}

We will provide: ${services.join(", ") || "the services you confirm"}.
Our fee for this work is £${feePounds || "0"} plus VAT where applicable.

You will keep digital records and send us the papers we request through your HydraTax client link. We will prepare and, after your approval, file the returns and Companies House forms covered by this engagement.

Status: ${status}.
Issued: ${issuedOn || "not yet"}. Signed: ${signedOn || "not yet"}.`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              await saveEngagement({
                clientId,
                status,
                feePounds: Number(feePounds) || 0,
                services,
                issuedOn,
                signedOn,
              });
              setMessage("Engagement saved. Raise the fee from Invoices when you bill.");
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Could not save");
            }
          });
        }}
      >
        <label className="block text-sm font-semibold">
          Status
          <select
            className="input mt-1"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as EngagementRecord["status"])
            }
          >
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="signed">Signed</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Fee (£)
          <input
            className="input mt-1"
            inputMode="decimal"
            value={feePounds}
            onChange={(e) => setFeePounds(e.target.value)}
          />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Services</legend>
          <div className="mt-2 space-y-2">
            {SERVICE_OPTIONS.map((service) => (
              <label key={service} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={services.includes(service)}
                  onChange={(e) => {
                    setServices((prev) =>
                      e.target.checked
                        ? [...prev, service]
                        : prev.filter((s) => s !== service),
                    );
                  }}
                />
                {service}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold">
          Issued on
          <input
            className="input mt-1"
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Signed on
          <input
            className="input mt-1"
            type="date"
            value={signedOn}
            onChange={(e) => setSignedOn(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save engagement"}
        </button>
        <button
          className="btn btn-secondary ml-2"
          type="button"
          onClick={() => window.print()}
        >
          Print letter
        </button>
        {message && <p className="text-sm text-ink-soft">{message}</p>}
      </form>
      <pre className="panel whitespace-pre-wrap p-5 text-sm text-ink">
        {letter}
      </pre>
    </div>
  );
}
