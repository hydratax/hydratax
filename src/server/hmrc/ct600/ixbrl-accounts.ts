import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";

const IX_NS = "http://www.xbrl.org/2013/inlineXBRL";
const XBRDI_NS = "http://xbrl.org/2006/xbrldi";
const XBRLL_NS = "http://www.xbrl.org/2003/link";
const XBRLLI_NS = "http://www.xbrl.org/2003/instance";
const FRC_BUS_NS = "http://xbrl.frc.org.uk/fr/2024-01-01/core";
const FRC_DUR_NS = "http://xbrl.frc.org.uk/general/2024-01-01/roles/dimension";

function ixNonFraction(name: string, valuePence: number, contextRef: string) {
  const pounds = penceToPoundsDisplay(valuePence);
  return `<ix:nonFraction name="${name}" contextRef="${contextRef}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${pounds}</ix:nonFraction>`;
}

/**
 * Minimal FRC-tagged iXBRL accounts instance for CT Online attachment.
 * Maps HydraTax year-end / CT figures into core balance sheet & P&L tags.
 */
export function buildAccountsIxbrl(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  draft?: YearEndAccountsDraft | null;
}): string {
  const { companyName, companyNumber, utr, figures, draft } = opts;
  const periodStart = figures.periodStart;
  const periodEnd = figures.periodEnd;
  const contextId = "ctx-period";
  const turnover = draft?.turnoverPence ?? Number(figures.turnoverPence);
  const grossProfit =
    draft?.grossProfitPence ??
    Number(figures.turnoverPence) -
      Number(figures.costOfSalesPence) +
      Number(figures.otherIncomePence);
  const profitBeforeTax =
    draft?.profitBeforeTaxPence ??
    grossProfit - Number(figures.administrativeExpensesPence);
  const taxation = draft?.taxationPence ?? Math.round(profitBeforeTax * 0.19);
  const tangible =
    draft?.balanceSheet.fixedAssetsPence ?? Number(figures.tangibleAssetsPence);
  const cash =
    draft?.balanceSheet.cashAtBankPence ?? Number(figures.cashAtBankPence);
  const debtors =
    draft?.balanceSheet.otherDebtorsPence ?? Number(figures.debtorsPence);
  const creditors =
    draft?.balanceSheet.creditorsWithinOneYearPence ??
    Number(figures.creditorsPence);
  const shareCapital =
    draft?.balanceSheet.shareCapitalPence ??
    Number(figures.calledUpShareCapitalPence);
  const plReserve =
    draft?.balanceSheet.profitAndLossReservePence ??
    Number(figures.profitAndLossAccountPence);

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
  xmlns:ix="${IX_NS}"
  xmlns:xbrldi="${XBRDI_NS}"
  xmlns:link="${XBRLL_NS}"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xbrli="${XBRLLI_NS}"
  xmlns:core="${FRC_BUS_NS}"
  xmlns:dim="${FRC_DUR_NS}">
<head>
  <title>${escapeXml(companyName)} — statutory accounts</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
</head>
<body>
  <div style="display:none">
    <ix:header>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="http://xbrl.frc.org.uk/fr/2024-01-01/core/fr-core-2024-01-01.xsd"/>
      </ix:references>
      <ix:resources>
        <xbrli:context id="${contextId}">
          <xbrli:entity>
            <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${escapeXml(companyNumber)}</xbrli:identifier>
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>${periodStart}</xbrli:startDate>
            <xbrli:endDate>${periodEnd}</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:unit id="GBP">
          <xbrli:measure>iso4217:GBP</xbrli:measure>
        </xbrli:unit>
      </ix:resources>
    </ix:header>
  </div>
  <h1>${escapeXml(companyName)}</h1>
  <p>Company number ${escapeXml(companyNumber)} · UTR ${escapeXml(utr)}</p>
  <p>Period ${periodStart} to ${periodEnd}</p>
  <h2>Profit and loss account</h2>
  <p>Turnover: ${ixNonFraction("core:TurnoverRevenue", turnover, contextId)}</p>
  <p>Gross profit: ${ixNonFraction("core:GrossProfitLoss", grossProfit, contextId)}</p>
  <p>Profit before tax: ${ixNonFraction("core:ProfitLossOnOrdinaryActivitiesBeforeTax", profitBeforeTax, contextId)}</p>
  <p>Taxation: ${ixNonFraction("core:TaxTaxationOnProfitOrLossOnOrdinaryActivities", taxation, contextId)}</p>
  <h2>Balance sheet</h2>
  <p>Tangible assets: ${ixNonFraction("core:PropertyPlantEquipment", tangible, contextId)}</p>
  <p>Debtors: ${ixNonFraction("core:TradeDebtorsTradeReceivables", debtors, contextId)}</p>
  <p>Cash at bank: ${ixNonFraction("core:CashBankOnHand", cash, contextId)}</p>
  <p>Creditors within one year: ${ixNonFraction("core:Creditors", creditors, contextId)}</p>
  <p>Called-up share capital: ${ixNonFraction("core:CalledUpShareCapitalNotPaidNotExpensed", shareCapital, contextId)}</p>
  <p>Profit and loss account: ${ixNonFraction("core:RetainedEarningsAccumulatedLosses", plReserve, contextId)}</p>
</body>
</html>`;
}
