import { subtractPence, type Pence } from "@/server/money/pence";
import { ct600FiguresSchema } from "@/server/money/schemas";
import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import { attachmentsXml, buildCt600Attachments } from "@/server/hmrc/ct600/attachments";
import { escapeXml, penceToPoundsDisplay } from "@/server/hmrc/ct600/xml-utils";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";

export function computeTaxableProfit(figures: Ct600Figures): Pence {
  const f = ct600FiguresSchema.parse(figures);
  const costs = Number(f.costOfSalesPence) + Number(f.administrativeExpensesPence);
  const income = Number(f.turnoverPence) + Number(f.otherIncomePence);
  return subtractPence(income, costs);
}

export function computeTaxChargePence(taxableProfitPence: number): number {
  return Math.round(taxableProfitPence * 0.19);
}

export function buildCt600BodyInner(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  accountsDraft?: YearEndAccountsDraft | null;
  includeAttachments?: boolean;
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
  const attachments =
    opts.includeAttachments === false
      ? []
      : buildCt600Attachments({
          companyName: opts.companyName,
          companyNumber: opts.companyNumber,
          utr,
          figures,
          accountsDraft: opts.accountsDraft,
          taxableProfitPence: Number(taxable),
          taxChargePence: taxCharge,
        });

  const attached = attachmentsXml(attachments);

  const bodyInner = `<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys>
          <Key Type="UTR">${escapeXml(utr)}</Key>
        </Keys>
        <Period>
          <Start>${figures.periodStart}</Start>
          <End>${figures.periodEnd}</End>
        </Period>
        <DefaultCurrency>GBP</DefaultCurrency>
      </IRheader>
      <CompanyTaxReturn>
        <CompanyInformation>
          <CompanyName>${escapeXml(opts.companyName)}</CompanyName>
          <RegistrationNumber>${escapeXml(opts.companyNumber)}</RegistrationNumber>
        </CompanyInformation>
        <ReturnInfoBody>
          <CompanyInformation>
            <PeriodOfReturnFrom>${figures.periodStart}</PeriodOfReturnFrom>
            <PeriodOfReturnTo>${figures.periodEnd}</PeriodOfReturnTo>
          </CompanyInformation>
          <ReturnInfoSummary>
            <Turnover>${penceToPoundsDisplay(Number(figures.turnoverPence))}</Turnover>
            <TradingProfits>${penceToPoundsDisplay(Number(taxable))}</TradingProfits>
            <CorporationTaxChargeable>${penceToPoundsDisplay(taxCharge)}</CorporationTaxChargeable>
          </ReturnInfoSummary>
          <Accounts>
            <TangibleAssets>${penceToPoundsDisplay(Number(figures.tangibleAssetsPence))}</TangibleAssets>
            <CashAtBank>${penceToPoundsDisplay(Number(figures.cashAtBankPence))}</CashAtBank>
            <Debtors>${penceToPoundsDisplay(Number(figures.debtorsPence))}</Debtors>
            <Creditors>${penceToPoundsDisplay(Number(figures.creditorsPence))}</Creditors>
            <CalledUpShareCapital>${penceToPoundsDisplay(Number(figures.calledUpShareCapitalPence))}</CalledUpShareCapital>
            <ProfitAndLossAccount>${penceToPoundsDisplay(Number(figures.profitAndLossAccountPence))}</ProfitAndLossAccount>
          </Accounts>
          ${attached}
        </ReturnInfoBody>
      </CompanyTaxReturn>
    </IRenvelope>`;

  return {
    bodyInner,
    taxableProfitPence: Number(taxable),
    taxChargePence: taxCharge,
    attachments,
  };
}
