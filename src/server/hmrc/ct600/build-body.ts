import { subtractPence, type Pence } from "@/server/money/pence";
import { ct600FiguresSchema } from "@/server/money/schemas";
import type { Ct600Figures, Ct600PrincipalContact } from "@/server/hmrc/ct600/types";
import { attachmentsXml, buildCt600Attachments } from "@/server/hmrc/ct600/attachments";
import { ctTag } from "@/server/hmrc/ct600/ct-xml";
import { computeTaxChargePence } from "@/server/hmrc/ct600/tax-charge";
import { computeCt600TaxSchedule } from "@/server/hmrc/ct600/tax-schedule";
import { escapeXml } from "@/server/hmrc/ct600/xml-utils";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";

export { computeTaxChargePence } from "@/server/hmrc/ct600/tax-charge";

export function computeTaxableProfit(figures: Ct600Figures): Pence {
  const f = ct600FiguresSchema.parse(figures);
  const costs = Number(f.costOfSalesPence) + Number(f.administrativeExpensesPence);
  const income = Number(f.turnoverPence) + Number(f.otherIncomePence);
  return subtractPence(income, costs);
}

function poundsWhole(pounds: number): string {
  return `${Math.trunc(pounds).toFixed(2)}`;
}

function moneyFromPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function financialYearXml(
  tag: "FinancialYearOne" | "FinancialYearTwo",
  fy: number,
  profitPounds: number,
  taxPence: number,
  rateXml: string,
): string {
  return `<${ctTag(tag)}>
          <${ctTag("Year")}>${fy}</${ctTag("Year")}>
          <${ctTag("Details")}>
            <${ctTag("Profit")}>${poundsWhole(profitPounds)}</${ctTag("Profit")}>
            <${ctTag("TaxRate")}>${escapeXml(rateXml)}</${ctTag("TaxRate")}>
            <${ctTag("Tax")}>${moneyFromPence(taxPence)}</${ctTag("Tax")}>
          </${ctTag("Details")}>
        </${ctTag(tag)}>`;
}

export function buildCt600BodyInner(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  accountsDraft?: YearEndAccountsDraft | null;
  includeAttachments?: boolean;
  declarantName?: string | null;
  declarantStatus?: string | null;
  contact?: Ct600PrincipalContact | null;
  sender?: string;
}): {
  bodyInner: string;
  taxableProfitPence: number;
  taxChargePence: number;
  attachments: ReturnType<typeof buildCt600Attachments>;
} {
  const figures = ct600FiguresSchema.parse(opts.figures);
  const utr = String(opts.utr).replace(/\s+/g, "");
  const taxable = computeTaxableProfit(figures);
  const taxablePence = Number(taxable);
  const schedule = computeCt600TaxSchedule({
    periodStart: figures.periodStart,
    periodEnd: figures.periodEnd,
    taxableProfitPence: taxablePence,
  });
  const taxCharge = schedule.netTaxPence;
  const tradingPence = Math.max(
    0,
    Number(figures.turnoverPence) -
      Number(figures.costOfSalesPence) -
      Number(figures.administrativeExpensesPence),
  );
  const tradingPounds = Math.trunc(tradingPence / 100);
  const turnoverPounds = Math.trunc(Number(figures.turnoverPence) / 100);
  const chargeablePounds = schedule.chargeableProfitPounds;
  const declarant =
    opts.declarantName?.trim() || "Director";
  const declarantStatus = opts.declarantStatus?.trim() || "Director";
  const sender = opts.sender?.trim() || "Company";

  const attachments =
    opts.includeAttachments === false
      ? []
      : buildCt600Attachments({
          companyName: opts.companyName,
          companyNumber: opts.companyNumber,
          utr,
          figures,
          accountsDraft: opts.accountsDraft,
          taxableProfitPence: chargeablePounds * 100,
          taxChargePence: taxCharge,
          declarantName: declarant,
          declarantStatus,
        });

  const attached = attachmentsXml(attachments);

  const fyOne = schedule.slices[0];
  const fyTwo = schedule.slices[1];

  const fyXml = [
    fyOne
      ? financialYearXml(
          "FinancialYearOne",
          fyOne.fy,
          fyOne.profitPounds,
          fyOne.taxPence,
          fyOne.rateXml,
        )
      : "",
    fyTwo
      ? financialYearXml(
          "FinancialYearTwo",
          fyTwo.fy,
          fyTwo.profitPounds,
          fyTwo.taxPence,
          fyTwo.rateXml,
        )
      : "",
  ].join("");

  // Live CT XSD (HMRC-CT-2014-v1-994): box 435 is MarginalReliefForRingFenceTrades
  // (used for ordinary marginal relief as well — Schematron F220.3).
  const marginalXml =
    schedule.marginalReliefPence > 0
      ? `<${ctTag("MarginalReliefForRingFenceTrades")}>${moneyFromPence(schedule.marginalReliefPence)}</${ctTag("MarginalReliefForRingFenceTrades")}>`
      : "";

  // Boxes 326 + 329 — CT XSD / Schematron N049 (error 9240):
  // if AssociatedCompanies is present, ThisPeriod (326) OR FY pair (327/328) is required.
  const associatedCompaniesXml = schedule.claimSmallProfitsOrMarginalRelief
    ? `<${ctTag("AssociatedCompanies")}>
              <${ctTag("ThisPeriod")}>0</${ctTag("ThisPeriod")}>
              <${ctTag("StartingOrSmallCompaniesRate")}>yes</${ctTag("StartingOrSmallCompaniesRate")}>
            </${ctTag("AssociatedCompanies")}>`
    : "";

  const t = ctTag;
  const bodyInner = `<${t("IRenvelope")}>
      <${t("IRheader")}>
        <${t("Keys")}>
          <${t("Key")} Type="UTR">${escapeXml(utr)}</${t("Key")}>
        </${t("Keys")}>
        <${t("PeriodEnd")}>${figures.periodEnd}</${t("PeriodEnd")}>
        <${t("DefaultCurrency")}>GBP</${t("DefaultCurrency")}>
        <${t("Sender")}>${escapeXml(sender)}</${t("Sender")}>
      </${t("IRheader")}>
      <${t("CompanyTaxReturn")} ReturnType="new">
        <${t("CompanyInformation")}>
          <${t("CompanyName")}>${escapeXml(opts.companyName)}</${t("CompanyName")}>
          <${t("RegistrationNumber")}>${escapeXml(opts.companyNumber)}</${t("RegistrationNumber")}>
          <${t("Reference")}>${escapeXml(utr)}</${t("Reference")}>
          <${t("CompanyType")}>00</${t("CompanyType")}>
          <${t("PeriodCovered")}>
            <${t("From")}>${figures.periodStart}</${t("From")}>
            <${t("To")}>${figures.periodEnd}</${t("To")}>
          </${t("PeriodCovered")}>
        </${t("CompanyInformation")}>
        <${t("ReturnInfoSummary")}>
          <${t("Accounts")}>
            <${t("ThisPeriodAccounts")}>yes</${t("ThisPeriodAccounts")}>
          </${t("Accounts")}>
          <${t("Computations")}>
            <${t("ThisPeriodComputations")}>yes</${t("ThisPeriodComputations")}>
          </${t("Computations")}>
        </${t("ReturnInfoSummary")}>
        <${t("Turnover")}>
          <${t("Total")}>${poundsWhole(turnoverPounds)}</${t("Total")}>
        </${t("Turnover")}>
        <${t("CompanyTaxCalculation")}>
          <${t("Income")}>
            <${t("Trading")}>
              <${t("Profits")}>${poundsWhole(tradingPounds)}</${t("Profits")}>
              <${t("NetProfits")}>${poundsWhole(tradingPounds)}</${t("NetProfits")}>
            </${t("Trading")}>
          </${t("Income")}>
          <${t("ProfitsBeforeOtherDeductions")}>${poundsWhole(chargeablePounds)}</${t("ProfitsBeforeOtherDeductions")}>
          <${t("ChargesAndReliefs")}>
            <${t("ProfitsBeforeDonationsAndGroupRelief")}>${poundsWhole(chargeablePounds)}</${t("ProfitsBeforeDonationsAndGroupRelief")}>
          </${t("ChargesAndReliefs")}>
          <${t("ChargeableProfits")}>${poundsWhole(chargeablePounds)}</${t("ChargeableProfits")}>
          <${t("CorporationTaxChargeable")}>
            ${associatedCompaniesXml}
            ${fyXml}
          </${t("CorporationTaxChargeable")}>
          <${t("CorporationTax")}>${moneyFromPence(schedule.grossTaxPence)}</${t("CorporationTax")}>
          ${marginalXml}
          <${t("NetCorporationTaxChargeable")}>${moneyFromPence(taxCharge)}</${t("NetCorporationTaxChargeable")}>
        </${t("CompanyTaxCalculation")}>
        <${t("CalculationOfTaxOutstandingOrOverpaid")}>
          <${t("NetCorporationTaxLiability")}>${moneyFromPence(taxCharge)}</${t("NetCorporationTaxLiability")}>
          <${t("TaxChargeable")}>${moneyFromPence(taxCharge)}</${t("TaxChargeable")}>
          <${t("TaxPayable")}>${moneyFromPence(taxCharge)}</${t("TaxPayable")}>
          <${t("TaxPayableIncludingRestitutionTax")}>${moneyFromPence(taxCharge)}</${t("TaxPayableIncludingRestitutionTax")}>
        </${t("CalculationOfTaxOutstandingOrOverpaid")}>
        <${t("AllowancesAndCharges")}>
          <${t("AIACapitalAllowancesInc")}>${poundsWhole(0)}</${t("AIACapitalAllowancesInc")}>
        </${t("AllowancesAndCharges")}>
        <${t("OverpaymentsAndRepayments")}/>
        <${t("Declaration")}>
          <${t("AcceptDeclaration")}>yes</${t("AcceptDeclaration")}>
          <${t("Name")}>${escapeXml(declarant.toUpperCase())}</${t("Name")}>
          <${t("Status")}>${escapeXml(declarantStatus)}</${t("Status")}>
        </${t("Declaration")}>
        ${attached}
      </${t("CompanyTaxReturn")}>
    </${t("IRenvelope")}>`;

  return {
    bodyInner,
    taxableProfitPence: chargeablePounds * 100,
    taxChargePence: taxCharge,
    attachments,
  };
}
