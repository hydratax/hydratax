export type BankCategory =
  | "turnover"
  | "other_income"
  | "cost_of_sales"
  | "admin_expenses"
  | "travel"
  | "premises"
  | "professional_fees"
  | "bank_charges"
  | "drawings"
  | "tax"
  | "transfer"
  | "uncategorised";

export const CATEGORY_LABELS: Record<BankCategory, string> = {
  turnover: "Turnover / sales",
  other_income: "Other income",
  cost_of_sales: "Cost of sales",
  admin_expenses: "Admin expenses",
  travel: "Travel",
  premises: "Premises",
  professional_fees: "Professional fees",
  bank_charges: "Bank charges",
  drawings: "Drawings",
  tax: "Tax / HMRC",
  transfer: "Transfer",
  uncategorised: "Uncategorised",
};
