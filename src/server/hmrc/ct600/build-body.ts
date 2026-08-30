import { subtractPence, type Pence } from "@/server/money/pence";
import { ct600FiguresSchema } from "@/server/money/schemas";
import type { Ct600Figures, Ct600PrincipalContact } from "@/server/hmrc/ct600/types";
import { attachmentsXml, buildCt600Attachments } from "@/server/hmrc/ct600/attachments";
import { ctTag } from "@/server/hmrc/ct600/ct-xml";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";

const CT_RATE_LEGACY = "19.00";
const CT_RATE_MAIN = "25.00";

function ctRateForFinancialYear(fy: number): string {
  return fy >= 2023 ? CT_RATE_MAIN : CT_RATE_LEGACY;
}

function computeTaxForSlice(profitPence: number, fy: number): number {
  if (profitPence <= 0) return 0;
  const rate = fy >= 2023 ? 0.25 : 0.19;
  return Math.round(profitPence * rate);
}

export function computeTaxableProfit(figures: Ct600Figures): Pence {
  const f = ct600FiguresSchema.parse(figures);
  const costs = Number(f.costOfSalesPence) + Number(f.administrativeExpensesPence);
  const income = Number(f.turnoverPence) + Number(f.otherIncomePence);
  return subtractPence(income, costs);
}

export function computeTaxChargePence(taxableProfitPence: number): number {
  return Math.round(taxableProfitPence * 0.25);
}

function poundsFromPence(pence: number): string {
  const whole = Math.trunc(pence / 100);
  return `${whole.toFixed(2)}`;
}

function moneyFromPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function financialYearStart(date: Date): number {
  const y = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (month < 3 || (month === 3 && day < 1)) return y - 1;
  return y;
}

function endOfFinancialYear(fyStart: number): Date {
  return new Date(Date.UTC(fyStart + 1, 2, 31));
}

function apportionByFinancialYear(
  periodStart: string,
  periodEnd: string,
  amountPence: number,
): Array<{ fy: number; pence: number }> {
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  const totalDays = daysInclusive(start, end);
  if (totalDays <= 0) return [];

  if (amountPence <= 0) {
    const slices = new Map<number, number>();
    let cursor = start;
    while (cursor <= end) {
      const fy = financialYearStart(cursor);
      const sliceEnd = endOfFinancialYear(fy);
      const periodSliceEnd = sliceEnd < end ? sliceEnd : end;
      slices.set(fy, 0);
      cursor = new Date(periodSliceEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return [...slices.entries()]
      .sort(([a], [b]) => a - b)
      .map(([fy]) => ({ fy, pence: 0 }));
  }

  const slices = new Map<number, number>();
  let cursor = start;
  while (cursor <= end) {
    const fy = financialYearStart(cursor);
    const sliceEnd = endOfFinancialYear(fy);
    const periodSliceEnd = sliceEnd < end ? sliceEnd : end;
    const days = daysInclusive(cursor, periodSliceEnd);
    const share = Math.round((amountPence * days) / totalDays);
    slices.set(fy, (slices.get(fy) ?? 0) + share);
    cursor = new Date(periodSliceEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...slices.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fy, pence]) => ({ fy, pence }));
}

function financialYearXml(
  tag: "FinancialYearOne" | "FinancialYearTwo",
  fy: number,
  profitPence: number,
  taxPence: number,
): string {
  return `<${ctTag(tag)}>
          <${ctTag("Year")}>${fy}</${ctTag("Year")}>
          <${ctTag("Details")}>
            <${ctTag("Profit")}>${poundsFromPence(profitPence)}</${ctTag("Profit")}>
            <${ctTag("TaxRate")}>${ctRateForFinancialYear(fy)}</${ctTag("TaxRate")}>
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
  const taxCharge = computeTaxChargePence(Number(taxable));
  const taxablePence = Number(taxable);
  const tradingPence = Math.max(
    0,
    Number(figures.turnoverPence) -
      Number(figures.costOfSalesPence) -
      Number(figures.administrativeExpensesPence),
  );
  const turnoverPence = Number(figures.turnoverPence);
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
          taxableProfitPence: taxablePence,
          taxChargePence: taxCharge,
          declarantName: declarant,
          declarantStatus,
        });

  const attached = attachmentsXml(attachments);

  const profitSlices = apportionByFinancialYear(
    figures.periodStart,
    figures.periodEnd,
    taxablePence,
  );
  const taxSlices = apportionByFinancialYear(
    figures.periodStart,
    figures.periodEnd,
    taxCharge,
  );
  const fyOne = profitSlices[0];
  const fyTwo = profitSlices[1];
  const taxOne = fyOne
    ? computeTaxForSlice(fyOne.pence, fyOne.fy)
    : 0;
  const taxTwo = fyTwo
    ? computeTaxForSlice(fyTwo.pence, fyTwo.fy)
    : 0;

  const fyXml = [
    fyOne
      ? financialYearXml("FinancialYearOne", fyOne.fy, fyOne.pence, taxOne)
      : "",
    fyTwo
      ? financialYearXml("FinancialYearTwo", fyTwo.fy, fyTwo.pence, taxTwo)
      : "",
  ].join("");

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
          <${t("Total")}>${poundsFromPence(turnoverPence)}</${t("Total")}>
        </${t("Turnover")}>
        <${t("CompanyTaxCalculation")}>
          <${t("Income")}>
            <${t("Trading")}>
              <${t("Profits")}>${poundsFromPence(tradingPence)}</${t("Profits")}>
              <${t("NetProfits")}>${poundsFromPence(tradingPence)}</${t("NetProfits")}>
            </${t("Trading")}>
          </${t("Income")}>
          <${t("ProfitsBeforeOtherDeductions")}>${poundsFromPence(taxablePence)}</${t("ProfitsBeforeOtherDeductions")}>
          <${t("ChargesAndReliefs")}>
            <${t("ProfitsBeforeDonationsAndGroupRelief")}>${poundsFromPence(taxablePence)}</${t("ProfitsBeforeDonationsAndGroupRelief")}>
          </${t("ChargesAndReliefs")}>
          <${t("ChargeableProfits")}>${poundsFromPence(taxablePence)}</${t("ChargeableProfits")}>
          <${t("CorporationTaxChargeable")}>
            ${fyXml}
          </${t("CorporationTaxChargeable")}>
          <${t("CorporationTax")}>${moneyFromPence(taxCharge)}</${t("CorporationTax")}>
          <${t("NetCorporationTaxChargeable")}>${moneyFromPence(taxCharge)}</${t("NetCorporationTaxChargeable")}>
        </${t("CompanyTaxCalculation")}>
        <${t("CalculationOfTaxOutstandingOrOverpaid")}>
          <${t("NetCorporationTaxLiability")}>${moneyFromPence(taxCharge)}</${t("NetCorporationTaxLiability")}>
          <${t("TaxChargeable")}>${moneyFromPence(taxCharge)}</${t("TaxChargeable")}>
          <${t("TaxPayable")}>${moneyFromPence(taxCharge)}</${t("TaxPayable")}>
          <${t("TaxPayableIncludingRestitutionTax")}>${moneyFromPence(taxCharge)}</${t("TaxPayableIncludingRestitutionTax")}>
        </${t("CalculationOfTaxOutstandingOrOverpaid")}>
        <${t("AllowancesAndCharges")}>
          <${t("AIACapitalAllowancesInc")}>${poundsFromPence(0)}</${t("AIACapitalAllowancesInc")}>
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
    taxableProfitPence: taxablePence,
    taxChargePence: taxCharge,
    attachments,
  };
}
