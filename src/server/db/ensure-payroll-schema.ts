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

  ensured = true;
}
