import type {
  PriorStatementFigures,
  StatementAmount,
  YearEndAccountsDraft,
} from "@/server/accounts/year-end-from-bank";
import { NOTE8_KEYS } from "@/lib/bank-categories";

function gbp(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function cell(amount: StatementAmount, negate = false) {
  if (amount === null) {
    return <td className="figures py-2 text-right text-ink-soft">—</td>;
  }
  const value = negate ? -amount : amount;
  return (
    <td className="figures py-2 text-right tabular-nums">{gbp(value)}</td>
  );
}

function plRow(
  label: string,
  current: StatementAmount,
  prior: StatementAmount = null,
  note?: string,
  negate = false,
  showPrior = true,
) {
  return (
    <tr className="border-b border-line/60">
      <td className="py-2 pr-4">{label}</td>
      {note ? (
        <td className="py-2 text-center text-xs text-ink-soft">{note}</td>
      ) : (
        <td className="py-2" />
      )}
      {cell(current, negate)}
      {showPrior ? cell(prior, negate) : null}
    </tr>
  );
}

function yearShort(iso: string) {
  return iso.slice(0, 4);
}

type Props = {
  draft: YearEndAccountsDraft;
  companyName?: string;
  showPriorYear?: boolean;
  prior?: PriorStatementFigures | null;
};

export function AccountsPackStatements({
  draft,
  companyName,
  showPriorYear = true,
  prior = null,
}: Props) {
  const y = yearShort(draft.periodEnd);
  const py = String(Number(y) - 1);
  const cols = showPriorYear ? 4 : 3;
  const customExpenseRows = Object.entries(draft.customExpensesPence).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const row = (
    label: string,
    current: StatementAmount,
    priorAmt: StatementAmount = null,
    note?: string,
    negate = false,
  ) => plRow(label, current, priorAmt, note, negate, showPriorYear);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-line bg-white p-5">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-ink">
          {companyName ? `${companyName} · ` : ""}Balance sheet
        </h3>
        <p className="mt-1 text-center text-xs text-ink-soft">
          As at{" "}
          {new Date(`${draft.periodEnd}T12:00:00Z`).toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "long", year: "numeric" },
          )}
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-ink-soft">
              <th className="pb-2 font-semibold" />
              <th className="pb-2 text-center font-semibold">Notes</th>
              <th className="figures pb-2 text-right font-semibold">{y}</th>
              {showPriorYear ? (
                <th className="figures pb-2 text-right font-semibold">{py}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {row(
              "Fixed assets",
              draft.balanceSheet.fixedAssetsPence,
              prior?.balanceSheet.fixedAssetsPence ?? null,
              "1",
            )}
            <tr>
              <td
                colSpan={cols}
                className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft"
              >
                Current assets
              </td>
            </tr>
            {row(
              "Other debtors",
              draft.balanceSheet.otherDebtorsPence,
              prior?.balanceSheet.otherDebtorsPence ?? null,
              "2",
            )}
            {row(
              "Cash at bank",
              draft.balanceSheet.cashAtBankPence,
              prior?.balanceSheet.cashAtBankPence ?? null,
            )}
            {row(
              "Creditors — amounts due within one year",
              draft.balanceSheet.creditorsWithinOneYearPence,
              prior?.balanceSheet.creditorsWithinOneYearPence ?? null,
              "3",
              true,
            )}
            {row(
              "Net current assets / (liabilities)",
              draft.balanceSheet.netCurrentAssetsPence,
              prior?.balanceSheet.netCurrentAssetsPence ?? null,
            )}
            {row(
              "Total net assets",
              draft.balanceSheet.totalNetAssetsPence,
              prior?.balanceSheet.totalNetAssetsPence ?? null,
            )}
            <tr>
              <td
                colSpan={cols}
                className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft"
              >
                Represented by
              </td>
            </tr>
            {row(
              "Share capital",
              draft.balanceSheet.shareCapitalPence,
              prior?.balanceSheet.shareCapitalPence ?? null,
              "5",
            )}
            {row(
              "Profit and loss reserve",
              draft.balanceSheet.profitAndLossReservePence,
              prior?.balanceSheet.profitAndLossReservePence ?? null,
              "6",
            )}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-ink-soft">
          {showPriorYear
            ? "Brought-forward cash and reserves come from last year’s accounts where you have entered them."
            : "First-year accounts — no prior-year column. Opening cash and reserves start at nil unless you change them."}{" "}
          Net movement per bank statement this period:{" "}
          <span className="figures font-medium text-ink">
            {gbp(draft.cashMovementPence)}
          </span>
          .
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-ink">
          Profit and loss account
        </h3>
        <p className="mt-1 text-center text-xs text-ink-soft">
          For the period{" "}
          {new Date(`${draft.periodStart}T12:00:00Z`).toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "long", year: "numeric" },
          )}{" "}
          to{" "}
          {new Date(`${draft.periodEnd}T12:00:00Z`).toLocaleDateString(
            "en-GB",
            { day: "numeric", month: "long", year: "numeric" },
          )}
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-ink-soft">
              <th className="pb-2 font-semibold" />
              <th className="pb-2 text-center font-semibold">Notes</th>
              <th className="figures pb-2 text-right font-semibold">{y}</th>
              {showPriorYear ? (
                <th className="figures pb-2 text-right font-semibold">{py}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {row("Turnover", draft.turnoverPence, prior?.turnoverPence ?? null, "7")}
            {row(
              "Cost of sales",
              draft.costOfSalesPence,
              prior?.costOfSalesPence ?? null,
              undefined,
              true,
            )}
            {row("Gross profit", draft.grossProfitPence, prior?.grossProfitPence ?? null)}
            {row(
              "Administrative expenses",
              draft.adminExpensesPence,
              prior?.adminExpensesPence ?? null,
              "8",
              true,
            )}
            {row(
              "Profit / (loss) before taxation",
              draft.profitBeforeTaxPence,
              prior?.profitBeforeTaxPence ?? null,
            )}
            {row(
              "Taxation",
              draft.taxationPence,
              prior?.taxationPence ?? null,
              "9",
              true,
            )}
            {row(
              "Profit / (loss) after taxation",
              draft.profitAfterTaxPence,
              prior?.profitAfterTaxPence ?? null,
            )}
            {row(
              "Dividends",
              draft.dividendsPence,
              prior?.dividendsPence ?? null,
              "10",
              true,
            )}
            {row(
              "Profit / (loss) brought forward",
              draft.retainedBroughtForwardPence,
            )}
            {row(
              "Retained profit / (loss) carried forward",
              draft.retainedCarriedForwardPence,
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Note 8 — Administrative expenses
        </h3>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-ink-soft">
              <th className="pb-2 font-semibold" />
              <th className="figures pb-2 text-right font-semibold">{y}</th>
              {showPriorYear ? (
                <th className="figures pb-2 text-right font-semibold">{py}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {NOTE8_KEYS.map((k) => {
              const amount = draft.note8[k];
              if (!amount) return null;
              return (
                <tr key={k} className="border-b border-line/60">
                  <td className="py-2 pr-4">{draft.note8Labels[k]}</td>
                  <td className="figures py-2 text-right tabular-nums">
                    {gbp(amount)}
                  </td>
                  {showPriorYear ? (
                    <td className="figures py-2 text-right text-ink-soft">—</td>
                  ) : null}
                </tr>
              );
            })}
            {customExpenseRows.map(([label, amount]) => (
              <tr key={label} className="border-b border-line/60">
                <td className="py-2 pr-4">{label}</td>
                <td className="figures py-2 text-right tabular-nums">
                  {gbp(amount)}
                </td>
                {showPriorYear ? (
                  <td className="figures py-2 text-right text-ink-soft">—</td>
                ) : null}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total expenditure</td>
              <td className="figures py-2 text-right tabular-nums">
                {gbp(draft.adminExpensesPence)}
              </td>
              {showPriorYear ? (
                <td className="figures py-2 text-right text-ink-soft">
                  {prior?.adminExpensesPence != null
                    ? gbp(prior.adminExpensesPence)
                    : "—"}
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
        {!NOTE8_KEYS.some((k) => draft.note8[k]) &&
        customExpenseRows.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No expense heads in this period yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
