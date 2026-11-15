"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  SA_TAXPAYER_ROLE_OPTIONS,
  roleLabel,
  roleNeedsCompanyLink,
  type SaTaxpayer,
  type SaTaxpayerRole,
} from "@/lib/sa-taxpayer";
import {
  deleteSaTaxpayer,
  syncSaTaxpayersFromCompaniesHouse,
  upsertSaTaxpayer,
} from "@/server/actions/sa-taxpayers";
import { deleteClient } from "@/server/actions/clients";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { AddressFields } from "@/components/forms/address-fields";
import { addressIdentityComplete } from "@/lib/address-parts";
import { OrgChTypeahead } from "@/components/forms/org-ch-typeahead";

function isPlanPeopleLimitError(message: string | null): boolean {
  if (!message) return false;
  return /plan allows|upgrade on pricing/i.test(message);
}

export function SaTaxpayerManager({
  clientId,
  clientSlug,
  taxpayers,
  selectedId,
  isLimitedCompany,
  canSyncFromCh,
  maxPeople = null,
}: {
  clientId: string;
  clientSlug: string;
  taxpayers: SaTaxpayer[];
  selectedId: string | null;
  isLimitedCompany: boolean;
  canSyncFromCh: boolean;
  /** From plan entitlements — Solo = 1. null = unlimited. */
  maxPeople?: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(taxpayers.length === 0);
  const [editing, setEditing] = useState<SaTaxpayer | null>(null);

  const atPeopleCap =
    maxPeople != null && taxpayers.length >= maxPeople && !editing;

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
              : "Confirm NINO and personal UTR, then complete the SA100 year-end return."}
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
          {atPeopleCap ? (
            <Link href="/pricing" className="btn btn-primary text-sm">
              Upgrade plan to add more people
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary text-sm"
              onClick={() => {
                setEditing(null);
                setError(null);
                setShowForm(true);
              }}
            >
              Add person
            </button>
          )}
        </div>
      </div>

      <FormErrorBanner
        error={error}
        title={
          isPlanPeopleLimitError(error) ? "Plan limit reached" : undefined
        }
      >
        {isPlanPeopleLimitError(error) ? (
          <p className="mt-2 text-sm">
            <Link
              href="/pricing"
              className="font-semibold text-sea underline hover:no-underline"
            >
              View pricing plans
            </Link>{" "}
            to upgrade and add more individuals.
          </p>
        ) : null}
      </FormErrorBanner>
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
            const ready = Boolean(
              t.nino.trim() &&
                t.utr.trim() &&
                addressIdentityComplete(t.address),
            );
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
                      {ready ? "Ready" : "Need NINO/UTR/address"}
                    </span>
                  </div>
                  <p className="mt-3 mono text-xs text-ink-soft">
                    NINO {t.nino || "—"} · UTR {t.utr || "—"}
                  </p>
                  {t.companyIncomes && t.companyIncomes.length > 0 ? (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                      {t.companyIncomes
                        .map((c) => c.companyName || c.companyNumber)
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : t.shareholdingNote ? (
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
                      setError(null);
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
          key={editing?.id ?? "new-person"}
          clientId={clientId}
          clientSlug={clientSlug}
          isLimitedCompany={isLimitedCompany}
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
          onRemoved={() => {
            setShowForm(false);
            setEditing(null);
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
  clientSlug,
  isLimitedCompany,
  initial,
  pending,
  onCancel,
  onSave,
  onRemoved,
  onError,
  start,
}: {
  clientId: string;
  clientSlug: string;
  isLimitedCompany: boolean;
  initial: SaTaxpayer | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (row: SaTaxpayer) => void;
  onRemoved: () => void;
  onError: (msg: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const router = useRouter();
  const defaultRole = (initial?.role &&
  SA_TAXPAYER_ROLE_OPTIONS.includes(
    initial.role as (typeof SA_TAXPAYER_ROLE_OPTIONS)[number],
  )
    ? initial.role
    : "sole_trader") as SaTaxpayerRole;
  const [role, setRole] = useState<SaTaxpayerRole>(defaultRole);
  const needsCompany = roleNeedsCompanyLink(role);
  const isPartner = role === "partner";

  const linkedHint = useMemo(() => {
    const first = initial?.companyIncomes?.[0];
    if (!first) return null;
    return `${first.companyName}${first.companyNumber ? ` (${first.companyNumber})` : ""}`;
  }, [initial]);

  return (
    <form
      className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onError(null);
        const fd = new FormData(e.currentTarget);
        const orgSearch = String(fd.get("orgSearch") ?? "").trim();
        const pickedNumber = String(fd.get("companyNumber") ?? "").trim();
        const fromParen = orgSearch.match(/\(([A-Z0-9]{2,8})\)\s*$/i)?.[1];
        const companyNumber = needsCompany
          ? pickedNumber || fromParen || ""
          : "";
        const companyName = needsCompany
          ? orgSearch.replace(/\s*\([A-Z0-9]+\)\s*$/i, "").trim() ||
            companyNumber
          : "";
        if (needsCompany && !companyNumber) {
          onError("Search and select the company from Companies House.");
          return;
        }
        const nino = String(fd.get("nino") || "");
        const utr = String(fd.get("utr") || "");
        const address = String(fd.get("address") || "");
        if (
          !nino.replace(/\s/g, "").trim() ||
          !utr.replace(/\s/g, "").trim() ||
          !addressIdentityComplete(address)
        ) {
          onError(
            "NINO, personal UTR, street address and postcode are required.",
          );
          return;
        }
        start(async () => {
          try {
            const row = await upsertSaTaxpayer({
              clientId,
              id: initial?.id,
              fullName: String(fd.get("fullName") || ""),
              role,
              nino,
              utr,
              dateOfBirth: String(fd.get("dateOfBirth") || ""),
              email: String(fd.get("email") || ""),
              phone: String(fd.get("phone") || ""),
              address,
              occupation: String(fd.get("occupation") || ""),
              tradingAs: isPartner
                ? String(fd.get("partnershipName") || "")
                : String(fd.get("tradingAs") || ""),
              shareholdingNote: String(fd.get("shareholdingNote") || ""),
              appointedOn: initial?.appointedOn ?? null,
              linkedCompanyNumber: companyNumber || undefined,
              linkedCompanyName: companyName || undefined,
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
            value={role}
            onChange={(e) => setRole(e.target.value as SaTaxpayerRole)}
            className="input mt-1.5 w-full"
          >
            {SA_TAXPAYER_ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>

        {needsCompany ? (
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold">
              {role === "shareholder"
                ? "Which company are you a shareholder of?"
                : role === "director_shareholder"
                  ? "Which company are you a director & shareholder of?"
                  : "Which company are you a director of?"}
            </label>
            <OrgChTypeahead
              key={`ch-${initial?.id ?? "new"}-${role}`}
              name="orgSearch"
              placeholder="Search company name or number…"
              required
              enabled
            />
            {linkedHint ? (
              <p className="mt-1 text-xs text-ink-soft">
                Currently linked: {linkedHint}
              </p>
            ) : null}
          </div>
        ) : null}

        {isPartner ? (
          <label className="block text-sm font-semibold sm:col-span-2">
            Name of partnership
            <input
              name="partnershipName"
              required
              defaultValue={initial?.tradingAs ?? ""}
              placeholder="Partnership trading name"
              className="input mt-1.5 w-full"
            />
          </label>
        ) : null}

        <label className="block text-sm font-semibold">
          NINO *
          <input
            name="nino"
            required
            defaultValue={initial?.nino ?? ""}
            placeholder="QQ123456C"
            className="input mono mt-1.5 w-full"
          />
        </label>
        <label className="block text-sm font-semibold">
          Personal UTR *
          <input
            name="utr"
            required
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
        <div className="sm:col-span-2">
          <p className="text-sm font-semibold">Address *</p>
          <div className="mt-1.5">
            <AddressFields
              name="address"
              required
              defaultValue={initial?.address}
            />
          </div>
        </div>
        <label className="block text-sm font-semibold">
          Occupation
          <input
            name="occupation"
            defaultValue={initial?.occupation ?? ""}
            placeholder="e.g. Taxi driver, landlord"
            className="input mt-1.5 w-full"
          />
        </label>
        {!isPartner ? (
          <label className="block text-sm font-semibold">
            Trading as
            <input
              name="tradingAs"
              defaultValue={initial?.tradingAs ?? ""}
              placeholder="Sole trader business name"
              className="input mt-1.5 w-full"
            />
          </label>
        ) : null}
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save person"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {initial ? (
          <button
            type="button"
            className="btn btn-ghost ml-auto text-amber-800 hover:text-amber-950"
            disabled={pending}
            onClick={() => {
              const removeWholeClient =
                !isLimitedCompany || initial.id === `client-${clientId}`;
              const label = removeWholeClient
                ? `Remove client ${initial.fullName}? This permanently deletes their desk data.`
                : `Remove ${initial.fullName} from Self Assessment?`;
              if (!confirm(label)) return;
              onError(null);
              start(async () => {
                try {
                  if (removeWholeClient) {
                    await deleteClient(clientId);
                    onRemoved();
                    router.push("/clients");
                    router.refresh();
                    return;
                  }
                  await deleteSaTaxpayer(clientId, initial.id);
                  onRemoved();
                  router.push(`/clients/${clientSlug}/self-assessment`);
                  router.refresh();
                } catch (err) {
                  onError(
                    err instanceof Error ? err.message : "Could not remove",
                  );
                }
              });
            }}
          >
            Remove client
          </button>
        ) : null}
      </div>
    </form>
  );
}
