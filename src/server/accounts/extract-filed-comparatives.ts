import type { PriorYearComparatives } from "@/lib/accounting-periods";
import {
  EMPTY_COMPARATIVES,
  comparativesHaveFigures,
} from "@/lib/accounting-periods";

export { comparativesHaveFigures };

type MoneyHit = { pence: number; contextRef: string };

/**
 * Pull balance-sheet / P&L tags from filed Companies House iXBRL (XHTML).
 * Values are converted to integer pence.
 *
 * Prefers the "current year" column of the filed accounts (icur / CY / current),
 * which is the correct comparative set when that filing is last year's pack.
 */
export function extractComparativesFromFiledAccountsHtml(
  html: string,
  opts?: { preferPriorColumn?: boolean },
): PriorYearComparatives {
  const preferPrior = opts?.preferPriorColumn === true;
  const out: PriorYearComparatives = { ...EMPTY_COMPARATIVES };

  const money = (name: string) =>
    pickMoney(allMoneyTags(html, name), preferPrior);

  out.fixedAssetsPence = money("FixedAssets") ?? money("PropertyPlantEquipment");
  out.cashAtBankPence =
    money("CashBankOnHand") ??
    money("CashBankOnHandInHand") ??
    money("CashAtBank");
  const currentAssets = money("CurrentAssets");
  out.otherDebtorsPence =
    money("Debtors") ??
    money("TradeDebtorsTradeReceivables") ??
    money("OtherDebtors");
  out.creditorsWithinOneYearPence =
    money("Creditors") ?? money("TradeCreditorsTradePayables");
  out.creditorsAfterOneYearPence = null;

  const calledUp = money("CalledUpShareCapital");
  const calledUpUnpaid = money(
    "CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset",
  );
  const equity = money("Equity") ?? money("NetAssetsLiabilities");
  const reservesTagged =
    money("ProfitLossAccountReserve") ??
    money("RetainedEarningsAccumulatedLosses") ??
    money("IncomeStatementAccountReserve");

  // Micro packs we file often tag only Equity (total capital + reserves) plus
  // unpaid called-up share capital as an asset — not CalledUpShareCapital equity.
  if (calledUp != null) {
    out.shareCapitalPence = calledUp;
  } else if (calledUpUnpaid != null && calledUpUnpaid > 0) {
    out.shareCapitalPence = calledUpUnpaid;
  } else if (equity != null && reservesTagged != null) {
    out.shareCapitalPence = Math.max(0, equity - reservesTagged);
  } else {
    out.shareCapitalPence = money("EquityShareCapital");
  }

  if (reservesTagged != null) {
    out.profitAndLossReservePence = reservesTagged;
  } else if (equity != null && out.shareCapitalPence != null) {
    out.profitAndLossReservePence = equity - out.shareCapitalPence;
  } else if (equity != null && out.shareCapitalPence == null) {
    // Unknown split — keep total equity on reserves so net assets still balance
    // once the user fills share capital (often £100).
    out.profitAndLossReservePence = equity;
  }

  // If only CurrentAssets is tagged, split cash vs remainder after cash is known.
  if (
    out.otherDebtorsPence == null &&
    currentAssets != null &&
    out.cashAtBankPence != null
  ) {
    out.otherDebtorsPence = Math.max(0, currentAssets - out.cashAtBankPence);
  } else if (
    out.otherDebtorsPence == null &&
    currentAssets != null &&
    out.cashAtBankPence == null
  ) {
    // Unknown cash split — keep whole amount as current assets via cash.
    out.cashAtBankPence = currentAssets;
  }

  out.turnoverPence =
    money("TurnoverRevenue") ?? money("Turnover") ?? money("Revenue");
  out.costOfSalesPence = money("CostSales");
  out.adminExpensesPence =
    money("AdministrativeExpenses") ?? money("OperatingExpenses");
  out.taxationPence =
    money("TaxTaxCreditOnProfitOrLossOnOrdinaryActivities") ??
    money("TaxExpenseCredit");
  out.dividendsPence = money("DividendsPaid");

  return out;
}

function pickMoney(
  hits: MoneyHit[],
  preferPriorColumn: boolean,
): number | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!.pence;

  const scored = hits.map((h) => ({
    ...h,
    score: contextScore(h.contextRef, preferPriorColumn),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.pence;
}

/** Higher = preferred for the column we want. */
function contextScore(contextRef: string, preferPriorColumn: boolean): number {
  const c = contextRef.toLowerCase();
  const prior =
    /\b(iprev|prev|prior|py|comparative|lastyear|preceding)\b/i.test(c) ||
    /prev/.test(c);
  const current =
    /\b(icur|curr|cy|current|thisyear|instant)\b/i.test(c) && !prior;

  if (preferPriorColumn) {
    if (prior) return 3;
    if (current) return 1;
    return 0;
  }
  if (current) return 3;
  if (prior) return 1;
  return 2; // unknown — prefer first-ish via stable order + mid score
}

function allMoneyTags(html: string, localName: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re = new RegExp(
    `<ix:nonFraction\\b([^>]*)>([^<]+)</ix:nonFraction>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const name = /\bname="([^"]+)"/i.exec(attrs)?.[1] ?? "";
    const local = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
    if (local.toLowerCase() !== localName.toLowerCase()) continue;
    const contextRef = /\bcontextRef="([^"]+)"/i.exec(attrs)?.[1] ?? "";
    const signAttr = /\bsign="([^"]+)"/i.exec(attrs)?.[1];
    const pence = parseIxMoney(m[2] ?? "", signAttr);
    if (pence == null) continue;
    hits.push({ pence, contextRef });
  }
  return hits;
}

function parseIxMoney(raw: string, signAttr?: string | null): number | null {
  const cleaned = raw
    .replace(/£/g, "")
    .replace(/,/g, "")
    .replace(/\u00a0/g, "")
    .trim();
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const parenNeg = /^\(.*\)$/.test(cleaned);
  const n = Number.parseFloat(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  let pence = Math.round(Math.abs(n) * 100);
  if (parenNeg || signAttr === "-") pence = -pence;
  return pence;
}

/** Map a stored CT600 figures blob into prior-year comparatives. */
export function comparativesFromCt600Figures(
  figures: Record<string, unknown> | null | undefined,
): PriorYearComparatives {
  if (!figures) return { ...EMPTY_COMPARATIVES };
  const n = (key: string) => {
    const v = figures[key];
    if (v == null || v === "") return null;
    const num = typeof v === "number" ? v : Number(v);
    return Number.isFinite(num) ? Math.round(num) : null;
  };
  return {
    turnoverPence: n("turnoverPence"),
    costOfSalesPence: n("costOfSalesPence"),
    adminExpensesPence: n("administrativeExpensesPence"),
    taxationPence: null,
    dividendsPence: null,
    fixedAssetsPence: n("tangibleAssetsPence"),
    otherDebtorsPence: n("debtorsPence"),
    cashAtBankPence: n("cashAtBankPence"),
    creditorsWithinOneYearPence: n("creditorsPence"),
    creditorsAfterOneYearPence: null,
    shareCapitalPence: n("calledUpShareCapitalPence"),
    profitAndLossReservePence: n("profitAndLossAccountPence"),
  };
}
