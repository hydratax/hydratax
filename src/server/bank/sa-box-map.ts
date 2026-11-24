/**
 * bankbee — map company/SA bank CoA heads → SA103F self-employment draft fields.
 * Drawings, dividends, transfers, tax payments are omitted (not trading expenses).
 */

import type { BankCategory } from "@/lib/bank-categories";

/** Keys on Sa100Draft that hold SE money boxes we can seed from bank. */
export type SaSelfEmploymentMoneyField =
  | "seTurnover"
  | "seOtherBusinessIncome"
  | "seCostOfGoods"
  | "seCisSubcontractors"
  | "seWages"
  | "seCarVanTravel"
  | "seRentPowerInsurance"
  | "seRepairs"
  | "sePhoneOffice"
  | "seAdvertising"
  | "seInterest"
  | "seBankCharges"
  | "seBadDebts"
  | "seProfessionalFees"
  | "seDepreciation"
  | "seOtherExpensesDetail";

/** SA103F face labels (box order) for the bankbee SA desk. */
export const SA103F_HEAD_META: Array<{
  field: SaSelfEmploymentMoneyField;
  box: string;
  label: string;
}> = [
  { field: "seTurnover", box: "15", label: "Your turnover" },
  {
    field: "seOtherBusinessIncome",
    box: "16",
    label: "Any other business income",
  },
  {
    field: "seCostOfGoods",
    box: "17",
    label: "Cost of goods bought for resale or goods used",
  },
  {
    field: "seCisSubcontractors",
    box: "18",
    label: "Construction industry – payments to subcontractors",
  },
  {
    field: "seWages",
    box: "19",
    label: "Wages, salaries and other staff costs",
  },
  {
    field: "seCarVanTravel",
    box: "20",
    label: "Car, van and travel expenses",
  },
  {
    field: "seRentPowerInsurance",
    box: "21",
    label: "Rent, rates, power and insurance costs",
  },
  {
    field: "seRepairs",
    box: "22",
    label: "Repairs and maintenance of property and equipment",
  },
  {
    field: "sePhoneOffice",
    box: "23",
    label: "Phone, fax, stationery and other office costs",
  },
  {
    field: "seAdvertising",
    box: "24",
    label: "Advertising and business entertainment costs",
  },
  {
    field: "seInterest",
    box: "25",
    label: "Interest on bank and other loans",
  },
  {
    field: "seBankCharges",
    box: "26",
    label: "Bank, credit card and other financial charges",
  },
  {
    field: "seBadDebts",
    box: "27",
    label: "Irrecoverable debts written off",
  },
  {
    field: "seProfessionalFees",
    box: "28",
    label: "Accountancy, legal and other professional fees",
  },
  {
    field: "seDepreciation",
    box: "29",
    label: "Depreciation and loss or profit on sale of assets",
  },
  {
    field: "seOtherExpensesDetail",
    box: "30",
    label: "Other business expenses",
  },
];

export function sa103fHeadLabel(field: SaSelfEmploymentMoneyField): string {
  const hit = SA103F_HEAD_META.find((h) => h.field === field);
  return hit ? `Box ${hit.box} · ${hit.label}` : field;
}

const OMIT = new Set<string>([
  "drawings",
  "dividends",
  "directors_remuneration",
  "transfer",
  "tax",
  "trade_debtors",
  "expense_queries",
  "uncategorised",
]);

const CATEGORY_TO_SA: Partial<Record<BankCategory, SaSelfEmploymentMoneyField>> =
  {
    turnover: "seTurnover",
    other_income: "seOtherBusinessIncome",
    cost_of_sales: "seCostOfGoods",
    subcontractors: "seCisSubcontractors",
    salaries: "seWages",
    fuel: "seCarVanTravel",
    travel: "seCarVanTravel",
    rent_rates: "seRentPowerInsurance",
    premises: "seRentPowerInsurance",
    insurance: "seRentPowerInsurance",
    admin_office: "sePhoneOffice",
    advertising: "seAdvertising",
    finance: "seInterest",
    bank_charges: "seBankCharges",
    accountancy: "seProfessionalFees",
    legal_professional: "seProfessionalFees",
    consultancy: "seProfessionalFees",
    professional_fees: "seProfessionalFees",
    depreciation: "seDepreciation",
    admin_expenses: "seOtherExpensesDetail",
  };

export function bankCategoryToSaField(
  category: string,
): SaSelfEmploymentMoneyField | null {
  if (OMIT.has(category) || category.startsWith("custom:")) return null;
  return CATEGORY_TO_SA[category as BankCategory] ?? null;
}

export type SaBoxRollup = {
  field: SaSelfEmploymentMoneyField;
  /** Absolute pounds for expenses; signed pounds for income fields */
  pounds: number;
  lineCount: number;
  amountPence: number;
};

export type MapBankHeadsToSaResult = {
  /** Pounds to merge into SA draft (additive) */
  fields: Partial<Record<SaSelfEmploymentMoneyField, number>>;
  rollups: SaBoxRollup[];
  omittedLineCount: number;
  omittedPence: number;
  unmappedCategories: string[];
};

/**
 * Roll categorised bank lines into SA103F money boxes (pounds).
 * Income heads use credit totals; expense heads use absolute outflow totals.
 */
export function mapBankHeadsToSaSelfEmployment(
  lines: Array<{ category: string; amountPence: number }>,
): MapBankHeadsToSaResult {
  const buckets = new Map<
    SaSelfEmploymentMoneyField,
    { pence: number; count: number }
  >();
  let omittedLineCount = 0;
  let omittedPence = 0;
  const unmapped = new Set<string>();

  for (const line of lines) {
    const cat = line.category;
    if (OMIT.has(cat) || cat.startsWith("custom:")) {
      omittedLineCount += 1;
      omittedPence += Math.abs(line.amountPence);
      continue;
    }
    const field = CATEGORY_TO_SA[cat as BankCategory];
    if (!field) {
      unmapped.add(cat);
      omittedLineCount += 1;
      omittedPence += Math.abs(line.amountPence);
      continue;
    }

    const isIncome = field === "seTurnover" || field === "seOtherBusinessIncome";
    const contrib = isIncome
      ? Math.max(0, line.amountPence)
      : Math.max(0, -line.amountPence);
    if (!contrib) continue;

    const prev = buckets.get(field) ?? { pence: 0, count: 0 };
    prev.pence += contrib;
    prev.count += 1;
    buckets.set(field, prev);
  }

  const fields: Partial<Record<SaSelfEmploymentMoneyField, number>> = {};
  const rollups: SaBoxRollup[] = [];
  for (const [field, { pence, count }] of buckets) {
    const pounds = Math.round(pence) / 100;
    fields[field] = pounds;
    rollups.push({ field, pounds, lineCount: count, amountPence: pence });
  }
  rollups.sort((a, b) => {
    const ia = SA103F_HEAD_META.findIndex((h) => h.field === a.field);
    const ib = SA103F_HEAD_META.findIndex((h) => h.field === b.field);
    return ia - ib;
  });

  return {
    fields,
    rollups,
    omittedLineCount,
    omittedPence,
    unmappedCategories: [...unmapped].sort(),
  };
}

/** Display pence for a SA103F head from raw bank lines (signed as stored). */
export function saHeadDisplayPence(
  field: SaSelfEmploymentMoneyField,
  lines: Array<{ amountPence: number }>,
): number {
  const isIncome = field === "seTurnover" || field === "seOtherBusinessIncome";
  if (isIncome) {
    return lines.reduce((s, l) => s + Math.max(0, l.amountPence), 0);
  }
  return -lines.reduce((s, l) => s + Math.max(0, -l.amountPence), 0);
}

/** Which SA supplementary form a bank head should allocate into. */
export type SaAllocateForm = "sa103f" | "sa105" | "sa102";

/** Form target or skip this head when bulk / per-row allocating. */
export type SaAllocateChoice = SaAllocateForm | "unallocated";

export const SA_ALLOCATE_FORM_LABEL: Record<SaAllocateForm, string> = {
  sa103f: "SA103F (self-employment)",
  sa105: "SA105 (UK property)",
  sa102: "SA102 (employment)",
};

export const SA_ALLOCATE_CHOICE_LABEL: Record<SaAllocateChoice, string> = {
  ...SA_ALLOCATE_FORM_LABEL,
  unallocated: "Keep unallocated",
};

export type SaFormSuggestSignals = {
  hasRental?: boolean;
  hasEmployment?: boolean;
  hasSelfEmployment?: boolean;
  occupation?: string | null;
};

const RENTAL_OCC_RE =
  /\b(landlord|landlady|lettings?|rental|property\s*invest|buy[\s-]?to[\s-]?let|b2l)\b/i;

/**
 * Pick the best form for a bank category given person signals.
 * Accountant can override in the UI.
 */
export function suggestSaFormForCategory(
  category: string,
  signals: SaFormSuggestSignals = {},
): SaAllocateForm {
  const occ = signals.occupation ?? "";
  const rental =
    Boolean(signals.hasRental) || RENTAL_OCC_RE.test(occ);

  if (
    rental &&
    (category === "rent_rates" ||
      category === "premises" ||
      category === "insurance" ||
      category === "turnover" ||
      category === "other_income")
  ) {
    return "sa105";
  }
  // Bank heads never default to SA102 — employment pay comes from PAYE / P60.
  return "sa103f";
}

/** Map an SA103F head onto an SA105 draft money field when the user targets property. */
const SA103_TO_SA105: Partial<
  Record<SaSelfEmploymentMoneyField, string>
> = {
  seTurnover: "propRents",
  seOtherBusinessIncome: "propOtherIncome",
  seRentPowerInsurance: "propRentRatesInsurance",
  seRepairs: "propRepairs",
  seInterest: "propFinanceCosts",
  seProfessionalFees: "propLegalFees",
  seWages: "propServices",
  seOtherExpensesDetail: "propOtherExpensesDetail",
  seCarVanTravel: "propOtherExpensesDetail",
  sePhoneOffice: "propOtherExpensesDetail",
  seAdvertising: "propOtherExpensesDetail",
  seBankCharges: "propOtherExpensesDetail",
  seCostOfGoods: "propOtherExpensesDetail",
  seBadDebts: "propOtherExpensesDetail",
  seDepreciation: "propOtherCapitalAllowances",
};

/** SA102 employment row keys for income / expense when targeting employment. */
const SA103_TO_SA102: Partial<
  Record<
    SaSelfEmploymentMoneyField,
    "pay" | "tips" | "expenseTravel" | "expenseProfessional" | "expenseOther"
  >
> = {
  seTurnover: "pay",
  seOtherBusinessIncome: "tips",
  seCarVanTravel: "expenseTravel",
  seProfessionalFees: "expenseProfessional",
  seWages: "expenseOther",
  seRentPowerInsurance: "expenseOther",
  seRepairs: "expenseOther",
  sePhoneOffice: "expenseOther",
  seAdvertising: "expenseOther",
  seInterest: "expenseOther",
  seBankCharges: "expenseOther",
  seOtherExpensesDetail: "expenseOther",
  seCostOfGoods: "expenseOther",
};

export function resolveAllocateTarget(
  form: SaAllocateForm,
  seField: SaSelfEmploymentMoneyField,
): { form: SaAllocateForm; draftKey: string; boxLabel: string } {
  if (form === "sa103f") {
    return {
      form,
      draftKey: seField,
      boxLabel: sa103fHeadLabel(seField),
    };
  }
  if (form === "sa105") {
    const key = SA103_TO_SA105[seField] ?? "propOtherExpensesDetail";
    const labels: Record<string, string> = {
      propRents: "Box 20 · Rents and other income from land and property",
      propOtherIncome: "Box 23 · Other property income",
      propRentRatesInsurance: "Box 24 · Rent, rates, insurance, ground rents",
      propRepairs: "Box 25 · Property repairs and maintenance",
      propFinanceCosts: "Box 44 · Residential finance costs",
      propLegalFees: "Box 27 · Legal and professional costs",
      propServices: "Box 28 · Costs of services provided, including wages",
      propOtherExpensesDetail: "Box 29 · Other property expenses",
      propOtherCapitalAllowances: "Box 42 · Other capital allowances",
    };
    return {
      form,
      draftKey: key,
      boxLabel: labels[key] ?? key,
    };
  }
  const key = SA103_TO_SA102[seField] ?? "expenseOther";
  const labels: Record<string, string> = {
    pay: "Box 1 · Pay from this employment",
    tips: "Box 3 · Tips and other payments",
    expenseTravel: "Box 17 · Travel and subsistence expenses",
    expenseProfessional: "Box 19 · Professional fees and subscriptions",
    expenseOther: "Box 20 · Other expenses and capital allowances",
  };
  return {
    form,
    draftKey: key,
    boxLabel: labels[key] ?? key,
  };
}

export function isSaIncomeHead(field: SaSelfEmploymentMoneyField): boolean {
  return field === "seTurnover" || field === "seOtherBusinessIncome";
}
