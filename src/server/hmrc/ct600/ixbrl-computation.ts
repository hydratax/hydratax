import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";

const IX_NS = "http://www.xbrl.org/2013/inlineXBRL";
const XBRLLI_NS = "http://www.xbrl.org/2003/instance";
const XBRLL_NS = "http://www.xbrl.org/2003/link";
const CT_COMP_NS = "http://www.govtalk.gov.uk/taxation/CT/5";

/** Corporation tax computation iXBRL attachment (summary). */
export function buildComputationIxbrl(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): string {
  const { companyName, companyNumber, utr, figures } = opts;
  const contextId = "ctx-comp";
  const turnover = Number(figures.turnoverPence);
  const costs =
    Number(figures.costOfSalesPence) +
    Number(figures.administrativeExpensesPence);
  const taxable = opts.taxableProfitPence;
  const tax = opts.taxChargePence;

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
  xmlns:ix="${IX_NS}"
  xmlns:link="${XBRLL_NS}"
  xmlns:xbrli="${XBRLLI_NS}"
  xmlns:ct="${CT_COMP_NS}">
<head>
  <title>${escapeXml(companyName)} — tax computation</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
</head>
<body>
  <div style="display:none">
    <ix:header>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="http://www.govtalk.gov.uk/taxation/CT/5"/>
      </ix:references>
      <ix:resources>
        <xbrli:context id="${contextId}">
          <xbrli:entity>
            <xbrli:identifier scheme="http://www.govtalk.gov.uk/taxation/CT/5">${escapeXml(utr)}</xbrli:identifier>
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>${figures.periodStart}</xbrli:startDate>
            <xbrli:endDate>${figures.periodEnd}</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:unit id="GBP">
          <xbrli:measure>iso4217:GBP</xbrli:measure>
        </xbrli:unit>
      </ix:resources>
    </ix:header>
  </div>
  <h1>Corporation tax computation</h1>
  <p>${escapeXml(companyName)} (${escapeXml(companyNumber)})</p>
  <p>Period ${figures.periodStart} to ${figures.periodEnd}</p>
  <table>
    <tr><td>Turnover</td><td><ix:nonFraction name="ct:Turnover" contextRef="${contextId}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(turnover)}</ix:nonFraction></td></tr>
    <tr><td>Deductible costs</td><td><ix:nonFraction name="ct:TotalDeductions" contextRef="${contextId}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(costs)}</ix:nonFraction></td></tr>
    <tr><td>Taxable profit</td><td><ix:nonFraction name="ct:TaxableProfit" contextRef="${contextId}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(taxable)}</ix:nonFraction></td></tr>
    <tr><td>Corporation tax charge</td><td><ix:nonFraction name="ct:CorporationTaxChargeable" contextRef="${contextId}" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(tax)}</ix:nonFraction></td></tr>
  </table>
</body>
</html>`;
}
