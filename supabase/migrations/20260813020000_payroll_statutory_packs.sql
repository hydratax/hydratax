-- Statutory pay, auto-enrolment fields, timesheets, client pack password.
-- Also applied at runtime by src/server/db/ensure-payroll-schema.ts.

alter table employees
  add column if not exists hours_per_week integer not null default 3750,
  add column if not exists hourly_rate_pence integer not null default 0,
  add column if not exists pay_basis text not null default 'salary',
  add column if not exists pension_opt_out boolean not null default false,
  add column if not exists ssp_qualifying_days integer not null default 5;

alter table clients
  add column if not exists payroll_pack_password_encrypted text;

create table if not exists payroll_timesheets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  period_start text not null,
  period_end text not null,
  filename text not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists payroll_timesheets_period_uidx
  on payroll_timesheets (client_id, period_start, period_end);

create index if not exists payroll_timesheets_client_idx
  on payroll_timesheets (client_id);
