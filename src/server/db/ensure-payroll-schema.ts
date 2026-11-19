import { neon } from "@neondatabase/serverless";
import { isMemoryStore } from "@/lib/env";

let ensured = false;

/**
 * Apply payroll columns/tables at runtime so production never waits on a
 * manual Supabase SQL paste. Safe to call on every payroll action.
 */
export async function ensurePayrollSchema() {
  if (ensured || isMemoryStore()) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = neon(url);

  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS payroll_id text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_frequency text NOT NULL DEFAULT 'M1'`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ni_category text NOT NULL DEFAULT 'A'`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_date text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS starter_declaration text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_fps_sent boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS previous_payroll_id text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS hours_per_week integer NOT NULL DEFAULT 3750`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate_pence integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_basis text NOT NULL DEFAULT 'salary'`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pension_opt_out boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS ssp_qualifying_days integer NOT NULL DEFAULT 5`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bf_tax_year text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bf_taxable_pence integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bf_tax_pence integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bf_employee_ni_pence integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS address text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_basis text NOT NULL DEFAULT 'cumulative'`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS student_loan_plan text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS postgraduate_loan boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_director boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS directors_nic_method text NOT NULL DEFAULT 'AN'`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_sort_code text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_number text`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_name text`;

  await sql`ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS pay_frequency text NOT NULL DEFAULT 'M1'`;
  await sql`ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'FPS'`;

  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS payroll_pack_password_encrypted text`;

  await sql`
    CREATE TABLE IF NOT EXISTS payroll_timesheets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id),
      period_start text NOT NULL,
      period_end text NOT NULL,
      filename text NOT NULL,
      rows jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS payroll_timesheets_period_uidx
      ON payroll_timesheets (client_id, period_start, period_end)
  `;

  /** AE assessment stub — worker status / postponement (no provider API yet). */
  await sql`
    CREATE TABLE IF NOT EXISTS payroll_ae_assessments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id),
      employee_id uuid NOT NULL REFERENCES employees(id),
      assessment_date text NOT NULL,
      worker_status text NOT NULL DEFAULT 'unknown',
      postponement_end text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS payroll_ae_assessments_employee_idx
      ON payroll_ae_assessments (employee_id)
  `;

  ensured = true;
}
