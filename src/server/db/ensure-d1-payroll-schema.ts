import { isD1Configured, d1Execute, d1Query } from "@/server/db/d1";

let ensured = false;

/**
 * D1 has no IF NOT EXISTS for ADD COLUMN — ignore duplicate-column errors.
 * Sales-demo payroll seed was silently failing without gender / DOB / address.
 */
export async function ensureD1PayrollSchema() {
  if (ensured || !isD1Configured()) return;
  for (const sql of [
    "ALTER TABLE employees ADD COLUMN gender TEXT",
    "ALTER TABLE employees ADD COLUMN date_of_birth TEXT",
    "ALTER TABLE employees ADD COLUMN address TEXT",
    "ALTER TABLE employees ADD COLUMN tax_basis TEXT DEFAULT 'cumulative'",
    "ALTER TABLE employees ADD COLUMN student_loan_plan TEXT",
    "ALTER TABLE employees ADD COLUMN postgraduate_loan INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN is_director INTEGER DEFAULT 0",
    "ALTER TABLE employees ADD COLUMN directors_nic_method TEXT DEFAULT 'AN'",
    "ALTER TABLE employees ADD COLUMN bank_sort_code TEXT",
    "ALTER TABLE employees ADD COLUMN bank_account_number TEXT",
    "ALTER TABLE employees ADD COLUMN bank_account_name TEXT",
  ]) {
    try {
      await d1Execute(sql);
    } catch {
      // column already exists (or transient) — verify below
    }
  }
  try {
    const cols = await d1Query<{ name: string }>("PRAGMA table_info(employees)");
    const names = new Set(cols.map((c) => String(c.name)));
    ensured =
      names.has("gender") &&
      names.has("date_of_birth") &&
      names.has("address") &&
      names.has("tax_basis");
  } catch {
    ensured = false;
  }
}
