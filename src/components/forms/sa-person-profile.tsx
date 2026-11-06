"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SaTaxpayer, SaTaxpayerRole } from "@/lib/sa-taxpayer";
import { roleLabel } from "@/lib/sa-taxpayer";
import { upsertSaTaxpayer } from "@/server/actions/sa-taxpayers";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

function Row({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const empty = !value?.trim();
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd
        className={`text-right font-medium ${
          empty ? "text-ink-soft" : "text-ink"
        } ${label === "NINO" || label === "Personal UTR" ? "mono" : ""}`}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}

export function SaPersonProfile({
  clientId,
  taxpayer,
  lockedRole,
}: {
  clientId: string;
  taxpayer: SaTaxpayer;
  lockedRole?: SaTaxpayerRole;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const role = lockedRole ?? taxpayer.role;

  if (!editing) {
    return (
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="display text-2xl">Identifiers</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {taxpayer.fullName} · {roleLabel(role)}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
        <dl className="mt-4 grid gap-x-8 divide-y divide-line text-sm sm:grid-cols-2 sm:divide-y-0">
          <div className="divide-y divide-line sm:pr-4">
            <Row label="NINO" value={taxpayer.nino} />
            <Row label="Personal UTR" value={taxpayer.utr} />
            <Row label="Date of birth" value={taxpayer.dateOfBirth} />
            <Row label="Phone" value={taxpayer.phone} />
          </div>
          <div className="divide-y divide-line sm:border-l sm:border-line sm:pl-4">
            <Row label="Email" value={taxpayer.email} />
            <Row label="Address" value={taxpayer.address} />
            <Row label="Occupation" value={taxpayer.occupation} />
            <Row label="Trading as" value={taxpayer.tradingAs} />
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form
      className="panel flex h-full flex-col p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            await upsertSaTaxpayer({
              clientId,
              id: taxpayer.id,
              fullName: String(fd.get("fullName") || taxpayer.fullName),
              role,
              nino: String(fd.get("nino") || ""),
              utr: String(fd.get("utr") || ""),
              dateOfBirth: String(fd.get("dateOfBirth") || ""),
              email: String(fd.get("email") || ""),
              phone: String(fd.get("phone") || ""),
              address: String(fd.get("address") || ""),
              occupation: String(fd.get("occupation") || ""),
              tradingAs: String(fd.get("tradingAs") || ""),
              appointedOn: taxpayer.appointedOn ?? null,
              shareholdingNote: taxpayer.shareholdingNote ?? "",
            });
            setEditing(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="display text-2xl">Identifiers</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-2 content-start">
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          Full name
          <input
            name="fullName"
            required
            defaultValue={taxpayer.fullName}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          NINO
          <input
            name="nino"
            defaultValue={taxpayer.nino}
            className="input mono mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Personal UTR
          <input
            name="utr"
            defaultValue={taxpayer.utr}
            className="input mono mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Date of birth
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={taxpayer.dateOfBirth}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={taxpayer.phone}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          Email
          <input
            name="email"
            type="email"
            defaultValue={taxpayer.email}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft sm:col-span-2">
          Address
          <textarea
            name="address"
            rows={2}
            defaultValue={taxpayer.address}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Occupation
          <input
            name="occupation"
            defaultValue={taxpayer.occupation ?? ""}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          Trading as
          <input
            name="tradingAs"
            defaultValue={taxpayer.tradingAs ?? ""}
            className="input mt-1 w-full text-sm"
          />
        </label>
      </div>
      <FormErrorBanner error={error} />
    </form>
  );
}
