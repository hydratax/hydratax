"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ChServiceDetail } from "@/lib/ch-services";
import { formatChServicePrice } from "@/lib/ch-services";
import {
  emptyAddress,
  splitFullName,
  stringifyAddress,
  validateStructuredAddress,
} from "@/lib/ch-wizard-shared";
import { useChCompanyLookup } from "@/hooks/use-ch-company-lookup";
import { submitCompaniesHouseRequest } from "@/server/actions/ch-requests";
import { ChAddressFields } from "@/components/forms/ch-address-fields";
import {
  ChAuthCodeField,
  ChCompanySearchStep,
  ChCompanySummaryCard,
  ChWizardShell,
  ChWizardStepNav,
} from "@/components/forms/ch-wizard-shell";

const STEPS = [
  { id: "search", label: "Find company" },
  { id: "allotment", label: "Allotment" },
  { id: "pay", label: "Confirm & pay" },
] as const;

type Phase = (typeof STEPS)[number]["id"];

export function ShareAllotmentWizard({
  service,
  defaults,
}: {
  service: ChServiceDetail;
  defaults?: Record<string, string>;
}) {
  const price = formatChServicePrice(service);
  const presetCompany = defaults?.companyNumber?.trim().toUpperCase() ?? "";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const lookup = useChCompanyLookup(presetCompany || undefined);
  const [phase, setPhase] = useState<Phase>(
    presetCompany ? "allotment" : "search",
  );
  const [allotmentDate, setAllotmentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [shareClass, setShareClass] = useState("Ordinary");
  const [numShares, setNumShares] = useState("");
  const [nominalValue, setNominalValue] = useState("1.00");
  const [amountPaid, setAmountPaid] = useState("1.00");
  const [amountUnpaid, setAmountUnpaid] = useState("0.00");
  const [allotteeName, setAllotteeName] = useState("");
  const [allotteeAddress, setAllotteeAddress] = useState(emptyAddress());
  const [consideration, setConsideration] = useState("");
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [pending, start] = useTransition();

  const stepIndex = STEPS.findIndex((s) => s.id === phase);

  const detailsReady = useMemo(() => {
    const shares = Number(numShares);
    const nominal = Number(nominalValue);
    const addrErr = validateStructuredAddress(allotteeAddress, "Allottee address");
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(allotmentDate) &&
      shareClass.trim().length > 0 &&
      Number.isFinite(shares) &&
      shares > 0 &&
      Number.isFinite(nominal) &&
      nominal > 0 &&
      allotteeName.trim().length > 1 &&
      !addrErr
    );
  }, [
    allotmentDate,
    shareClass,
    numShares,
    nominalValue,
    allotteeName,
    allotteeAddress,
  ]);

  function pay() {
    if (!lookup.company) return;
    lookup.setError(null);
    if (!companyAuthCode.trim()) {
      lookup.setError("Enter the company authentication code.");
      return;
    }
    if (!detailsReady) {
      lookup.setError("Complete all allotment details first.");
      return;
    }

    const { forename, surname } = splitFullName(allotteeName);

    start(async () => {
      try {
        const res = await submitCompaniesHouseRequest({
          serviceId: service.id,
          returnPath,
          fields: {
            companyNumber: lookup.company!.companyNumber,
            companyName: lookup.company!.companyName,
            companyAuthCode: companyAuthCode.trim(),
            allotmentDate,
            shareClass: shareClass.trim(),
            numShares: String(Number(numShares)),
            nominalValue,
            amountPaid,
            amountUnpaid,
            allotteeForename: forename,
            allotteeSurname: surname,
            allotteeAddress: stringifyAddress(allotteeAddress),
            consideration: consideration.trim(),
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
        lookup.setError(data.error ?? "Checkout is not configured yet.");
      } catch (err) {
        lookup.setError(err instanceof Error ? err.message : "Checkout failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
          SH01 · Return of allotment of shares
        </p>
        <h1 className="display mt-2 text-3xl text-ink">{service.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{service.summary}</p>
      </div>

      <ChWizardStepNav steps={[...STEPS]} currentIndex={stepIndex} />

      {phase === "search" && (
        <div className="panel gloss-card space-y-4 p-5">
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
                onClick={() => setPhase("allotment")}
              >
                Continue
              </button>
            </>
          )}
        </div>
      )}

      {phase === "allotment" && lookup.company && (
        <div className="panel gloss-card space-y-4 p-5">
          <ChCompanySummaryCard company={lookup.company} />
          <label className="label">
            Allotment date
            <input
              type="date"
              className="input mt-1.5"
              value={allotmentDate}
              onChange={(e) => setAllotmentDate(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              Share class
              <input
                className="input mt-1.5"
                value={shareClass}
                onChange={(e) => setShareClass(e.target.value)}
              />
            </label>
            <label className="label">
              Number of shares allotted
              <input
                type="number"
                min={1}
                className="input mt-1.5"
                value={numShares}
                onChange={(e) => setNumShares(e.target.value)}
              />
            </label>
            <label className="label">
              Nominal value per share (£)
              <input
                className="input mt-1.5"
                value={nominalValue}
                onChange={(e) => setNominalValue(e.target.value)}
              />
            </label>
            <label className="label">
              Amount paid per share (£)
              <input
                className="input mt-1.5"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </label>
            <label className="label">
              Amount unpaid per share (£)
              <input
                className="input mt-1.5"
                value={amountUnpaid}
                onChange={(e) => setAmountUnpaid(e.target.value)}
              />
            </label>
          </div>
          <label className="label">
            Allottee full name
            <input
              className="input mt-1.5"
              value={allotteeName}
              onChange={(e) => setAllotteeName(e.target.value)}
              placeholder="Jane Smith"
            />
          </label>
          <div>
            <p className="label mb-2">Allottee address</p>
            <ChAddressFields
              idPrefix="allottee"
              value={allotteeAddress}
              onChange={setAllotteeAddress}
            />
          </div>
          <label className="label">
            Consideration (optional)
            <textarea
              className="input mt-1.5"
              rows={2}
              value={consideration}
              onChange={(e) => setConsideration(e.target.value)}
              placeholder="Cash, non-cash, or other consideration"
            />
          </label>
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
              disabled={!detailsReady}
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
                <p className="font-semibold text-ink">
                  {numShares} {shareClass} share
                  {Number(numShares) === 1 ? "" : "s"} → {allotteeName}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Allotment date: {allotmentDate}
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
        </ChWizardShell>
      )}
    </div>
  );
}
