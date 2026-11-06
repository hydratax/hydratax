import type { Sa100Draft } from "@/lib/sa100/schema";
import { emptySa100Draft } from "@/lib/sa100/schema";
import type { SaTaxpayer } from "@/lib/sa-taxpayer";

/**
 * Income taken from one limited company for a director / shareholder.
 * Maps primarily to SA102 (Employment) + SA100 dividend boxes.
 */
export type SaCompanyIncome = {
  clientId: string;
  companyName: string;
  companyNumber: string;
  role: "director" | "shareholder" | "director_shareholder";
  /** SA102 box 1 — pay from P60/P45 before tax */
  payePay: number;
  /** SA102 box 2 — UK tax taken off */
  payeTax: number;
  /** SA102 box 4 — employer PAYE reference */
  payeRef: string;
  /** SA102 box 3 — tips / other not on P60 */
  tips?: number;
  /** SA102 box 15 — other benefits (incl. cheap loans) from P11D */
  benefits?: number;
  /** SA102 boxes 17–20 employment expenses (total) */
  employmentExpenses?: number;
  /** SA100 box 4 / SA102 7.3 — UK dividends from this company */
  dividends: number;
  /** Optional shareholding % (SA102 7.4) */
  shareholdingPct?: number;
  /** CIS / subcontractor receipts → SA103S boxes 9 + 38 */
  subcontractorGross: number;
  subcontractorTax: number;
  /**
   * Director’s loan account drawn (working figure — may feed
   * benefit / s455 notes; included in “other taxable” when marked taxable).
   */
  directorLoan: number;
  directorLoanTaxable: boolean;
};

/** SA103S allowable expenses (self-employment short), boxes 11–19. */
export type SaSeExpenses = {
  /** Box 11 — cost of goods */
  goods: number;
  /** Box 12 — car, van and travel (after private use) */
  carVanTravel: number;
  /** Box 13 — wages, salaries and staff costs */
  wages: number;
  /** Box 14 — rent, rates, power and insurance */
  rentRatesPower: number;
  /** Box 15 — repairs and maintenance */
  repairs: number;
  /** Box 16 — accountancy, legal and professional fees */
  professionalFees: number;
  /** Box 17 — interest and bank/credit charges */
  interestCharges: number;
  /** Box 18 — phone, fax, stationery and office costs */
  officeCosts: number;
  /** Box 19 — other allowable (not client entertaining) */
  other: number;
};

/** SA105 UK property expenses / finance. */
export type SaPropertyExpenses = {
  /** Box 24 — rent, rates, insurance, ground rents */
  rentsRatesInsurance: number;
  /** Box 25 — repairs and maintenance */
  repairs: number;
  /** Box 26 — non-residential finance costs */
  nonResidentialFinance: number;
  /** Box 27 — legal, management and professional fees */
  legalFees: number;
  /** Box 28 — costs of services provided */
  services: number;
  /** Box 29 — other allowable property expenses */
  other: number;
  /** Box 36 — replacing domestic items */
  domesticItems: number;
  /** Box 44 — residential property finance costs (interest relief) */
  residentialFinance: number;
};

export type SaOtherIncomeKind =
  | "rental"
  | "taxi"
  | "payroll_other"
  | "self_employment"
  | "other";

export type SaOtherIncome = {
  id: string;
  kind: SaOtherIncomeKind;
  /** Display / business name */
  label: string;
  /** SA103S box 1 — description of business */
  businessDescription?: string;
  /** SA103S box 2 — business postcode */
  businessPostcode?: string;
  /**
   * Gross: SA103S box 9 turnover, SA105 box 20 rents, or PAYE pay.
   */
  amount: number;
  /** SA103S box 10 — other business income */
  otherBusinessIncome?: number;
  taxTakenOff: number;
  /**
   * Legacy single expenses total. Prefer seExpenses / propExpenses;
   * used as fallback and as box 20 shortcut total when detailed lines are empty.
   */
  expenses: number;
  seExpenses?: Partial<SaSeExpenses>;
  propExpenses?: Partial<SaPropertyExpenses>;
  /** SA105 box 1 */
  propertyCount?: number;
  /** Claim £1,000 trading income allowance (SA103S 10.1) instead of expenses */
  claimTradingAllowance?: boolean;
  /** Claim £1,000 property income allowance (SA105 20.1) instead of expenses */
  claimPropertyAllowance?: boolean;
};

export const SA_OTHER_KIND_LABELS: Record<SaOtherIncomeKind, string> = {
  rental: "UK property (SA105)",
  taxi: "Taxi / private hire (SA103S)",
  payroll_other: "Other employment (SA102)",
  self_employment: "Self-employment (SA103S)",
  other: "Other taxable income (SA100)",
};

export const SA_SE_EXPENSE_FIELDS: Array<{
  key: keyof SaSeExpenses;
  box: string;
  label: string;
}> = [
  { key: "goods", box: "11", label: "Cost of goods bought for resale / used" },
  { key: "carVanTravel", box: "12", label: "Car, van and travel (after private use)" },
  { key: "wages", box: "13", label: "Wages, salaries and other staff costs" },
  { key: "rentRatesPower", box: "14", label: "Rent, rates, power and insurance" },
  { key: "repairs", box: "15", label: "Repairs and maintenance" },
  {
    key: "professionalFees",
    box: "16",
    label: "Accountancy, legal and professional fees",
  },
  {
    key: "interestCharges",
    box: "17",
    label: "Interest and bank / credit card charges",
  },
  { key: "officeCosts", box: "18", label: "Phone, stationery and office costs" },
  { key: "other", box: "19", label: "Other allowable business expenses" },
];

export const SA_PROP_EXPENSE_FIELDS: Array<{
  key: keyof SaPropertyExpenses;
  box: string;
  label: string;
}> = [
  {
    key: "rentsRatesInsurance",
    box: "24",
    label: "Rent, rates, insurance and ground rents",
  },
  { key: "repairs", box: "25", label: "Property repairs and maintenance" },
  {
    key: "nonResidentialFinance",
    box: "26",
    label: "Non-residential property finance costs",
  },
  {
    key: "legalFees",
    box: "27",
    label: "Legal, management and professional fees",
  },
  { key: "services", box: "28", label: "Costs of services provided (incl. wages)" },
  { key: "other", box: "29", label: "Other allowable property expenses" },
  {
    key: "domesticItems",
    box: "36",
    label: "Costs of replacing domestic items",
  },
  {
    key: "residentialFinance",
    box: "44",
    label: "Residential property finance costs (interest)",
  },
];

export function emptySeExpenses(
  partial?: Partial<SaSeExpenses>,
): SaSeExpenses {
  return {
    goods: partial?.goods ?? 0,
    carVanTravel: partial?.carVanTravel ?? 0,
    wages: partial?.wages ?? 0,
    rentRatesPower: partial?.rentRatesPower ?? 0,
    repairs: partial?.repairs ?? 0,
    professionalFees: partial?.professionalFees ?? 0,
    interestCharges: partial?.interestCharges ?? 0,
    officeCosts: partial?.officeCosts ?? 0,
    other: partial?.other ?? 0,
  };
}

export function emptyPropExpenses(
  partial?: Partial<SaPropertyExpenses>,
): SaPropertyExpenses {
  return {
    rentsRatesInsurance: partial?.rentsRatesInsurance ?? 0,
    repairs: partial?.repairs ?? 0,
    nonResidentialFinance: partial?.nonResidentialFinance ?? 0,
    legalFees: partial?.legalFees ?? 0,
    services: partial?.services ?? 0,
    other: partial?.other ?? 0,
    domesticItems: partial?.domesticItems ?? 0,
    residentialFinance: partial?.residentialFinance ?? 0,
  };
}

export function sumSeExpenses(e?: Partial<SaSeExpenses> | null): number {
  if (!e) return 0;
  return SA_SE_EXPENSE_FIELDS.reduce((s, f) => s + (Number(e[f.key]) || 0), 0);
}

export function sumPropExpenses(
  e?: Partial<SaPropertyExpenses> | null,
): number {
  if (!e) return 0;
  // Box 44 residential finance is NOT deducted from profit — tax reduction only.
  return (
    (e.rentsRatesInsurance ?? 0) +
    (e.repairs ?? 0) +
    (e.nonResidentialFinance ?? 0) +
    (e.legalFees ?? 0) +
    (e.services ?? 0) +
    (e.other ?? 0) +
    (e.domesticItems ?? 0)
  );
}

export function otherIncomeExpenseTotal(o: SaOtherIncome): number {
  if (o.kind === "rental") {
    const detailed = sumPropExpenses(o.propExpenses);
    if (o.claimPropertyAllowance) return Math.min(1000, o.amount);
    return detailed > 0 ? detailed : o.expenses;
  }
  if (o.kind === "taxi" || o.kind === "self_employment") {
    const detailed = sumSeExpenses(o.seExpenses);
    if (o.claimTradingAllowance) return Math.min(1000, o.amount);
    return detailed > 0 ? detailed : o.expenses;
  }
  return o.expenses;
}

export function emptyCompanyIncome(
  partial: Partial<SaCompanyIncome> &
    Pick<SaCompanyIncome, "clientId" | "companyName">,
): SaCompanyIncome {
  return {
    clientId: partial.clientId,
    companyName: partial.companyName,
    companyNumber: partial.companyNumber ?? "",
    role: partial.role ?? "shareholder",
    payePay: partial.payePay ?? 0,
    payeTax: partial.payeTax ?? 0,
    payeRef: partial.payeRef ?? "",
    tips: partial.tips ?? 0,
    benefits: partial.benefits ?? 0,
    employmentExpenses: partial.employmentExpenses ?? 0,
    dividends: partial.dividends ?? 0,
    shareholdingPct: partial.shareholdingPct ?? 0,
    subcontractorGross: partial.subcontractorGross ?? 0,
    subcontractorTax: partial.subcontractorTax ?? 0,
    directorLoan: partial.directorLoan ?? 0,
    directorLoanTaxable: partial.directorLoanTaxable ?? false,
  };
}

export function companyIncomeTotal(c: SaCompanyIncome): number {
  return (
    c.payePay +
    (c.tips ?? 0) +
    (c.benefits ?? 0) +
    c.dividends +
    c.subcontractorGross +
    (c.directorLoanTaxable ? c.directorLoan : 0)
  );
}

export function otherIncomeNet(o: SaOtherIncome): number {
  const gross = o.amount + (o.otherBusinessIncome ?? 0);
  return Math.max(0, gross - otherIncomeExpenseTotal(o));
}

/** Roll company + other income into an SA100 draft (merges onto existing). */
export function accumulateSa100FromIncome(
  taxpayer: SaTaxpayer,
  existing?: Partial<Sa100Draft> | null,
): Sa100Draft {
  const companies = taxpayer.companyIncomes ?? [];
  const others = taxpayer.otherIncomes ?? [];

  const employments = companies
    .filter((c) => c.payePay > 0 || c.payeTax > 0 || (c.tips ?? 0) > 0)
    .map((c) => ({
      employerName: c.companyName,
      payeRef: c.payeRef,
      pay: c.payePay,
      taxTakenOff: c.payeTax,
      tips: c.tips ?? 0,
      benefits: c.benefits ?? 0,
    }));

  const dividendsUk = companies.reduce((s, c) => s + c.dividends, 0);
  const cisGross = companies.reduce((s, c) => s + c.subcontractorGross, 0);
  const cisTax = companies.reduce((s, c) => s + c.subcontractorTax, 0);
  const taxableLoans = companies.reduce(
    (s, c) => s + (c.directorLoanTaxable ? c.directorLoan : 0),
    0,
  );

  let propRents = 0;
  let propExpenses = 0;
  let propFinanceCosts = 0;
  let propTax = 0;
  let seTurnover = cisGross;
  let seExpenses = 0;
  let seTax = cisTax;
  let otherTaxable = taxableLoans;
  let otherTax = 0;
  const otherBits: string[] = [];
  let seBusinessName = existing?.seBusinessName || "";
  let seDescription = existing?.seDescription || "";

  for (const o of others) {
    if (o.kind === "rental") {
      propRents += o.amount;
      propExpenses += otherIncomeExpenseTotal(o);
      propFinanceCosts += o.propExpenses?.residentialFinance ?? 0;
      propTax += o.taxTakenOff;
    } else if (o.kind === "self_employment" || o.kind === "taxi") {
      seTurnover += o.amount + (o.otherBusinessIncome ?? 0);
      seExpenses += otherIncomeExpenseTotal(o);
      seTax += o.taxTakenOff;
      if (!seBusinessName && o.label) seBusinessName = o.label;
      if (!seDescription && o.businessDescription) {
        seDescription = o.businessDescription;
      } else if (!seDescription && o.kind === "taxi") {
        seDescription = "Taxi / private hire";
      }
    } else if (o.kind === "payroll_other") {
      employments.push({
        employerName: o.label || "Other employer",
        payeRef: "",
        pay: o.amount,
        taxTakenOff: o.taxTakenOff,
        tips: 0,
        benefits: 0,
      });
    } else {
      otherTaxable += Math.max(0, o.amount - o.expenses);
      otherTax += o.taxTakenOff;
      if (o.label) otherBits.push(o.label);
    }
  }

  if (taxableLoans > 0) otherBits.push("Taxable director loan");
  if (cisGross > 0 && !seBusinessName) seBusinessName = "CIS / subcontracting";
  if (cisGross > 0 && !seDescription) {
    seDescription = "Construction / subcontracting";
  }

  const hasSe = seTurnover > 0 || seExpenses > 0;
  const hasProp = propRents > 0 || propExpenses > 0;

  return emptySa100Draft({
    ...(existing ?? {}),
    utr: existing?.utr || taxpayer.utr,
    nino: existing?.nino || taxpayer.nino,
    dateOfBirth: existing?.dateOfBirth || taxpayer.dateOfBirth,
    phone: existing?.phone || taxpayer.phone,
    hasEmployment: employments.length > 0,
    employmentCount: employments.length,
    employments,
    hasSelfEmployment: hasSe,
    selfEmploymentCount: hasSe ? 1 : 0,
    seBusinessName:
      seBusinessName ||
      taxpayer.tradingAs ||
      (cisGross > 0 ? "CIS / subcontracting" : taxpayer.fullName),
    seDescription: seDescription || taxpayer.occupation || "",
    seTurnover,
    seExpenses,
    seTaxTakenOff: seTax,
    hasUkProperty: hasProp,
    propRents,
    propExpenses,
    propFinanceCosts,
    propTaxTakenOff: propTax,
    dividendsUk:
      (existing?.dividendsUk ?? 0) > dividendsUk
        ? (existing?.dividendsUk ?? 0)
        : dividendsUk,
    otherTaxableIncome: otherTaxable,
    otherIncomeTax: otherTax,
    otherIncomeDescription: otherBits.join("; "),
  });
}
