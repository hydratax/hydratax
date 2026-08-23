import { z } from "zod";
import { TAX_YEAR_LABEL } from "./rates-2025-26";

const money = z.coerce.number().min(0).default(0);
const yes = z.boolean().default(false);

export const employmentRowSchema = z.object({
  employerName: z.string().default(""),
  payeRef: z.string().default(""),
  pay: money,
  taxTakenOff: money,
  tips: money,
  benefits: money,
});

/** SA100 Tax Return 2026 (tax year 2025–26) interactive draft — TR1–TR8 + common supplements. */
export const sa100DraftSchema = z.object({
  taxYear: z.string().default(TAX_YEAR_LABEL),

  utr: z.string().default(""),
  nino: z.string().default(""),
  dateOfBirth: z.string().default(""),
  addressCorrection: z.string().default(""),
  phone: z.string().default(""),

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

  employments: z.array(employmentRowSchema).default([]),

  seBusinessName: z.string().default(""),
  seDescription: z.string().default(""),
  seTurnover: money,
  seExpenses: money,
  seCapitalAllowances: money,
  seTaxTakenOff: money,

  propRents: money,
  propOtherIncome: money,
  propExpenses: money,
  propFinanceCosts: money,
  propTaxTakenOff: money,

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

export function emptySa100Draft(partial?: Partial<Sa100Draft>): Sa100Draft {
  return sa100DraftSchema.parse(partial ?? {});
}
