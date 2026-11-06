"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  SA_TAXPAYER_ROLES,
  roleLabel,
  type SaTaxpayer,
  type SaTaxpayerRole,
} from "@/lib/sa-taxpayer";
import {
  deleteSaTaxpayer,
  syncSaTaxpayersFromCompaniesHouse,
  upsertSaTaxpayer,
} from "@/server/actions/sa-taxpayers";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function SaTaxpayerManager({
  clientId,
  clientSlug,
  taxpayers,
  selectedId,
  isLimitedCompany,
  canSyncFromCh,
}: {
  clientId: string;
  clientSlug: string;
  taxpayers: SaTaxpayer[];
  selectedId: string | null;
  isLimitedCompany: boolean;
  canSyncFromCh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(taxpayers.length === 0);
  const [editing, setEditing] = useState<SaTaxpayer | null>(null);

  function hrefFor(id: string) {
    return `/clients/${clientSlug}/self-assessment?person=${encodeURIComponent(id)}`;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl text-ink">
            {isLimitedCompany
              ? "Directors & shareholders"
              : "Self Assessment taxpayer"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {isLimitedCompany
              ? "Personal SA100 returns belong to individuals — not the limited company. Add each director or shareholder with their NINO and personal UTR, then file their return."
              : "Confirm NINO and UTR, then complete the SA100 year-end return and keep personal books below."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isLimitedCompany && canSyncFromCh ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                setOk(null);
                start(async () => {
                  try {
                    const res =
                      await syncSaTaxpayersFromCompaniesHouse(clientId);
                    setOk(
                      res.added
                        ? `Added ${res.added} from Companies House (${res.total} total)`
                        : `No new officers — ${res.total} already listed`,
                    );
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Sync failed");
                  }
                });
              }}
            >
              Sync from Companies House
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary text-sm"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Add person
          </button>
        </div>
      </div>

      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-ok">{ok}</p> : null}

      {taxpayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white/80 p-6 text-sm text-ink-soft">
          No personal taxpayers yet.
          {isLimitedCompany
            ? " Sync directors from Companies House or add them manually, then enter each person’s NINO and Self Assessment UTR."
            : " Add the individual’s details to start the return."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {taxpayers.map((t) => {
            const active = t.id === selectedId;
            const ready = Boolean(t.nino.trim() && t.utr.trim());
            return (
              <li key={t.id}>
                <Link
                  href={hrefFor(t.id)}
                  className={`block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-sea/40 hover:shadow-[0_16px_36px_-24px_rgba(15,118,110,0.4)] ${
                    active
                      ? "border-sea bg-sea/5 shadow-[0_12px_28px_-22px_rgba(15,118,110,0.45)]"
                      : "border-line/80 bg-white/90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{t.fullName}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {roleLabel(t.role)}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        ready
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {ready ? "Ready" : "Need NINO/UTR"}
                    </span>
                  </div>
                  <p className="mt-3 mono text-xs text-ink-soft">
                    NINO {t.nino || "—"} · UTR {t.utr || "—"}
                  </p>
                  {t.shareholdingNote ? (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                      {t.shareholdingNote}
                    </p>
                  ) : null}
                </Link>
                <div className="mt-1.5 flex gap-2 px-1">
                  <button
                    type="button"
                    className="text-xs font-semibold text-sea hover:underline"
                    onClick={() => {
                      setEditing(t);
                      setShowForm(true);
                    }}
                  >
                    Edit
                  </button>
                  {isLimitedCompany ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-ink-soft hover:text-amber-800"
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Remove ${t.fullName} from Self Assessment?`,
                          )
                        )
                          return;
                        start(async () => {
                          try {
                            await deleteSaTaxpayer(clientId, t.id);
                            router.push(
                              `/clients/${clientSlug}/self-assessment`,
                            );
                            router.refresh();
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Delete failed",
                            );
                          }
                        });
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm ? (
        <TaxpayerForm
          clientId={clientId}
          initial={editing}
          pending={pending}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSave={(row) => {
            setShowForm(false);
            setEditing(null);
            setOk(`Saved ${row.fullName}`);
            router.push(hrefFor(row.id));
            router.refresh();
          }}
          onError={setError}
          start={start}
        />
      ) : null}
    </section>
  );
}

function TaxpayerForm({
  clientId,
  initial,
  pending,
  onCancel,
  onSave,
  onError,
  start,
}: {
  clientId: string;
  initial: SaTaxpayer | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (row: SaTaxpayer) => void;
  onError: (msg: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  return (
    <form
      className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onError(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            const row = await upsertSaTaxpayer({
              clientId,
              id: initial?.id,
              fullName: String(fd.get("fullName") || ""),
              role: String(fd.get("role") || "sole_trader") as SaTaxpayerRole,
              nino: String(fd.get("nino") || ""),
              utr: String(fd.get("utr") || ""),
              dateOfBirth: String(fd.get("dateOfBirth") || ""),
              email: String(fd.get("email") || ""),
              phone: String(fd.get("phone") || ""),
              address: String(fd.get("address") || ""),
              occupation: String(fd.get("occupation") || ""),
              tradingAs: String(fd.get("tradingAs") || ""),
              shareholdingNote: String(fd.get("shareholdingNote") || ""),
              appointedOn: initial?.appointedOn ?? null,
            });
            onSave(row);
          } catch (err) {
            onError(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <h3 className="display text-xl text-ink">
        {initial ? "Edit taxpayer" : "Add taxpayer"}
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Full name
          <input
            name="fullName"
            required
            defaultValue={initial?.fullName ?? ""}
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Role
          <select
            name="role"
            defaultValue={initial?.role ?? "sole_trader"}
            className="input mt-1.5 w-full"
          >
            {SA_TAXPAYER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          NINO
          <input
            name="nino"
            defaultValue={initial?.nino ?? ""}
            placeholder="QQ123456C"
            className="input mono mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Personal UTR
          <input
            name="utr"
            defaultValue={initial?.utr ?? ""}
            placeholder="10-digit personal UTR (not company CT)"
            className="input mono mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Date of birth
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={initial?.dateOfBirth ?? ""}
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Contact number
          <input
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Email
          <input
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          Address
          <input
            name="address"
            defaultValue={initial?.address ?? ""}
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Occupation
          <input
            name="occupation"
            defaultValue={initial?.occupation ?? ""}
            placeholder="e.g. Taxi driver, landlord"
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Trading as
          <input
            name="tradingAs"
            defaultValue={initial?.tradingAs ?? ""}
            placeholder="Sole trader business name"
            className="input mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          Shareholding / notes
          <input
            name="shareholdingNote"
            defaultValue={initial?.shareholdingNote ?? ""}
            placeholder="e.g. 50% shares · PSC"
            className="input mt-1.5 w-full"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save person"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
