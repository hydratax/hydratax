/**
 * Chart of accounts for year-end packs (aligned to Digitus-style Note 8).
 * Bank lines are tagged with these heads; users can reallocate freely.
 */

export type BankCategory =
  | "turnover"
  | "other_income"
  | "cost_of_sales"
  | "salaries"
  | "subcontractors"
  | "directors_remuneration"
  | "accountancy"
  | "consultancy"
  | "legal_professional"
  | "rent_rates"
  | "advertising"
  | "bank_charges"
  | "insurance"
  | "finance"
  | "travel"
  | "fuel"
  | "admin_office"
  | "depreciation"
  | "admin_expenses"
  | "premises"
  | "professional_fees"
  | "drawings"
  | "tax"
  | "transfer"
  | "uncategorised";

export const CATEGORY_LABELS: Record<BankCategory, string> = {
  turnover: "Turnover / sales",
  other_income: "Other income",
  cost_of_sales: "Cost of sales",
  salaries: "Salaries & wages",
  subcontractors: "Subcontractors",
  directors_remuneration: "Directors’ remuneration",
  accountancy: "Accountancy and audit",
  consultancy: "Consultancy",
  legal_professional: "Legal and professional",
  rent_rates: "Rent and rates",
  advertising: "Advertising and promotions",
  bank_charges: "Bank & card charges",
  insurance: "Insurance",
  finance: "Finance costs",
  travel: "Travel and subsistence",
  fuel: "Fuel",
  admin_office: "Administration and office",
  depreciation: "Depreciation",
  admin_expenses: "Admin expenses (general)",
  premises: "Premises (legacy → rent/rates)",
  professional_fees: "Professional fees (legacy)",
  drawings: "Drawings",
  tax: "Tax / HMRC",
  transfer: "Transfer",
  uncategorised: "Uncategorised",
};

/** Note 8 administrative expense heads (pence roll-up keys). */
export const NOTE8_KEYS = [
  "directors_remuneration",
  "salaries",
  "subcontractors",
  "accountancy",
  "consultancy",
  "legal_professional",
  "rent_rates",
  "advertising",
  "bank_charges",
  "depreciation",
  "insurance",
  "finance",
  "travel",
  "fuel",
  "admin_office",
  "admin_expenses",
] as const;

export type Note8Key = (typeof NOTE8_KEYS)[number];

export const NOTE8_LABELS: Record<Note8Key, string> = {
  directors_remuneration: "Directors Remuneration",
  salaries: "Salaries and Wages",
  subcontractors: "Subcontractors",
  accountancy: "Accountancy and Audit",
  consultancy: "Consultancy",
  legal_professional: "Legal and Professional Charges",
  rent_rates: "Rent and Rates",
  advertising: "Advertising and Promotions",
  bank_charges: "Bank, Credit card and Other Financial Charges",
  depreciation: "Depreciation",
  insurance: "Insurance",
  finance: "Finance Costs",
  travel: "Travel and Subsistence",
  fuel: "Fuel",
  admin_office: "Administration and Office Expenses",
  admin_expenses: "Other administrative expenses",
};

/** Normalise legacy / alias categories onto Note 8 keys where possible. */
export function resolveNote8Key(category: BankCategory): Note8Key | null {
  switch (category) {
    case "directors_remuneration":
    case "salaries":
    case "subcontractors":
    case "accountancy":
    case "consultancy":
    case "legal_professional":
    case "rent_rates":
    case "advertising":
    case "bank_charges":
    case "depreciation":
    case "insurance":
    case "finance":
    case "travel":
    case "fuel":
    case "admin_office":
    case "admin_expenses":
      return category;
    case "premises":
      return "rent_rates";
    case "professional_fees":
      return "legal_professional";
    default:
      return null;
  }
}

export function isExpenseCategory(category: BankCategory): boolean {
  return (
    resolveNote8Key(category) !== null ||
    category === "cost_of_sales" ||
    category === "uncategorised"
  );
}

/** Primary workspace sections — income first, then expense heads users review after CSV import. */
export const WORKSPACE_CATEGORY_SECTIONS: BankCategory[] = [
  "turnover",
  "other_income",
  "cost_of_sales",
  "salaries",
  "subcontractors",
  "directors_remuneration",
  "fuel",
  "travel",
  "insurance",
  "finance",
  "rent_rates",
  "accountancy",
  "consultancy",
  "legal_professional",
  "advertising",
  "bank_charges",
  "admin_office",
  "depreciation",
  "admin_expenses",
  "tax",
  "transfer",
  "drawings",
  "uncategorised",
];
