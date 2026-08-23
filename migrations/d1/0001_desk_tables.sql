-- HydraTax desk tables on Cloudflare D1 (SQLite).
-- Auth, practices, members, clients, subscriptions stay on Supabase.

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  forename TEXT NOT NULL,
  surname TEXT NOT NULL,
  nino TEXT NOT NULL,
  tax_code TEXT NOT NULL,
  annual_salary_pence INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  payroll_id TEXT,
  pay_frequency TEXT NOT NULL DEFAULT 'M1',
  ni_category TEXT NOT NULL DEFAULT 'A',
  job_title TEXT,
  leave_date TEXT,
  starter_declaration TEXT,
  first_fps_sent INTEGER NOT NULL DEFAULT 0,
  previous_payroll_id TEXT,
  hours_per_week INTEGER NOT NULL DEFAULT 3750,
  hourly_rate_pence INTEGER NOT NULL DEFAULT 0,
  pay_basis TEXT NOT NULL DEFAULT 'salary',
  pension_opt_out INTEGER NOT NULL DEFAULT 0,
  ssp_qualifying_days INTEGER NOT NULL DEFAULT 5,
  bf_tax_year TEXT,
  bf_taxable_pence INTEGER NOT NULL DEFAULT 0,
  bf_tax_pence INTEGER NOT NULL DEFAULT 0,
  bf_employee_ni_pence INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS employees_client_idx ON employees (client_id);

CREATE TABLE IF NOT EXISTS pay_runs (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  pay_frequency TEXT NOT NULL DEFAULT 'M1',
  kind TEXT NOT NULL DEFAULT 'FPS',
  status TEXT NOT NULL DEFAULT 'draft',
  totals TEXT NOT NULL DEFAULT '{}',
  lines TEXT NOT NULL DEFAULT '[]',
  fps_xml_hash TEXT,
  hmrc_correlation_id TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pay_runs_client_idx ON pay_runs (client_id);

CREATE TABLE IF NOT EXISTS payroll_timesheets (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  filename TEXT NOT NULL,
  rows TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payroll_timesheets_client_idx ON payroll_timesheets (client_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  vat_rate_bps INTEGER NOT NULL DEFAULT 2000,
  vat_pence INTEGER NOT NULL,
  dated TEXT NOT NULL,
  category TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ledger_entries_client_idx ON ledger_entries (client_id);

CREATE TABLE IF NOT EXISTS vat_returns (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  boxes TEXT NOT NULL DEFAULT '{}',
  hmrc_form_bundle_number TEXT,
  hmrc_payment_indicator TEXT,
  hmrc_processing_date TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, period_key)
);
CREATE INDEX IF NOT EXISTS vat_returns_client_idx ON vat_returns (client_id);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  dated TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  balance_pence INTEGER,
  category TEXT,
  matched_ledger_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bank_transactions_client_idx ON bank_transactions (client_id);
