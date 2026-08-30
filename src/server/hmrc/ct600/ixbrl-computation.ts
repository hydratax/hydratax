import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import { getHmrcConfig } from "@/server/hmrc/config";
import { ixHtmlOpen } from "@/server/hmrc/ct600/ixbrl-shared";
import { ctComputationTaxonomy } from "@/server/hmrc/ct600/ixbrl-taxonomy";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";

const CH_SCHEME = "http://www.companieshouse.gov.uk/";

/** Corporation tax computation iXBRL attachment. */
export function buildComputationIxbrl(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): string {
  const { companyName, companyNumber, figures } = opts;
  const cfg = getHmrcConfig();
  const taxonomy = ctComputationTaxonomy(figures.periodEnd);
  const utr = opts.utr.replace(/\s+/g, "");
  const taxable = opts.taxableProfitPence;
  const tax = opts.taxChargePence;

  const companySegment = `<xbrli:segment><xbrldi:explicitMember dimension="ct-comp:BusinessTypeDimension">ct-comp:Company</xbrldi:explicitMember></xbrli:segment>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
${ixHtmlOpen(`xmlns:ct-comp="${taxonomy.ns}"`)}
<head>
  <title>${escapeXml(companyName)} tax computation</title>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8"/>
</head>
<body>
  <div style="display:none">
    <ix:header>
      <ix:hidden>
        <ix:nonNumeric name="ct-comp:NameOfProductionSoftware" contextRef="ctx-instant">${escapeXml(cfg.ctProductName)}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:VersionOfProductionSoftware" contextRef="ctx-instant">${escapeXml(cfg.vendorVersion)}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:CompanyName" contextRef="ctx-instant">${escapeXml(companyName)}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:TaxReference" contextRef="ctx-instant">${escapeXml(utr)}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:StartOfPeriodCoveredByReturn" contextRef="ctx-instant">${figures.periodStart}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:EndOfPeriodCoveredByReturn" contextRef="ctx-instant">${figures.periodEnd}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:PeriodOfAccountStartDate" contextRef="ctx-instant">${figures.periodStart}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:PeriodOfAccountEndDate" contextRef="ctx-instant">${figures.periodEnd}</ix:nonNumeric>
        <ix:nonNumeric name="ct-comp:CompanyIsAPartnerInAFirm" contextRef="ctx-period">false</ix:nonNumeric>
        <ix:nonFraction name="ct-comp:NetTradingProfits" contextRef="ctx-period" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(taxable)}</ix:nonFraction>
        <ix:nonFraction name="ct-comp:ProfitsBeforeOtherDeductionsAndReliefs" contextRef="ctx-period" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(taxable)}</ix:nonFraction>
        <ix:nonFraction name="ct-comp:CorporationTaxChargeable" contextRef="ctx-period" unitRef="GBP" decimals="2" format="ixt2:numdotdecimal">${penceToPoundsDisplay(tax)}</ix:nonFraction>
      </ix:hidden>
      <ix:references>
        <link:schemaRef xlink:type="simple" xlink:href="${taxonomy.entryPoint}"/>
      </ix:references>
      <ix:resources>
        <xbrli:context id="ctx-instant">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>
            ${companySegment}
          </xbrli:entity>
          <xbrli:period><xbrli:instant>${figures.periodEnd}</xbrli:instant></xbrli:period>
        </xbrli:context>
        <xbrli:context id="ctx-period">
          <xbrli:entity>
            <xbrli:identifier scheme="${CH_SCHEME}">${escapeXml(companyNumber)}</xbrli:identifier>
            ${companySegment}
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
  <p>${escapeXml(companyName)} · period ${figures.periodStart} to ${figures.periodEnd}</p>
  <p>Taxable profits: ${penceToPoundsDisplay(taxable)} · Corporation tax: ${penceToPoundsDisplay(tax)}</p>
</body>
</html>`;
}
