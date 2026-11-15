import { escapeXml } from "@/server/hmrc/ct600/xml-utils";
import { parseSaTaxYearLabel } from "@/lib/sa-tax-year";
import {
  employmentBenefitsTotal,
  employmentExpensesTotal,
  propExpensesBreakdownTotal,
  seCapitalAllowancesBreakdownTotal,
  seExpensesBreakdownTotal,
  type EmploymentRow,
  type Sa100Draft,
} from "@/lib/sa100/schema";
import { calculateSa302 } from "@/lib/sa100/calculate";
import {
  computeRtiIrmark,
  injectRtiIrmark,
} from "@/server/hmrc/rti-irmark";

/**
 * Official Individual RIM MTR namespace:
 * tax year 2025-26 → http://www.govtalk.gov.uk/taxation/SA/SA100/25-26/1
 * (from HMRC-RIM-MTR-2026 artefacts under fixtures/hmrc-sa/25-26).
 */
export function saMtrNamespace(taxYearLabel: string): string {
  const year = parseSaTaxYearLabel(taxYearLabel);
  if (!year) throw new Error(`Invalid tax year ${taxYearLabel}`);
  const short = `${String(year.start.slice(2, 4))}-${year.end.slice(2, 4)}`;
  return `http://www.govtalk.gov.uk/taxation/SA/SA100/${short}/1`;
}

export function saFixtureTaxYearDir(taxYearLabel: string): string {
  const year = parseSaTaxYearLabel(taxYearLabel);
  if (!year) throw new Error(`Invalid tax year ${taxYearLabel}`);
  return `${year.start.slice(2, 4)}-${year.end.slice(2, 4)}`;
}

/** HMRC MTR_IRdecimalType: always two fractional digits. */
function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(2);
}

function yes(): string {
  return "yes";
}

function yn(v: boolean): string {
  return v ? "yes" : "no";
}

function el(name: string, value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return `<${name}>${escapeXml(value)}</${name}>`;
}

/** Omit non-zero-only money fields when value is 0. */
function moneyNZ(name: string, n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return el(name, money(n));
}

function moneyAllowZero(name: string, n: number): string {
  if (!Number.isFinite(n)) return "";
  return el(name, money(n));
}

/**
 * Live electronic subset supported by this builder + XSD harness.
 * Partnership / foreign / trusts / CGT / residence remain blocked.
 */
export function unsupportedSaLivePages(draft: Sa100Draft): string[] {
  const unsupported: string[] = [];
  if (draft.hasPartnership) unsupported.push("partnership (SA104)");
  if (draft.hasForeign) unsupported.push("foreign (SA106)");
  if (draft.hasTrusts) unsupported.push("trusts (SA107)");
  if (draft.hasCapitalGains) unsupported.push("capital gains (SA108)");
  if (draft.hasResidenceFig) unsupported.push("residence (SA109)");
  return unsupported;
}

export function assertSaLivePayloadSupported(draft: Sa100Draft): void {
  const unsupported = unsupportedSaLivePages(draft);
  if (unsupported.length > 0) {
    throw new Error(
      `This return includes ${unsupported.join(", ")}, which is not yet in the electronic SA Online live subset. Remove those pages or use Demo / PDF only.`,
    );
  }
}

function buildSa102(e: EmploymentRow): string {
  const benefits = employmentBenefitsTotal(e);
  const expenses = employmentExpensesTotal(e);
  const paye = e.payeRef.replace(/\s+/g, "").trim();
  if (!paye) {
    throw new Error("Each employment needs an Employer PAYE reference for live SA submit.");
  }

  const benefitsXml =
    benefits > 0
      ? `<Benefits>
      ${moneyNZ("CompanyCarsAndVansBenefit", e.benefitCars)}
      ${moneyNZ("FuelForCarsAndVans", e.benefitFuel)}
      ${moneyNZ("PrivateMedicalDentalInsurance", e.benefitMedical)}
      ${moneyNZ("VouchersCreditCardsExcessMileageAllowance", e.benefitVouchers)}
      ${moneyNZ("GoodsEtcProvidedByEmployer", e.benefitGoods)}
      ${moneyNZ("AccommodationProvidedByEmployer", e.benefitAccommodation)}
      ${moneyNZ("OtherBenefits", e.benefitOther || (benefits > 0 && !e.benefitCars && !e.benefitFuel && !e.benefitMedical && !e.benefitVouchers && !e.benefitGoods && !e.benefitAccommodation && !e.benefitExpensesPayments ? e.benefits : 0))}
      ${moneyNZ("ExpensesPaymentsReceived", e.benefitExpensesPayments)}
    </Benefits>`
      : "";

  const expensesXml =
    expenses > 0
      ? `<Expenses>
      ${moneyNZ("BusinessTravelAndSubsistence", e.expenseTravel)}
      ${moneyNZ("FixedExpensesDeductions", e.expenseFixed)}
      ${moneyNZ("ProfessionalFeesAndSubscriptions", e.expenseProfessional)}
      ${moneyNZ("OtherExpensesAndCapitalAllowances", e.expenseOther)}
    </Expenses>`
      : "";

  return `<SA102>
    <Employment>
      ${moneyAllowZero("PayFromEmployment", e.pay)}
      ${moneyNZ("PayrolledBenefits", e.payrolledBenefitsStudentLoan)}
      ${moneyAllowZero("TaxTakenOffPay", e.taxTakenOff)}
      ${moneyNZ("TipsAndOtherPayments", e.tips)}
      <EmployerPAYEReference>${escapeXml(paye)}</EmployerPAYEReference>
      ${el("EmployersName", e.employerName.trim() || "Employer")}
      <CompanyDirector>${yn(e.wasDirector)}</CompanyDirector>
      ${e.wasDirector && e.directorCeasedDate ? el("DateCeasedBeingADirector", e.directorCeasedDate) : ""}
      ${e.wasCloseCompany ? `<CloseCompany>${yn(true)}</CloseCompany>` : ""}
      ${e.wasCloseCompany && e.closeCompanyName ? el("CloseCompanyName", e.closeCompanyName) : ""}
      ${e.wasCloseCompany && e.closeCompanyNumber ? el("CompanyRegistrationNo", e.closeCompanyNumber) : ""}
      ${e.wasCloseCompany ? moneyAllowZero("CloseCompanyDividend", e.closeCompanyDividends) : ""}
      ${e.offPayroll ? `<OffPayrollWorking>${yes()}</OffPayrollWorking>` : ""}
    </Employment>
    ${benefitsXml}
    ${expensesXml}
  </SA102>`;
}

function sePostcode(d: Sa100Draft): string {
  return (
    (d.seBusinessAddress.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)?.[1] ?? "")
      .replace(/\s+/g, " ")
      .toUpperCase()
      .slice(0, 8)
  );
}

function buildSa103(d: Sa100Draft, taxpayerName: string, profit: number): string {
  const broken = seExpensesBreakdownTotal(d);
  const useFull = broken > 0;
  const businessName = d.seBusinessName.trim() || taxpayerName;
  const description = d.seDescription.trim() || "Trade";
  const postcode = sePostcode(d);

  const income = `<BusinessIncome>
    ${moneyAllowZero("Turnover", d.seTurnover)}
    ${moneyNZ("OtherBusinessIncome", d.seOtherBusinessIncome)}
    ${moneyNZ("TradingIncomeAllowance", d.seTradingAllowance)}
  </BusinessIncome>`;

  if (!useFull) {
    // SA103S BusinessDetails sequence differs from SA103F (no BusinessName).
    const detailsS = `<BusinessDetails>
      <BusinessDescription>${escapeXml(description.slice(0, 30))}</BusinessDescription>
      ${postcode ? el("BusinessAddressPostcode", postcode) : ""}
      <DidYourBusinessStart>${yn(d.seStartedAfter)}</DidYourBusinessStart>
      ${d.seStartedAfter && d.seStartDate ? el("DateBusinessStarted", d.seStartDate) : ""}
      <DidYourBusinessCease>${yn(d.seCeased)}</DidYourBusinessCease>
      ${d.seCeased && d.seCeaseDate ? el("DateBusinessCeased", d.seCeaseDate) : ""}
      ${d.seBooksTo ? el("DateBusinessBooksAreMadeUpTo", d.seBooksTo) : ""}
      ${!d.seCashBasis ? `<ElectionToOptOutOfCashBasis>${yes()}</ElectionToOptOutOfCashBasis>` : ""}
    </BusinessDetails>`;
    const expenses = d.seExpenses;
    return `<SA103S>
      ${detailsS}
      ${income}
      ${
        expenses > 0
          ? `<AllowableBusinessExpenses>
        ${moneyAllowZero("TotalAllowableExpenses", expenses)}
      </AllowableBusinessExpenses>`
          : ""
      }
      ${moneyAllowZero("NetProfitOrLoss", profit)}
      ${
        d.seCapitalAllowances > 0
          ? `<CapitalAllowances>
        ${moneyNZ("TotalCapitalAllowances", d.seCapitalAllowances)}
      </CapitalAllowances>`
          : ""
      }
      <ProfitsLossesNICsAndCIS>
        ${moneyAllowZero("TotalTaxableBusinessProfits", Math.max(0, profit))}
        ${moneyNZ("SubContractorsTaxDeduction", d.seCisDeductions + d.seTaxTakenOff)}
      </ProfitsLossesNICsAndCIS>
    </SA103S>`;
  }

  const detailsF = `<BusinessDetails>
    <BusinessName>${escapeXml(businessName.slice(0, 56))}</BusinessName>
    <BusinessDescription>${escapeXml(description.slice(0, 30))}</BusinessDescription>
    ${postcode ? el("BusinessAddressPostcode", postcode) : ""}
    <DidYourBusinessStart>${yn(d.seStartedAfter)}</DidYourBusinessStart>
    ${d.seStartedAfter && d.seStartDate ? el("DateBusinessStarted", d.seStartDate) : ""}
    <DidYourBusinessCease>${yn(d.seCeased)}</DidYourBusinessCease>
    ${d.seCeased && d.seCeaseDate ? el("DateBusinessCeased", d.seCeaseDate) : ""}
    ${d.seBooksFrom ? el("DateAccountingPeriodStarts", d.seBooksFrom) : ""}
    ${d.seBooksTo ? el("DateAccountingPeriodEnds", d.seBooksTo) : ""}
    ${!d.seCashBasis ? `<ElectionToOptOutOfCashBasis>${yes()}</ElectionToOptOutOfCashBasis>` : ""}
  </BusinessDetails>`;

  const ca = seCapitalAllowancesBreakdownTotal(d);
  return `<SA103F>
    ${detailsF}
    ${income}
    <BusinessExpenses>
      <TotalExpenses>
        ${moneyNZ("CostOfGoods", d.seCostOfGoods)}
        ${moneyNZ("SubcontractorCosts", d.seCisSubcontractors)}
        ${moneyNZ("WagesSalariesAndStaffCosts", d.seWages)}
        ${moneyNZ("CarVanAndTravelExpenses", d.seCarVanTravel)}
        ${moneyNZ("RentAndOtherPropertyCosts", d.seRentPowerInsurance)}
        ${moneyNZ("RepairsAndMaintenanceCosts", d.seRepairs)}
        ${moneyNZ("PhoneAndOtherOfficeCosts", d.sePhoneOffice)}
        ${moneyNZ("AdvertisingAndEntertainmentCosts", d.seAdvertising)}
        ${moneyNZ("BankAndLoanInterest", d.seInterest)}
        ${moneyNZ("OtherFinanceCharges", d.seBankCharges)}
        ${moneyNZ("DebtsWrittenOff", d.seBadDebts)}
        ${moneyNZ("AccountancyAndLegalFees", d.seProfessionalFees)}
        ${moneyNZ("DepreciationAndLossProfitOnSale", d.seDepreciation)}
        ${moneyNZ("OtherBusinessExpenses", d.seOtherExpensesDetail)}
        ${moneyAllowZero("TotalExpenses", broken)}
      </TotalExpenses>
      ${d.seDisallowableTotal > 0 ? moneyAllowZero("DisallowableExpenses", d.seDisallowableTotal) : ""}
    </BusinessExpenses>
    ${moneyAllowZero("NetProfitLoss", profit + (ca || d.seCapitalAllowances))}
    ${
      ca > 0 || d.seCapitalAllowances > 0
        ? `<CapitalAllowances>
      ${moneyNZ("AnnualInvestmentAllowance", d.seAia)}
      ${moneyNZ("ZeroEmissionGoodsVehicleAllowance", d.seZeroEmissionGoods)}
      ${moneyNZ("ZeroEmissionCarAllowance", d.seZeroEmissionCar)}
      ${moneyNZ("TheStructuresAndBuildingsAllowance", d.seSba)}
      ${moneyNZ("FreeportAndInvestmentZonesStructuresAndBuildingsAllowance", d.seFreeportSba)}
      ${moneyNZ("ElectricChargePointAllowance", d.seElectricCharge)}
      ${moneyNZ("OtherCapitalAllowances", d.seEnhancedCa)}
      ${moneyNZ("TotalCapitalAllowances", ca || d.seCapitalAllowances)}
    </CapitalAllowances>`
        : ""
    }
    <TaxableProfitOrLoss>
      ${moneyAllowZero("TotalTaxableBusinessProfits", Math.max(0, profit))}
    </TaxableProfitOrLoss>
    <TaxTakenOff>
      ${moneyNZ("SubContractorsTaxDeduction", d.seCisDeductions)}
      ${moneyNZ("OtherTaxTakenOffTradingIncome", d.seTaxTakenOff)}
    </TaxTakenOff>
  </SA103F>`;
}

function buildSa105(d: Sa100Draft, profit: number): string {
  const expenses = (() => {
    const broken = propExpensesBreakdownTotal(d);
    return broken > 0 ? broken : d.propExpenses;
  })();
  return `<SA105>
    <UKPropertyDetails>
      <NumberOfProperties>${Math.max(1, d.propPropertyCount || 1)}</NumberOfProperties>
    </UKPropertyDetails>
    <PropertyIncomeAndExpenses>
      ${moneyAllowZero("TotalRentsAndOtherIncomeFromProperty", d.propRents)}
      ${moneyNZ("TaxTakenOffAnyIncome", d.propTaxTakenOff)}
      ${moneyNZ("RentRatesInsuranceAndGroundRents", d.propRentRatesInsurance)}
      ${moneyNZ("RepairsAndMaintenance", d.propRepairs)}
      ${moneyNZ("AllowableInterestAndOtherFinancialCharges", d.propNonResFinance)}
      ${moneyNZ("LegalManagementAndProfessionalFees", d.propLegalFees)}
      ${moneyNZ("CostsOfServicesProvided", d.propServices)}
      ${moneyNZ("OtherPropertyExpenses", d.propOtherExpensesDetail || (expenses > 0 && !propExpensesBreakdownTotal(d) ? d.propExpenses : 0))}
    </PropertyIncomeAndExpenses>
    <TaxableProfitOrLoss>
      ${moneyAllowZero("TaxableProfitForTheYear", Math.max(0, profit))}
      ${moneyNZ("ResidentialFinanceCosts", d.propFinanceCosts)}
    </TaxableProfitOrLoss>
  </SA105>`;
}

/**
 * Build SA Online IRenvelope body (MTR) from the desk draft against official
 * Individual RIM artefacts (fixtures/hmrc-sa/{taxYear}/MTR-*.xsd).
 */
export function buildSa100BodyInner(opts: {
  draft: Sa100Draft;
  taxpayerName: string;
  /** Rest of UK U / Scottish S / Welsh C — defaults to U. */
  taxpayerStatus?: "U" | "S" | "C";
}): string {
  const d = opts.draft;
  assertSaLivePayloadSupported(d);
  const year = parseSaTaxYearLabel(d.taxYear);
  if (!year) throw new Error(`Invalid tax year ${d.taxYear}`);
  const ns = saMtrNamespace(d.taxYear);
  const utr = d.utr.replace(/\s/g, "");
  if (!/^\d{10}$/.test(utr)) {
    throw new Error("A valid 10-digit personal UTR is required for live SA submit.");
  }
  const nino = d.nino.replace(/\s/g, "").toUpperCase();
  if (!nino) throw new Error("NINO is required for live SA submit.");

  const calc = calculateSa302(d);
  const periodEnd = year.end;
  const status = opts.taxpayerStatus ?? "U";
  const name = (opts.taxpayerName || d.declarationName || "Taxpayer").slice(0, 56);

  const employments = d.hasEmployment
    ? d.employments.filter(
        (e) => e.pay > 0 || e.taxTakenOff > 0 || e.employerName.trim() || e.payeRef.trim(),
      )
    : [];

  const sa102Xml = employments.map(buildSa102).join("\n");
  const sa103Xml = d.hasSelfEmployment
    ? buildSa103(d, name, calc.selfEmploymentProfit)
    : "";
  const sa105Xml = d.hasUkProperty ? buildSa105(d, calc.propertyProfit) : "";

  const yourTaxReturn = `<YourTaxReturn>
    ${employments.length ? `<EmploymentSchedule>${yes()}</EmploymentSchedule><NumberOfEmploymentSchedules>${employments.length}</NumberOfEmploymentSchedules>` : ""}
    ${
      d.hasSelfEmployment
        ? seExpensesBreakdownTotal(d) > 0
          ? `<FullSelfEmploymentSchedule>${yes()}</FullSelfEmploymentSchedule><NumberOfFullSelfEmploymentSchedules>1</NumberOfFullSelfEmploymentSchedules>`
          : `<ShortSelfEmploymentSchedule>${yes()}</ShortSelfEmploymentSchedule><NumberOfShortSelfEmploymentSchedules>1</NumberOfShortSelfEmploymentSchedules>`
        : ""
    }
    ${d.hasUkProperty ? `<UKPropertySchedule>${yes()}</UKPropertySchedule>` : ""}
  </YourTaxReturn>`;

  const interestDividends = (() => {
    const parts = [
      moneyAllowZero("TaxedBankBuildingSocietyEtcInterest", d.interestTaxedUk),
      moneyAllowZero("UntaxedUKinterestEtc", d.interestUntaxedUk),
      moneyNZ("UntaxedForeignInterest", d.interestUntaxedForeign),
      moneyAllowZero("CompanyDividends", d.dividendsUk),
      moneyNZ("UnitTrustEtcDividends", d.dividendsOther),
      moneyNZ("ForeignDividends", d.dividendsForeign),
    ].filter(Boolean);
    return parts.length
      ? `<UKInterestAndDividends>${parts.join("\n")}</UKInterestAndDividends>`
      : "";
  })();

  const stateBenefits = (() => {
    const parts = [
      moneyNZ("AnnualStatePension", d.statePension),
      moneyNZ("OtherPensionsAndRetirementAnnuities", d.otherPensions),
    ].filter(Boolean);
    return parts.length ? `<StateBenefits>${parts.join("\n")}</StateBenefits>` : "";
  })();

  const incomeXml =
    interestDividends || stateBenefits
      ? `<Income>
      ${interestDividends}
      ${stateBenefits}
    </Income>`
      : "";

  const sa100 = `<SA100>
    <YourPersonalDetails>
      ${d.dateOfBirth ? el("DateOfBirth", d.dateOfBirth) : ""}
      ${d.phone ? el("TelephoneNumber", d.phone.slice(0, 20)) : ""}
      <NationalInsuranceNumber>${escapeXml(nino)}</NationalInsuranceNumber>
      <TaxpayerStatus>${status}</TaxpayerStatus>
    </YourPersonalDetails>
    ${yourTaxReturn}
    ${incomeXml}
    <FinishingYourTaxReturn>
      <SigningYourForm>
        ${d.signedCapacity.trim() ? el("CapacityOfPersonSigning", d.signedCapacity.trim().slice(0, 30)) : ""}
        ${el("NameOfPersonSigning", (d.declarationName.trim() || name).slice(0, 56))}
      </SigningYourForm>
    </FinishingYourTaxReturn>
  </SA100>`;

  const totalTaxEtcDue = calc.incomeTax + calc.class4Nic;
  const sa110 = `<SA110>
    <SelfAssessment>
      <TotalTaxEtcDue>${money(totalTaxEtcDue)}</TotalTaxEtcDue>
      ${moneyNZ("Class4NICsDue", calc.class4Nic)}
    </SelfAssessment>
    <UnderpaidTax></UnderpaidTax>
  </SA110>`;

  const bodyWithoutMark = `<IRenvelope xmlns="${ns}">
  <IRheader>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>
    <PeriodEnd>${escapeXml(periodEnd)}</PeriodEnd>
    <DefaultCurrency>GBP</DefaultCurrency>
    <Sender>Agent</Sender>
  </IRheader>
  <MTR>
    ${sa100}
    ${sa102Xml}
    ${sa103Xml}
    ${sa105Xml}
    ${sa110}
    <TaxpayerName>${escapeXml(name)}</TaxpayerName>
    <Declaration>
      <IndividualDeclaration>${yes()}</IndividualDeclaration>
    </Declaration>
  </MTR>
</IRenvelope>`;

  const mark = computeRtiIrmark(bodyWithoutMark);
  return injectRtiIrmark(bodyWithoutMark, mark);
}

export function wrapSa100GovTalk(opts: {
  bodyInner: string;
  utr: string;
  senderId: string;
  senderPassword: string;
  gatewayTest: boolean;
  vendorId?: string;
  productName?: string;
  vendorVersion?: string;
}): string {
  const utr = opts.utr.replace(/\s/g, "");
  const channel =
    opts.vendorId?.trim()
      ? `
    <ChannelRouting>
      <Channel>
        <URI>${escapeXml(opts.vendorId.trim())}</URI>
        <Product>${escapeXml(opts.productName || "HydraTax")}</Product>
        <Version>${escapeXml(opts.vendorVersion || "1.0")}</Version>
      </Channel>
    </ChannelRouting>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-SA-SA100</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <Transformation>XML</Transformation>
      <GatewayTest>${opts.gatewayTest ? "1" : "0"}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(opts.senderId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${escapeXml(opts.senderPassword)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${escapeXml(utr)}</Key>
    </Keys>${channel}
  </GovTalkDetails>
  <Body>${opts.bodyInner}</Body>
</GovTalkMessage>`;
}
