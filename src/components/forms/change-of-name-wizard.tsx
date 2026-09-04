"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChServicePrice } from "@/lib/ch-services";
import { ensureLtdSuffix } from "@/lib/ch-name-availability";
import { useChCompanyLookup } from "@/hooks/use-ch-company-lookup";
import { useChNameAvailability } from "@/hooks/use-ch-name-availability";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import {
  ChAuthCodeField,
  ChCompanySearchStep,
  ChCompanySummaryCard,
  ChWizardShell,
  ChWizardStepNav,
} from "@/components/forms/ch-wizard-shell";

const STEPS = [
  { id: "search", label: "Find company" },
  { id: "name", label: "New name" },
  { id: "pay", label: "Confirm & pay" },
] as const;

type Phase = (typeof STEPS)[number]["id"];

export function ChangeOfNameWizard({
  service,
  defaults,
  sameDay = false,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
  sameDay?: boolean;
}) {
  const price = formatChServicePrice(service);
  const presetCompany = defaults?.companyNumber?.trim().toUpperCase() ?? "";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const lookup = useChCompanyLookup(presetCompany || undefined);
  const [phase, setPhase] = useState<Phase>(presetCompany ? "name" : "search");
  const [newName, setNewName] = useState("");
  const [resolutionAck, setResolutionAck] = useState(false);
  const [cutOffAck, setCutOffAck] = useState(false);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [pending, start] = useTransition();

  const nameCheck = useChNameAvailability(newName, {
    excludeCompanyNumber: lookup.company?.companyNumber,
  });

  const stepIndex = STEPS.findIndex((s) => s.id === phase);

  const canProceedToPay = useMemo(() => {
    if (!lookup.company || !newName.trim()) return false;
    if (nameCheck.status === "taken" || nameCheck.status === "checking") {
      return false;
    }
    if (!resolutionAck) return false;
    if (sameDay && !cutOffAck) return false;
    return true;
  }, [
    lookup.company,
    newName,
    nameCheck.status,
    resolutionAck,
    sameDay,
    cutOffAck,
  ]);

  function pay() {
    if (!lookup.company) return;
    lookup.setError(null);
    if (!companyAuthCode.trim()) {
      lookup.setError("Enter the company authentication code.");
      return;
    }
    if (!canProceedToPay) {
      lookup.setError("Complete the new name and confirmations first.");
      return;
    }

    start(async () => {
      try {
        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          returnPath,
          fields: {
            companyNumber: lookup.company!.companyNumber,
            companyName: lookup.company!.companyName,
            currentName: lookup.company!.companyName,
            newName: ensureLtdSuffix(newName.trim()),
            companyAuthCode: companyAuthCode.trim(),
            resolutionAck: true,
            ...(sameDay ? { cutOffAck: true } : {}),
            ...(defaults?.clientId ? { clientId: defaults.clientId } : {}),
          },
        });
        if (!res.ok) {
          lookup.setError(res.error);
          return;
        }
        const checkout = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: res.checkoutPlanKey }),
        });
        const data = (await checkout.json()) as { url?: string; error?: string };
        if (checkout.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        lookup.setError(
          data.error ??
            "Request saved, but checkout is not configured yet. Contact support.",
        );
      } catch (err) {
        lookup.setError(err instanceof Error ? err.message : "Checkout failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          {sameDay ? "Same-day name change" : "Change of company name"}
        </p>
        <h1 className="display mt-2 text-3xl text-ink">{service.title}</h1>
      </div>

      <ChWizardStepNav steps={[...STEPS]} currentIndex={stepIndex} />

      {phase === "search" && (
        <div className="panel gloss-card space-y-4 p-5">
          <h2 className="display text-xl text-ink">Find your company</h2>
          <ChCompanySearchStep
            searchQuery={lookup.searchQuery}
            onSearchQueryChange={lookup.setSearchQuery}
            searchHits={lookup.searchHits}
            lookupPending={lookup.lookupPending}
            onSelectCompany={(n) => void lookup.loadCompany(n)}
            onSearch={() => void lookup.searchByName(lookup.searchQuery.trim())}
          />
          {lookup.company && (
            <>
              <ChCompanySummaryCard company={lookup.company} />
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => setPhase("name")}
              >
                Continue to new name
              </button>
            </>
          )}
        </div>
      )}

      {phase === "name" && lookup.company && (
        <div className="panel gloss-card space-y-4 p-5">
          <ChCompanySummaryCard company={lookup.company} />
          <label className="label">
            Proposed new company name
            <input
              className="input mt-1.5"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Example Trading Ltd"
              required
            />
          </label>
          {nameCheck.message && (
            <p
              className={`text-sm ${
                nameCheck.status === "taken" || nameCheck.status === "error"
                  ? "text-danger"
                  : nameCheck.status === "available"
                    ? "text-ok"
                    : "text-ink-soft"
              }`}
            >
              {nameCheck.status === "checking"
                ? "Checking Companies House register…"
                : nameCheck.message}
            </p>
          )}
          {nameCheck.status === "available" && nameCheck.similar.length > 0 && (
            <div className="rounded-lg border border-line bg-sand/30 px-3 py-2 text-xs text-ink-soft">
              <p className="font-semibold text-ink">
                {nameCheck.similar.length} similar name
                {nameCheck.similar.length === 1 ? "" : "s"} on the register
              </p>
              <ul className="mt-1 space-y-1">
                {nameCheck.similar.slice(0, 5).map((hit) => (
                  <li key={hit.company_number}>
                    {hit.title}{" "}
                    <span className="mono">({hit.company_number})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={resolutionAck}
              onChange={(e) => setResolutionAck(e.target.checked)}
              className="mt-1"
            />
            <span>
              I confirm the company has passed a special resolution (or has
              authority under its articles) to change its name.
            </span>
          </label>
          {sameDay && (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={cutOffAck}
                onChange={(e) => setCutOffAck(e.target.checked)}
                className="mt-1"
              />
              <span>
                I understand same-day service depends on Companies House
                cut-off times.
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPhase("search")}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={!canProceedToPay}
              onClick={() => setPhase("pay")}
            >
              Review & pay
            </button>
          </div>
        </div>
      )}

      {phase === "pay" && lookup.company && (
        <ChWizardShell
          returnPath={returnPath}
          price={price}
          error={lookup.error}
          pending={pending}
          onPay={pay}
          payDisabled={!companyAuthCode.trim()}
          footer={
            <>
              <ChCompanySummaryCard company={lookup.company} />
              <div className="rounded-xl border border-line bg-white p-4 text-sm">
                <p className="text-ink-soft">Current name</p>
                <p className="font-semibold text-ink">{lookup.company.companyName}</p>
                <p className="mt-3 text-ink-soft">Proposed new name</p>
                <p className="font-semibold text-ink">
                  {ensureLtdSuffix(newName.trim())}
                </p>
              </div>
              <ChAuthCodeField
                value={companyAuthCode}
                onChange={setCompanyAuthCode}
              />
            </>
          }
        >
          <h2 className="display text-xl text-ink">Confirm & pay</h2>
          <p className="text-sm text-ink-soft">
            We file NM01 with Companies House after payment.
          </p>
        </ChWizardShell>
      )}
    </div>
  );
}
