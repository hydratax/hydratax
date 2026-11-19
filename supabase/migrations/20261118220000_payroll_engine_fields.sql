-- PAYE engine fields: tax basis, student loans, directors, bank (future BACS), AE stub.
alter table employees
  add column if not exists tax_basis text not null default 'cumulative',
  add column if not exists student_loan_plan text,
  add column if not exists postgraduate_loan boolean not null default false,
  add column if not exists is_director boolean not null default false,
  add column if not exists bank_sort_code text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_name text;

create table if not exists payroll_ae_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  employee_id uuid not null references employees(id),
  assessment_date text not null,
  worker_status text not null default 'unknown',
  postponement_end text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_ae_assessments_employee_idx
  on payroll_ae_assessments (employee_id);
