"use client";

import { UkDateField } from "@/components/forms/uk-date-field";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BankLedger, LivePlSummary } from "@/lib/bank-ledger";
import {
  CREDITOR_BUCKET_LABELS,
  DEBTOR_BUCKET_LABELS,
  assetClosingNbvPence,
  creditorClosingPence,
  debtorClosingPence,
  depreciationChargePence,
  loanClosingPence,
  mortgageInterestDueFromRatePence,
  mortgageInterestPaidPence,
  type CreditorBucket,
  type DebtorBucket,
} from "@/lib/bank-ledger";
import {
  bringForwardBankLedger,
  deleteBankAsset,
  deleteBankCreditor,
  deleteBankDebtor,
  deleteBankLoan,
  deleteBankProperty,
  getLivePlFromBank,
  pullPriorYearIntoBankDesk,
  setBankLedgerPeriod,
  setCapitalAllowances,
  setUnpaidShareCapital,
  snapshotBankLedgerClosing,
  upsertBankAsset,
  upsertBankCreditor,
  upsertBankDebtor,
  upsertBankLoan,
  upsertBankProperty,
} from "@/server/actions/bank-ledger";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { AddressFields } from "@/components/forms/address-fields";
import { addressPartsDisplay } from "@/lib/address-parts";
import { messageFromUnknown } from "@/lib/action-error";

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function poundsInputToPence(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type TxLine = {
  id: string;
  description: string;
  category: string;
  amountPence: number;
  dated: string;
};

export function BankYearEndDesk({
  clientId,
  clientSlug,
  initialLedger,
  initialPl,
  periodStart: initialStart,
  periodEnd: initialEnd,
  transactions,
}: {
  clientId: string;
  clientSlug: string;
  initialLedger: BankLedger;
  initialPl: LivePlSummary;
  periodStart: string;
  periodEnd: string;
  transactions: TxLine[];
}) {
  const router = useRouter();
  const [ledger, setLedger] = useState(initialLedger);
  const [pl, setPl] = useState(initialPl);
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);
  const [tab, setTab] = useState<
    "pl" | "loans" | "assets" | "properties" | "parties"
  >("pl");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const bankLines = useMemo(
    () =>
      transactions.map((t) => ({
        id: t.id,
        description: t.description,
        category: t.category,
        amountPence: t.amountPence,
        dated: t.dated,
      })),
    [transactions],
  );

  function refreshPl() {
    start(async () => {
      try {
        const res = await getLivePlFromBank(clientId);
        setLedger(res.ledger);
        setPl(res.pl);
        setPeriodStart(res.periodStart);
        setPeriodEnd(res.periodEnd);
        router.refresh();
      } catch (e) {
        setErr(messageFromUnknown(e, "Could not refresh P&L"));
      }
    });
  }

  function savePeriod() {
    setErr(null);
    start(async () => {
      try {
        const next = await setBankLedgerPeriod({
          clientId,
          periodStart,
          periodEnd,
        });
        setLedger(next);
        setMsg("Accounting period saved.");
        refreshPl();
      } catch (e) {
        setErr(messageFromUnknown(e, "Could not save period"));
      }
    });
  }

  return (
    <div className="panel space-y-5 border-sea/25 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
            Year-end from bank
          </p>
          <h3 className="display mt-1 text-2xl text-ink">
            Complete year-end accounts from bank
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Allocate bank lines, reconcile debtors and creditors, add assets and
            loans, then open the full Digitus-style pack (P&amp;L, balance sheet,
            trial balance, accountant&apos;s report, Notes 1–3).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => {
              setErr(null);
              setMsg(null);
              start(async () => {
                try {
                  const prior = await pullPriorYearIntoBankDesk(clientId);
                  setMsg(
                    prior.source === "none"
                      ? "No prior-year figures found yet."
                      : `Prior year loaded from ${prior.source}${prior.madeUpTo ? ` (${prior.madeUpTo})` : ""}.`,
                  );
                  refreshPl();
                } catch (e) {
                  setErr(messageFromUnknown(e, "Prior year pull failed"));
                }
              });
            }}
          >
            Pull prior year figures
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => {
              setErr(null);
              setMsg(null);
              start(async () => {
                try {
                  const res = await bringForwardBankLedger(clientId);
                  if (!res.ok) {
                    setErr(res.error);
                    return;
                  }
                  setLedger(res.ledger);
                  setMsg("Brought forward loans, assets and mortgages.");
                  refreshPl();
                } catch (e) {
                  setErr(messageFromUnknown(e, "Bring forward failed"));
                }
              });
            }}
          >
            Bring forward last year
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => {
              setErr(null);
              setMsg(null);
              start(async () => {
                try {
                  const res = await snapshotBankLedgerClosing(clientId);
                  setLedger(res.ledger);
                  setMsg("Closing snapshot saved for next year.");
                } catch (e) {
                  setErr(messageFromUnknown(e, "Snapshot failed"));
                }
              });
            }}
          >
            Snapshot closings
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending}
            onClick={refreshPl}
          >
            Refresh live P&amp;L
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-sand/30 p-3">
        <label className="label text-xs">
          Period start
          <UkDateField className="input mt-1" value={periodStart} onChange={(iso) => setPeriodStart(iso)}
          />
        </label>
        <label className="label text-xs">
          Period end
          <UkDateField className="input mt-1" value={periodEnd} onChange={(iso) => setPeriodEnd(iso)}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={pending}
          onClick={savePeriod}
        >
          Save period
        </button>
        <Link
          href={`/clients/${clientSlug}/accounts-pack?start=${periodStart}&end=${periodEnd}`}
          className="btn btn-secondary text-sm"
        >
          Open accounts desk →
        </Link>
        <Link
          href={`/clients/${clientSlug}/accounts-pack?start=${periodStart}&end=${periodEnd}`}
          className="btn btn-secondary text-sm"
        >
          Email accounts →
        </Link>
        <Link
          href={`/clients/${clientSlug}/accounts-pack/print?start=${periodStart}&end=${periodEnd}`}
          className="btn btn-primary text-sm"
          target="_blank"
        >
          Preview full accounts PDF →
        </Link>
      </div>

      <FormErrorBanner error={err} />
      {msg ? (
        <p className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm text-ink">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {(
          [
            ["pl", "Live P&L"],
            ["parties", "Debtors & creditors"],
            ["loans", "Loan accounts"],
            ["assets", "Assets & capital allowances"],
            ["properties", "Properties & mortgages"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === id
                ? "bg-sea text-white"
                : "bg-sand text-ink-soft hover:bg-sand/80"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pl" ? (
        <LivePlPanel pl={pl} periodStart={periodStart} periodEnd={periodEnd} />
      ) : null}
      {tab === "parties" ? (
        <PartiesPanel
          clientId={clientId}
          ledger={ledger}
          bankLines={bankLines}
          periodStart={periodStart}
          periodEnd={periodEnd}
          pending={pending}
          onSaved={(next) => {
            setLedger(next);
            refreshPl();
          }}
          onError={setErr}
          start={start}
        />
      ) : null}
      {tab === "loans" ? (
        <LoansPanel
          clientId={clientId}
          ledger={ledger}
          bankLines={bankLines}
          periodStart={periodStart}
          periodEnd={periodEnd}
          pending={pending}
          onSaved={(next) => {
            setLedger(next);
            refreshPl();
          }}
          onError={setErr}
          start={start}
        />
      ) : null}
      {tab === "assets" ? (
        <AssetsPanel
          clientId={clientId}
          ledger={ledger}
          periodStart={periodStart}
          periodEnd={periodEnd}
          pending={pending}
          onSaved={(next) => {
            setLedger(next);
            refreshPl();
          }}
          onError={setErr}
          start={start}
        />
      ) : null}
      {tab === "properties" ? (
        <PropertiesPanel
          clientId={clientId}
          ledger={ledger}
          bankLines={bankLines}
          periodStart={periodStart}
          periodEnd={periodEnd}
          pending={pending}
          onSaved={(next) => {
            setLedger(next);
            refreshPl();
          }}
          onError={setErr}
          start={start}
        />
      ) : null}
    </div>
  );
}

function LivePlPanel({
  pl,
  periodStart,
  periodEnd,
}: {
  pl: LivePlSummary;
  periodStart: string;
  periodEnd: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-xs font-bold uppercase text-ink-soft">
          Profit &amp; loss · {periodStart} → {periodEnd}
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Turnover" value={gbp(pl.turnoverPence)} />
          <Row label="Cost of sales" value={gbp(pl.costOfSalesPence)} />
          <Row
            label="Gross profit"
            value={gbp(pl.grossProfitPence)}
            strong
          />
          <Row label="Admin / other expenses" value={gbp(pl.expensesPence)} />
          <Row label="Depreciation (incl. assets)" value={gbp(pl.depreciationPence)} />
          <Row label="Finance costs (bank)" value={gbp(pl.financeCostsPence)} />
          <Row
            label="Mortgage interest paid (bank)"
            value={gbp(pl.mortgageInterestPaidPence)}
          />
          <Row
            label="Mortgage interest due (accrual)"
            value={gbp(pl.mortgageInterestDuePence)}
          />
          <Row
            label="Profit before tax"
            value={gbp(pl.profitBeforeTaxPence)}
            strong
          />
        </dl>
        <p className="mt-3 text-xs text-ink-soft">
          {pl.lineCount} bank lines
          {pl.uncategorisedCount
            ? ` · ${pl.uncategorisedCount} still need a category`
            : ""}
          .
        </p>
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-xs font-bold uppercase text-ink-soft">
          Balance sheet draft (from ledger)
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Tangible assets (NBV)" value={gbp(pl.fixedAssetsNbvPence)} />
          <Row label="Properties (cost)" value={gbp(pl.propertyCostPence)} />
          <Row label="Loans closing" value={gbp(pl.loansClosingPence)} />
          <Row
            label="Mortgages closing"
            value={gbp(pl.mortgagesClosingPence)}
          />
        </dl>
        <p className="mt-3 text-xs text-ink-soft">
          Interest due vs paid: use the Properties tab so accrual and bank cash
          stay visible separately.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? "border-t border-line pt-2 font-semibold" : ""}`}
    >
      <dt className="text-ink-soft">{label}</dt>
      <dd className="figures text-ink">{value}</dd>
    </div>
  );
}

function LoansPanel({
  clientId,
  ledger,
  bankLines,
  periodStart,
  periodEnd,
  pending,
  onSaved,
  onError,
  start,
}: {
  clientId: string;
  ledger: BankLedger;
  bankLines: TxLine[];
  periodStart: string;
  periodEnd: string;
  pending: boolean;
  onSaved: (l: BankLedger) => void;
  onError: (e: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"director" | "bank" | "hp" | "other">(
    "director",
  );
  const [bf, setBf] = useState("0.00");
  const [secondEntry, setSecondEntry] = useState("Dr Bank / Cr Loan");

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Accubee: loan accounts feed creditors on the accounts draft. Second
        entry is required (double-entry).
      </p>
      <form
        className="overflow-x-auto rounded-xl border border-line"
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          if (!secondEntry.trim()) {
            onError("Accubee: enter the second entry for this loan.");
            return;
          }
          start(async () => {
            try {
              const next = await upsertBankLoan({
                clientId,
                name,
                kind,
                broughtForwardPence: poundsInputToPence(bf),
                secondEntry: secondEntry.trim(),
              });
              onSaved(next);
              setName("");
              setBf("0.00");
              setSecondEntry("Dr Bank / Cr Loan");
            } catch (err) {
              onError(messageFromUnknown(err, "Could not save loan"));
            }
          });
        }}
      >
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Loan account</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold text-right">BF £</th>
              <th className="px-3 py-2 font-semibold">2nd entry</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line bg-white">
              <td className="px-2 py-2">
                <input
                  className="input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Director’s loan / Bounce Back / HP"
                  required
                />
              </td>
              <td className="px-2 py-2">
                <select
                  className="input w-full"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="director">Director</option>
                  <option value="bank">Bank loan</option>
                  <option value="hp">Hire purchase</option>
                  <option value="other">Other</option>
                </select>
              </td>
              <td className="px-2 py-2">
                <input
                  className="input figures w-full text-right"
                  value={bf}
                  onChange={(e) => setBf(e.target.value)}
                />
              </td>
              <td className="px-2 py-2">
                <input
                  className="input w-full"
                  value={secondEntry}
                  onChange={(e) => setSecondEntry(e.target.value)}
                  required
                  placeholder="Dr Bank / Cr Loan"
                />
              </td>
              <td className="px-2 py-2">
                <button
                  type="submit"
                  className="btn btn-primary text-xs whitespace-nowrap"
                  disabled={pending || !name.trim()}
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead className="bg-sand/40 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2">Loan</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">BF</th>
              <th className="px-3 py-2 text-right">Closing (est.)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ledger.loans.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-ink-soft"
                >
                  No loan accounts yet. Bring forward last year or add a row
                  above.
                </td>
              </tr>
            ) : (
              ledger.loans.map((loan) => {
                const closing = loanClosingPence(
                  loan,
                  bankLines,
                  periodStart,
                  periodEnd,
                );
                return (
                  <tr key={loan.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink">{loan.name}</p>
                      {loan.notes ? (
                        <p className="text-xs text-ink-soft">{loan.notes}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 capitalize text-ink-soft">
                      {loan.kind}
                    </td>
                    <td className="figures px-3 py-2 text-right">
                      {gbp(loan.broughtForwardPence)}
                    </td>
                    <td className="figures px-3 py-2 text-right font-semibold">
                      {gbp(closing)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            try {
                              const next = await deleteBankLoan(
                                clientId,
                                loan.id,
                              );
                              onSaved(next);
                            } catch (err) {
                              onError(
                                messageFromUnknown(err, "Delete failed"),
                              );
                            }
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetsPanel({
  clientId,
  ledger,
  periodStart,
  periodEnd,
  pending,
  onSaved,
  onError,
  start,
}: {
  clientId: string;
  ledger: BankLedger;
  periodStart: string;
  periodEnd: string;
  pending: boolean;
  onSaved: (l: BankLedger) => void;
  onError: (e: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [klass, setKlass] = useState<"vehicle" | "plant" | "fixtures" | "other">(
    "vehicle",
  );
  const [acquiredOn, setAcquiredOn] = useState(periodStart);
  const [cost, setCost] = useState("0.00");
  const [nbv, setNbv] = useState("0.00");
  const [rate, setRate] = useState("25");
  const [method, setMethod] = useState<"reducing_balance" | "straight_line">(
    "reducing_balance",
  );
  const [secondEntry, setSecondEntry] = useState("Cr Bank / Cr Creditor");

  const ca = ledger.capitalAllowances;
  const [aia, setAia] = useState(
    ((ca?.aiaClaimPence ?? 0) / 100).toFixed(2),
  );
  const [mainWda, setMainWda] = useState(
    ((ca?.mainPoolWdaPence ?? 0) / 100).toFixed(2),
  );
  const [specialWda, setSpecialWda] = useState(
    ((ca?.specialRateWdaPence ?? 0) / 100).toFixed(2),
  );
  const [otherCa, setOtherCa] = useState(
    ((ca?.otherAllowancesPence ?? 0) / 100).toFixed(2),
  );
  const totalDep = ledger.assets.reduce(
    (s, a) => s + depreciationChargePence(a, periodStart, periodEnd),
    0,
  );
  const totalCa =
    poundsInputToPence(aia) +
    poundsInputToPence(mainWda) +
    poundsInputToPence(specialWda) +
    poundsInputToPence(otherCa);

  return (
    <div id="year-end-assets" className="space-y-6">
      <div>
        <h3 className="font-semibold text-ink">Tangible assets &amp; depreciation</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Accubee: tangible assets feed Fixed assets (Note 1) on the accounts
          draft. Depreciation rolls into Note 8 / live P&amp;L. Second entry is
          required.
        </p>
      </div>
      <form
        className="grid gap-3 rounded-xl border border-line bg-sand/20 p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          if (!secondEntry.trim()) {
            onError("Accubee: enter the second entry for this asset.");
            return;
          }
          start(async () => {
            try {
              const costPence = poundsInputToPence(cost);
              const bf = poundsInputToPence(nbv) || costPence;
              const next = await upsertBankAsset({
                clientId,
                name,
                class: klass,
                acquiredOn,
                costPence,
                broughtForwardNbvPence: bf,
                method,
                ratePercent: Number(rate) || 0,
                secondEntry: secondEntry.trim(),
              });
              onSaved(next);
              setName("");
              setCost("0.00");
              setNbv("0.00");
              setSecondEntry("Cr Bank / Cr Creditor");
            } catch (err) {
              onError(messageFromUnknown(err, "Could not save asset"));
            }
          });
        }}
      >
        <label className="label text-xs sm:col-span-2">
          Asset / vehicle
          <input
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ford Transit / Laptop / Fixtures"
            required
          />
        </label>
        <label className="label text-xs">
          Class
          <select
            className="input mt-1"
            value={klass}
            onChange={(e) => setKlass(e.target.value as typeof klass)}
          >
            <option value="vehicle">Vehicle</option>
            <option value="plant">Plant &amp; machinery</option>
            <option value="fixtures">Fixtures &amp; fittings</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="label text-xs">
          Acquired
          <UkDateField className="input mt-1" value={acquiredOn} onChange={(iso) => setAcquiredOn(iso)}
            required
          />
        </label>
        <label className="label text-xs">
          Cost £
          <input
            className="input mt-1 figures"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <label className="label text-xs">
          NBV brought forward £
          <input
            className="input mt-1 figures"
            value={nbv}
            onChange={(e) => setNbv(e.target.value)}
            placeholder="Same as cost if new"
          />
        </label>
        <label className="label text-xs">
          Method
          <select
            className="input mt-1"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="reducing_balance">Reducing balance</option>
            <option value="straight_line">Straight line</option>
          </select>
        </label>
        <label className="label text-xs">
          Rate %
          <input
            className="input mt-1 figures"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label className="label text-xs sm:col-span-3">
          2nd entry (double-entry)
          <input
            className="input mt-1"
            value={secondEntry}
            onChange={(e) => setSecondEntry(e.target.value)}
            required
            placeholder="Cr Bank / Cr Creditor / Cr HP"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary text-sm sm:col-span-3 sm:justify-self-start"
          disabled={pending || !name.trim()}
        >
          Add asset
        </button>
      </form>

      <ul className="divide-y divide-line rounded-xl border border-line">
        {ledger.assets.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">
            No assets yet. Add vehicles or equipment to charge depreciation into
            the live P&amp;L.
          </li>
        ) : (
          ledger.assets.map((asset) => {
            const charge = depreciationChargePence(
              asset,
              periodStart,
              periodEnd,
            );
            const closing = assetClosingNbvPence(
              asset,
              periodStart,
              periodEnd,
            );
            return (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{asset.name}</p>
                  <p className="text-xs capitalize text-ink-soft">
                    {asset.class} · {asset.ratePercent}%{" "}
                    {asset.method === "straight_line"
                      ? "straight line"
                      : "reducing"}
                  </p>
                </div>
                <div className="figures text-right text-xs">
                  <p>Cost {gbp(asset.costPence)}</p>
                  <p>BF NBV {gbp(asset.broughtForwardNbvPence)}</p>
                  <p className="font-semibold text-ink">
                    Depn {gbp(charge)} → NBV {gbp(closing)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        const next = await deleteBankAsset(clientId, asset.id);
                        onSaved(next);
                      } catch (err) {
                        onError(messageFromUnknown(err, "Delete failed"));
                      }
                    })
                  }
                >
                  Remove
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="font-semibold text-ink">
          Capital allowances (corporation tax)
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          Accounting depreciation this period: {gbp(totalDep)}. Claim AIA /
          WDA for CT separately (GOV.UK rates — enter the claim the company will
          use on the CT600).
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            onError(null);
            start(async () => {
              try {
                const next = await setCapitalAllowances({
                  clientId,
                  aiaClaimPence: poundsInputToPence(aia),
                  mainPoolWdaPence: poundsInputToPence(mainWda),
                  specialRateWdaPence: poundsInputToPence(specialWda),
                  otherAllowancesPence: poundsInputToPence(otherCa),
                });
                onSaved(next);
              } catch (err) {
                onError(
                  messageFromUnknown(err, "Could not save capital allowances"),
                );
              }
            });
          }}
        >
          <label className="label text-xs">
            AIA claim £
            <input
              className="input mt-1 figures"
              value={aia}
              onChange={(e) => setAia(e.target.value)}
            />
          </label>
          <label className="label text-xs">
            Main pool WDA £
            <input
              className="input mt-1 figures"
              value={mainWda}
              onChange={(e) => setMainWda(e.target.value)}
            />
          </label>
          <label className="label text-xs">
            Special rate WDA £
            <input
              className="input mt-1 figures"
              value={specialWda}
              onChange={(e) => setSpecialWda(e.target.value)}
            />
          </label>
          <label className="label text-xs">
            Other allowances £
            <input
              className="input mt-1 figures"
              value={otherCa}
              onChange={(e) => setOtherCa(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <p className="text-sm font-semibold text-ink">
              Total CA claim {gbp(totalCa)}
            </p>
            <button
              type="submit"
              className="btn btn-primary text-sm"
              disabled={pending}
            >
              Save capital allowances
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PropertiesPanel({
  clientId,
  ledger,
  bankLines,
  periodStart,
  periodEnd,
  pending,
  onSaved,
  onError,
  start,
}: {
  clientId: string;
  ledger: BankLedger;
  bankLines: TxLine[];
  periodStart: string;
  periodEnd: string;
  pending: boolean;
  onSaved: (l: BankLedger) => void;
  onError: (e: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cost, setCost] = useState("0.00");
  const [lender, setLender] = useState("");
  const [mortgageBf, setMortgageBf] = useState("0.00");
  const [interestRate, setInterestRate] = useState("");
  const [interestDue, setInterestDue] = useState("0.00");
  const [interestPaid, setInterestPaid] = useState("");
  const [secondEntry, setSecondEntry] = useState("Cr Bank / mortgage liability");
  const [clubMsg, setClubMsg] = useState<string | null>(null);

  function syncDueFromRate(bfRaw: string, rateRaw: string) {
    const bf = poundsInputToPence(bfRaw);
    const rate = Number(rateRaw);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const due = mortgageInterestDueFromRatePence(bf, rate);
    setInterestDue((due / 100).toFixed(2));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Accubee: properties and mortgages feed fixed assets and creditors on the
        accounts draft in real time. Address is optional. Enter interest as a
        percentage — due £ is calculated from the mortgage BF. Second entry is
        required for double-entry.
      </p>
      <form
        className="overflow-x-auto rounded-xl border border-line"
        onSubmit={(e) => {
          e.preventDefault();
          onError(null);
          setClubMsg(null);
          if (!secondEntry.trim()) {
            onError(
              "Accubee: enter the second entry (e.g. Cr Bank, Cr Creditor).",
            );
            return;
          }
          start(async () => {
            try {
              const rateNum = interestRate.trim()
                ? Number(interestRate)
                : null;
              const bfPence = poundsInputToPence(mortgageBf);
              const dueFromRate = mortgageInterestDueFromRatePence(
                bfPence,
                rateNum,
              );
              const duePence =
                dueFromRate > 0
                  ? dueFromRate
                  : poundsInputToPence(interestDue);
              const mortgages = lender.trim()
                ? [
                    {
                      lender: lender.trim(),
                      broughtForwardPence: bfPence,
                      interestRatePercent:
                        rateNum != null && Number.isFinite(rateNum)
                          ? rateNum
                          : null,
                      interestDuePence: duePence,
                      interestPaidPence: interestPaid.trim()
                        ? poundsInputToPence(interestPaid)
                        : null,
                      interestPaidCategory: "finance",
                    },
                  ]
                : [];
              const next = await upsertBankProperty({
                clientId,
                name,
                address,
                costPence: poundsInputToPence(cost),
                secondEntry: secondEntry.trim(),
                mortgages,
              });
              onSaved(next);

              // bankbee: club similar interest-sized outflows under finance
              if (duePence > 0) {
                const { findInterestLikePayments } = await import(
                  "@/server/bank/interest-payment-club"
                );
                const { updateBankCategoriesBulk } = await import(
                  "@/server/actions/bank"
                );
                const hits = findInterestLikePayments(bankLines, {
                  periodInterestPence: duePence,
                  periodStart,
                  periodEnd,
                });
                const ids = hits
                  .filter((h) => {
                    const line = bankLines.find((b) => b.id === h.id);
                    return line && line.category !== "finance";
                  })
                  .map((h) => h.id);
                if (ids.length) {
                  await updateBankCategoriesBulk(ids, "finance");
                  setClubMsg(
                    `bankbee clubbed ${ids.length} payment${ids.length === 1 ? "" : "s"} into Finance (interest).`,
                  );
                }
              }

              setName("");
              setAddress("");
              setCost("0.00");
              setLender("");
              setMortgageBf("0.00");
              setInterestRate("");
              setInterestDue("0.00");
              setInterestPaid("");
              setSecondEntry("Cr Bank / mortgage liability");
            } catch (err) {
              onError(messageFromUnknown(err, "Could not save property"));
            }
          });
        }}
      >
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead className="bg-sand/50 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Property</th>
              <th className="px-3 py-2 font-semibold">Address (optional)</th>
              <th className="px-3 py-2 font-semibold text-right">Cost £</th>
              <th className="px-3 py-2 font-semibold">Lender</th>
              <th className="px-3 py-2 font-semibold text-right">Mortgage BF £</th>
              <th className="px-3 py-2 font-semibold text-right">Interest %</th>
              <th className="px-3 py-2 font-semibold text-right">Interest due £</th>
              <th className="px-3 py-2 font-semibold">2nd entry</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line bg-white">
              <td className="px-2 py-2 align-top">
                <input
                  className="input w-full text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Property name"
                  required
                />
              </td>
              <td className="px-2 py-2 align-top">
                <AddressFields
                  value={address}
                  onChange={setAddress}
                  required={false}
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input figures w-full text-right"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input w-full"
                  value={lender}
                  onChange={(e) => setLender(e.target.value)}
                  placeholder="Optional"
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input figures w-full text-right"
                  value={mortgageBf}
                  onChange={(e) => {
                    setMortgageBf(e.target.value);
                    syncDueFromRate(e.target.value, interestRate);
                  }}
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input figures w-full text-right"
                  value={interestRate}
                  onChange={(e) => {
                    setInterestRate(e.target.value);
                    syncDueFromRate(mortgageBf, e.target.value);
                  }}
                  placeholder="e.g. 4.5"
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input figures w-full text-right"
                  value={interestDue}
                  onChange={(e) => setInterestDue(e.target.value)}
                  title="Auto from % × BF; override if needed"
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  className="input w-full"
                  value={secondEntry}
                  onChange={(e) => setSecondEntry(e.target.value)}
                  required
                  placeholder="Cr Bank / Cr Creditor"
                />
              </td>
              <td className="px-2 py-2 align-top">
                <button
                  type="submit"
                  className="btn btn-primary text-xs whitespace-nowrap"
                  disabled={pending || !name.trim()}
                >
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
          Interest paid from bank (optional override){" "}
          <input
            className="input ml-2 inline-block w-40 figures"
            value={interestPaid}
            onChange={(e) => setInterestPaid(e.target.value)}
            placeholder="Blank = bank Finance"
          />
        </p>
      </form>
      {clubMsg ? <p className="text-sm text-ok">{clubMsg}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead className="bg-sand/40 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2">Property</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2">Lender</th>
              <th className="px-3 py-2 text-right">BF</th>
              <th className="px-3 py-2 text-right">Rate %</th>
              <th className="px-3 py-2 text-right">Interest due</th>
              <th className="px-3 py-2 text-right">Paid (bank)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ledger.properties.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-ink-soft"
                >
                  No properties yet. Add a row above — figures enrich the
                  accounts draft immediately.
                </td>
              </tr>
            ) : (
              ledger.properties.map((prop) => {
                const m = prop.mortgages[0];
                const paid = m
                  ? mortgageInterestPaidPence(
                      m,
                      bankLines,
                      periodStart,
                      periodEnd,
                    )
                  : 0;
                return (
                  <tr key={prop.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-ink">{prop.name}</p>
                      {prop.address ? (
                        <p className="text-xs text-ink-soft">
                          {addressPartsDisplay(prop.address)}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-soft">No address</p>
                      )}
                      {prop.notes ? (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {prop.notes}
                        </p>
                      ) : null}
                    </td>
                    <td className="figures px-3 py-2 text-right">
                      {gbp(prop.costPence)}
                    </td>
                    <td className="px-3 py-2">{m?.lender ?? "—"}</td>
                    <td className="figures px-3 py-2 text-right">
                      {m ? gbp(m.broughtForwardPence) : "—"}
                    </td>
                    <td className="figures px-3 py-2 text-right">
                      {m?.interestRatePercent != null
                        ? `${m.interestRatePercent}`
                        : "—"}
                    </td>
                    <td className="figures px-3 py-2 text-right">
                      {m ? gbp(m.interestDuePence) : "—"}
                    </td>
                    <td className="figures px-3 py-2 text-right">
                      {m ? gbp(paid) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn btn-secondary text-xs"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            try {
                              const next = await deleteBankProperty(
                                clientId,
                                prop.id,
                              );
                              onSaved(next);
                            } catch (err) {
                              onError(
                                messageFromUnknown(err, "Delete failed"),
                              );
                            }
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PartiesPanel({
  clientId,
  ledger,
  bankLines,
  periodStart,
  periodEnd,
  pending,
  onSaved,
  onError,
  start,
}: {
  clientId: string;
  ledger: BankLedger;
  bankLines: TxLine[];
  periodStart: string;
  periodEnd: string;
  pending: boolean;
  onSaved: (l: BankLedger) => void;
  onError: (e: string | null) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const [dName, setDName] = useState("");
  const [dBucket, setDBucket] = useState<DebtorBucket>("trade");
  const [dBf, setDBf] = useState("0.00");
  const [dInv, setDInv] = useState("0.00");
  const [dClose, setDClose] = useState("");
  const [dSecond, setDSecond] = useState("Cr Turnover / Cr Other income");
  const [cName, setCName] = useState("");
  const [cBucket, setCBucket] = useState<CreditorBucket>("other");
  const [cBf, setCBf] = useState("0.00");
  const [cBills, setCBills] = useState("0.00");
  const [cClose, setCClose] = useState("");
  const [cSecond, setCSecond] = useState("Dr Expense / Dr Bank");
  const [unpaidSc, setUnpaidSc] = useState(
    ((ledger.unpaidShareCapitalPence ?? 0) / 100).toFixed(2),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-sand/20 p-4">
        <p className="text-xs font-bold uppercase text-ink-soft">
          Unpaid share capital (Note 2)
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="label text-xs">
            Amount £
            <input
              className="input mt-1 figures"
              value={unpaidSc}
              onChange={(e) => setUnpaidSc(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={pending}
            onClick={() => {
              onError(null);
              start(async () => {
                try {
                  const next = await setUnpaidShareCapital({
                    clientId,
                    unpaidShareCapitalPence: poundsInputToPence(unpaidSc),
                  });
                  onSaved(next);
                } catch (err) {
                  onError(messageFromUnknown(err, "Could not save"));
                }
              });
            }}
          >
            Save unpaid share capital
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h4 className="font-semibold text-ink">Debtors</h4>
          <form
            className="grid gap-2 rounded-xl border border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              onError(null);
              if (!dSecond.trim()) {
                onError(
                  "Accubee: debtors need a second entry (e.g. Cr Turnover).",
                );
                return;
              }
              start(async () => {
                try {
                  const next = await upsertBankDebtor({
                    clientId,
                    name: dName,
                    bucket: dBucket,
                    broughtForwardPence: poundsInputToPence(dBf),
                    invoicesPence: poundsInputToPence(dInv),
                    closingOverridePence: dClose.trim()
                      ? poundsInputToPence(dClose)
                      : null,
                    secondEntry: dSecond.trim(),
                  });
                  onSaved(next);
                  setDName("");
                  setDBf("0.00");
                  setDInv("0.00");
                  setDClose("");
                  setDSecond("Cr Turnover / Cr Other income");
                } catch (err) {
                  onError(messageFromUnknown(err, "Could not save debtor"));
                }
              });
            }}
          >
            <label className="label text-xs">
              Name
              <input
                className="input mt-1"
                value={dName}
                onChange={(e) => setDName(e.target.value)}
                required
              />
            </label>
            <label className="label text-xs">
              Note 2 bucket
              <select
                className="input mt-1"
                value={dBucket}
                onChange={(e) => setDBucket(e.target.value as DebtorBucket)}
              >
                {(Object.keys(DEBTOR_BUCKET_LABELS) as DebtorBucket[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {DEBTOR_BUCKET_LABELS[k]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="label text-xs">
                B/fwd £
                <input
                  className="input mt-1 figures"
                  value={dBf}
                  onChange={(e) => setDBf(e.target.value)}
                />
              </label>
              <label className="label text-xs">
                Invoices £
                <input
                  className="input mt-1 figures"
                  value={dInv}
                  onChange={(e) => setDInv(e.target.value)}
                />
              </label>
              <label className="label text-xs">
                Closing override £
                <input
                  className="input mt-1 figures"
                  value={dClose}
                  onChange={(e) => setDClose(e.target.value)}
                  placeholder="auto"
                />
              </label>
            </div>
            <label className="label text-xs">
              2nd entry
              <input
                className="input mt-1"
                value={dSecond}
                onChange={(e) => setDSecond(e.target.value)}
                required
                placeholder="Cr Turnover"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary text-sm"
              disabled={pending || !dName.trim()}
            >
              Add debtor
            </button>
          </form>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {ledger.debtors.length === 0 ? (
              <li className="px-3 py-4 text-sm text-ink-soft">
                No debtor accounts yet.
              </li>
            ) : (
              ledger.debtors.map((d) => {
                const closing = debtorClosingPence(
                  d,
                  bankLines,
                  periodStart,
                  periodEnd,
                );
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{d.name}</p>
                      <p className="text-xs text-ink-soft">
                        {DEBTOR_BUCKET_LABELS[d.bucket]}
                      </p>
                    </div>
                    <div className="figures text-right">
                      <p className="font-semibold">{gbp(closing)}</p>
                      <button
                        type="button"
                        className="text-xs text-ink-soft underline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            try {
                              onSaved(await deleteBankDebtor(clientId, d.id));
                            } catch (err) {
                              onError(
                                messageFromUnknown(err, "Delete failed"),
                              );
                            }
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-ink">Creditors</h4>
          <form
            className="grid gap-2 rounded-xl border border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              onError(null);
              if (!cSecond.trim()) {
                onError(
                  "Accubee: creditors need a second entry (e.g. Dr Expense).",
                );
                return;
              }
              start(async () => {
                try {
                  const next = await upsertBankCreditor({
                    clientId,
                    name: cName,
                    bucket: cBucket,
                    broughtForwardPence: poundsInputToPence(cBf),
                    billsPence: poundsInputToPence(cBills),
                    closingOverridePence: cClose.trim()
                      ? poundsInputToPence(cClose)
                      : null,
                    secondEntry: cSecond.trim(),
                  });
                  onSaved(next);
                  setCName("");
                  setCBf("0.00");
                  setCBills("0.00");
                  setCClose("");
                  setCSecond("Dr Expense / Dr Bank");
                } catch (err) {
                  onError(messageFromUnknown(err, "Could not save creditor"));
                }
              });
            }}
          >
            <label className="label text-xs">
              Name
              <input
                className="input mt-1"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                required
              />
            </label>
            <label className="label text-xs">
              Note 2 / 3 bucket
              <select
                className="input mt-1"
                value={cBucket}
                onChange={(e) => setCBucket(e.target.value as CreditorBucket)}
              >
                {(Object.keys(CREDITOR_BUCKET_LABELS) as CreditorBucket[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {CREDITOR_BUCKET_LABELS[k]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="label text-xs">
                B/fwd £
                <input
                  className="input mt-1 figures"
                  value={cBf}
                  onChange={(e) => setCBf(e.target.value)}
                />
              </label>
              <label className="label text-xs">
                Bills £
                <input
                  className="input mt-1 figures"
                  value={cBills}
                  onChange={(e) => setCBills(e.target.value)}
                />
              </label>
              <label className="label text-xs">
                Closing override £
                <input
                  className="input mt-1 figures"
                  value={cClose}
                  onChange={(e) => setCClose(e.target.value)}
                  placeholder="auto"
                />
              </label>
            </div>
            <label className="label text-xs">
              2nd entry
              <input
                className="input mt-1"
                value={cSecond}
                onChange={(e) => setCSecond(e.target.value)}
                required
                placeholder="Dr Expense"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary text-sm"
              disabled={pending || !cName.trim()}
            >
              Add creditor
            </button>
          </form>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {ledger.creditors.length === 0 ? (
              <li className="px-3 py-4 text-sm text-ink-soft">
                No creditor accounts yet. Corporation tax from the P&amp;L is
                included automatically if you do not add a CT creditor.
              </li>
            ) : (
              ledger.creditors.map((c) => {
                const closing = creditorClosingPence(
                  c,
                  bankLines,
                  periodStart,
                  periodEnd,
                );
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-ink-soft">
                        {CREDITOR_BUCKET_LABELS[c.bucket]}
                      </p>
                    </div>
                    <div className="figures text-right">
                      <p className="font-semibold">{gbp(closing)}</p>
                      <button
                        type="button"
                        className="text-xs text-ink-soft underline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            try {
                              onSaved(
                                await deleteBankCreditor(clientId, c.id),
                              );
                            } catch (err) {
                              onError(
                                messageFromUnknown(err, "Delete failed"),
                              );
                            }
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
