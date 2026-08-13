/**
 * Chart of accounts for year-end packs (aligned to Digitus-style Note 8).
 * Bank lines are tagged with these heads; users can reallocate freely.
 */

export type BankCategory =
  | "turnover"
  | "other_income"
  | "cost_of_sales"
  | "directors_remuneration"
  | "accountancy"
  | "consultancy"
  | "legal_professional"
  | "rent_rates"
  | "advertising"
  | "bank_charges"
  | "insurance"
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
  directors_remuneration: "Directors’ remuneration",
  accountancy: "Accountancy and audit",
  consultancy: "Consultancy",
  legal_professional: "Legal and professional",
  rent_rates: "Rent and rates",
  advertising: "Advertising and promotions",
  bank_charges: "Bank & card charges",
  insurance: "Insurance",
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
  "accountancy",
  "consultancy",
  "legal_professional",
  "rent_rates",
  "advertising",
  "bank_charges",
  "depreciation",
  "insurance",
  "travel",
  "fuel",
  "admin_office",
  "admin_expenses",
] as const;

export type Note8Key = (typeof NOTE8_KEYS)[number];

export const NOTE8_LABELS: Record<Note8Key, string> = {
  directors_remuneration: "Directors Remuneration",
  accountancy: "Accountancy and Audit",
  consultancy: "Consultancy",
  legal_professional: "Legal and Professional Charges",
  rent_rates: "Rent and Rates",
  advertising: "Advertising and Promotions",
  bank_charges: "Bank, Credit card and Other Financial Charges",
  depreciation: "Depreciation",
  insurance: "Insurance",
  travel: "Travel and Subsistence",
  fuel: "Fuel",
  admin_office: "Administration and Office Expenses",
  admin_expenses: "Other administrative expenses",
};

/** Normalise legacy / alias categories onto Note 8 keys where possible. */
export function resolveNote8Key(category: BankCategory): Note8Key | null {
  switch (category) {
    case "directors_remuneration":
    case "accountancy":
    case "consultancy":
    case "legal_professional":
    case "rent_rates":
    case "advertising":
    case "bank_charges":
    case "depreciation":
    case "insurance":
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
