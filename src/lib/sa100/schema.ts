import { z } from "zod";
import { TAX_YEAR_LABEL } from "./rates-2025-26";

const money = z.coerce.number().min(0).default(0);
const yes = z.boolean().default(false);

/** One SA102 Employment page — boxes 1–20. */
export const employmentRowSchema = z.object({
  /** Box 5 */
  employerName: z.string().default(""),
  /** Box 4 */
  payeRef: z.string().default(""),
  /** Box 1 — pay from P45/P60 before tax */
  pay: money,
  /** Box 1.1 — payrolled benefits affecting student loan */
  payrolledBenefitsStudentLoan: money,
  /** Box 2 */
  taxTakenOff: money,
  /** Box 3 — tips / payments not on P60 */
  tips: money,
  /** Box 6 */
  wasDirector: yes,
  /** Box 6.1 */
  directorCeasedDate: z.string().default(""),
  /** Box 7 */
  wasCloseCompany: yes,
  /** Box 7.1–7.4 */
  closeCompanyName: z.string().default(""),
  closeCompanyNumber: z.string().default(""),
  closeCompanyDividends: money,
  closeCompanySharePct: z.coerce.number().min(0).max(100).default(0),
  /** Box 8 */
  offPayroll: yes,
  /** Boxes 9–16 — P11D benefits */
  benefitCars: money,
  benefitFuel: money,
  benefitMedical: money,
  benefitVouchers: money,
  benefitGoods: money,
  benefitAccommodation: money,
  benefitOther: money,
  benefitExpensesPayments: money,
  /** Legacy single benefits total (used if P11D boxes are empty). */
  benefits: money,
  /** Boxes 17–20 — employment expenses */
  expenseTravel: money,
  expenseFixed: money,
  expenseProfessional: money,
  expenseOther: money,
});

/** SA100 Tax Return 2026 (tax year 2025–26) interactive draft — TR1–TR8 + common supplements. */
export const sa100DraftSchema = z.object({
  taxYear: z.string().default(TAX_YEAR_LABEL),

  utr: z.string().default(""),
  nino: z.string().default(""),
  dateOfBirth: z.string().default(""),
  addressCorrection: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),

  hasEmployment: yes,
  employmentCount: z.coerce.number().int().min(0).default(0),
  hasSelfEmployment: yes,
  selfEmploymentCount: z.coerce.number().int().min(0).default(0),
  hasPartnership: yes,
  partnershipCount: z.coerce.number().int().min(0).default(0),
  hasUkProperty: yes,
  hasForeign: yes,
  hasTrusts: yes,
  hasCapitalGains: yes,
  cgtComputationsEnclosed: yes,
  hasResidenceFig: yes,
  hasAdditionalInfoPages: yes,

  employments: z.array(employmentRowSchema).max(50).default([]),

  // —— SA103F business details ——
  /** Box 1 */
  seBusinessName: z.string().default(""),
  /** Box 2 */
  seDescription: z.string().default(""),
  seBusinessAddress: z.string().default(""),
  /** Box 6Q / 6 */
  seStartedAfter: yes,
  seStartDate: z.string().default(""),
  /** Box 7Q / 7 */
  seCeased: yes,
  seCeaseDate: z.string().default(""),
  /** Boxes 8–9 accounting period */
  seBooksFrom: z.string().default(""),
  seBooksTo: z.string().default(""),
  seCashBasis: yes,

  // —— SA103F income ——
  /** Box 15 */
  seTurnover: money,
  /** Box 16 */
  seOtherBusinessIncome: money,
  /** Box 16.1 */
  seTradingAllowance: money,

  // —— SA103F expenses 17–30 (total → box 31) ——
  seCostOfGoods: money,
  seCisSubcontractors: money,
  seWages: money,
  seCarVanTravel: money,
  seRentPowerInsurance: money,
  seRepairs: money,
  sePhoneOffice: money,
  seAdvertising: money,
  seInterest: money,
  seBankCharges: money,
  seBadDebts: money,
  seProfessionalFees: money,
  seDepreciation: money,
  seOtherExpensesDetail: money,
  /** Box 31 — or legacy single total when breakdown empty */
  seExpenses: money,
  /** Box 46 — total disallowable included in expenses */
  seDisallowableTotal: money,

  // —— Capital allowances 49–56 (total → 57) ——
  seAia: money,
  seCa18: money,
  seCa6: money,
  seZeroEmissionGoods: money,
  seZeroEmissionCar: money,
  seSba: money,
  seFreeportSba: money,
  seElectricCharge: money,
  seEnhancedCa: money,
  seDisposalAllowances: money,
  /** Box 57 — or legacy single total when breakdown empty */
  seCapitalAllowances: money,
  /** Box 59 */
  seBalancingCharges: money,
  /** Box 60 */
  seGoodsOwnUse: money,

  /** CIS deductions / tax taken off trading income */
  seTaxTakenOff: money,
  seCisDeductions: money,
  seClass4Exempt: yes,
  seAnyOtherInformation: z.string().default(""),

  // —— SA105 UK property ——
  propPropertyCount: z.coerce.number().int().min(0).default(0),
  propJointLet: yes,
  propRentARoom: yes,
  /** Box 20 */
  propRents: money,
  /** Box 20.1 */
  propIncomeAllowance: money,
  propTraditionalAccounting: yes,
  /** Box 21 */
  propTaxTakenOff: money,
  /** Box 22–23 */
  propLeasePremiums: money,
  propReversePremiums: money,
  propOtherIncome: money,
  /** Boxes 24–29 */
  propRentRatesInsurance: money,
  propRepairs: money,
  propNonResFinance: money,
  propLegalFees: money,
  propServices: money,
  propOtherExpensesDetail: money,
  /** Legacy total when breakdown empty */
  propExpenses: money,
  propPrivateUse: money,
  propBalancingCharges: money,
  propAia: money,
  propSba: money,
  propElectricCharge: money,
  propFreeportSba: money,
  propZeroEmissionCar: money,
  propOtherCapitalAllowances: money,
  propReplaceDomesticItems: money,
  propRentARoomExempt: money,
  /** Box 44–45 residential finance */
  propFinanceCosts: money,
  propFinanceCostsBroughtForward: money,

  interestTaxedUk: money,
  interestUntaxedUk: money,
  interestUntaxedForeign: money,
  dividendsUk: money,
  dividendsOther: money,
  dividendsForeign: money,
  dividendsForeignTax: money,
  statePension: money,
  statePensionLumpSum: money,
  statePensionLumpSumTax: money,
  otherPensions: money,
  otherPensionsTax: money,
  incapacityEsa: money,
  incapacityTax: money,
  jobseekersAllowance: money,
  otherStateBenefits: money,
  otherTaxableIncome: money,
  otherIncomeExpenses: money,
  otherIncomeTax: money,
  preOwnedAssets: money,
  otherIncomeDescription: z.string().default(""),

  pensionReliefAtSource: money,
  pensionOneOff: money,
  retirementAnnuity: money,
  employerPensionNotDeducted: money,
  overseasPension: money,
  giftAid: money,
  giftAidOneOff: money,
  giftAidCarryBack: money,
  giftAidTreatAsThisYear: money,
  sharesToCharity: money,
  landToCharity: money,
  blindPerson: yes,
  blindRegister: z.string().default(""),
  wantSpouseBlindSurplus: yes,
  giveBlindSurplus: yes,

  studentLoanNotification: yes,
  studentLoanDeducted: money,
  postgraduateLoanDeducted: money,
  studentLoanPlan: z
    .enum(["none", "plan1", "plan2", "plan4", "plan5"])
    .default("none"),
  hasPostgraduateLoan: yes,
  childBenefitAmount: money,
  childBenefitChildren: z.coerce.number().int().min(0).default(0),
  childBenefitStopped: z.string().default(""),
  marriageTransferOut: yes,
  marriageReceive: yes,
  spouseForename: z.string().default(""),
  spouseSurname: z.string().default(""),
  spouseNino: z.string().default(""),
  spouseDob: z.string().default(""),
  marriageDate: z.string().default(""),
  winterFuelPayment: money,

  taxRefunded: money,
  optOutUnder3000Coding: yes,
  optOutEstimateCoding: yes,
  bankName: z.string().default(""),
  accountName: z.string().default(""),
  sortCode: z.string().default(""),
  accountNumber: z.string().default(""),
  buildingSocietyRef: z.string().default(""),

  adviserName: z.string().default(""),
  adviserPhone: z.string().default(""),
  adviserAddress: z.string().default(""),
  adviserRef: z.string().default(""),
  anyOtherInformation: z.string().default(""),

  provisionalFigures: yes,
  enclosingSupplementary: yes,
  declarationAccepted: yes,
  declarationName: z.string().default(""),
  declarationDate: z.string().default(""),
  signedCapacity: z.string().default(""),
  signedForName: z.string().default(""),
});

export type Sa100Draft = z.infer<typeof sa100DraftSchema>;
export type EmploymentRow = z.infer<typeof employmentRowSchema>;

export function employmentBenefitsTotal(e: EmploymentRow): number {
  const p11d =
    e.benefitCars +
    e.benefitFuel +
    e.benefitMedical +
    e.benefitVouchers +
    e.benefitGoods +
    e.benefitAccommodation +
    e.benefitOther +
    e.benefitExpensesPayments;
  return p11d > 0 ? p11d : e.benefits;
}

export function employmentExpensesTotal(e: EmploymentRow): number {
  return (
    e.expenseTravel +
    e.expenseFixed +
    e.expenseProfessional +
    e.expenseOther
  );
}

export function seExpensesBreakdownTotal(d: Sa100Draft): number {
  return (
    d.seCostOfGoods +
    d.seCisSubcontractors +
    d.seWages +
    d.seCarVanTravel +
    d.seRentPowerInsurance +
    d.seRepairs +
    d.sePhoneOffice +
    d.seAdvertising +
    d.seInterest +
    d.seBankCharges +
    d.seBadDebts +
    d.seProfessionalFees +
    d.seDepreciation +
    d.seOtherExpensesDetail
  );
}

export function seCapitalAllowancesBreakdownTotal(d: Sa100Draft): number {
  return (
    d.seAia +
    d.seCa18 +
    d.seCa6 +
    d.seZeroEmissionGoods +
    d.seZeroEmissionCar +
    d.seSba +
    d.seFreeportSba +
    d.seElectricCharge +
    d.seEnhancedCa +
    d.seDisposalAllowances
  );
}

export function propExpensesBreakdownTotal(d: Sa100Draft): number {
  return (
    d.propRentRatesInsurance +
    d.propRepairs +
    d.propNonResFinance +
    d.propLegalFees +
    d.propServices +
    d.propOtherExpensesDetail
  );
}

export function propCapitalAllowancesTotal(d: Sa100Draft): number {
  return (
    d.propAia +
    d.propSba +
    d.propElectricCharge +
    d.propFreeportSba +
    d.propZeroEmissionCar +
    d.propOtherCapitalAllowances +
    d.propReplaceDomesticItems
  );
}

export function emptySa100Draft(partial?: Partial<Sa100Draft>): Sa100Draft {
  return sa100DraftSchema.parse(partial ?? {});
}
