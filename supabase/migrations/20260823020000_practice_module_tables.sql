-- Practice desk modules: payroll, books, VAT, bank (Supabase is the system of record).

create or replace function public.user_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.clients c
    join public.practice_members m on m.practice_id = c.practice_id
    where c.id = p_client_id and m.user_id = auth.uid()
  );
$$;

do $$ begin
  create type public.ledger_type as enum ('income', 'expense');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.submission_status as enum (
    'draft',
    'ready',
    'submitted',
    'accepted',
    'rejected',
    'error'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  forename text not null,
  surname text not null,
  nino text not null,
  tax_code text not null,
  annual_salary_pence integer not null,
  start_date text not null,
  payroll_id text,
  pay_frequency text not null default 'M1',
  ni_category text not null default 'A',
  job_title text,
  leave_date text,
  starter_declaration text,
  first_fps_sent boolean not null default false,
  previous_payroll_id text,
  hours_per_week integer not null default 3750,
  hourly_rate_pence integer not null default 0,
  pay_basis text not null default 'salary',
  pension_opt_out boolean not null default false,
  ssp_qualifying_days integer not null default 5,
  bf_tax_year text,
  bf_taxable_pence integer not null default 0,
  bf_tax_pence integer not null default 0,
  bf_employee_ni_pence integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists employees_client_idx on public.employees (client_id);

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  pay_date text not null,
  period_start text not null,
  period_end text not null,
  pay_frequency text not null default 'M1',
  kind text not null default 'FPS',
  status public.submission_status not null default 'draft',
  totals jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  fps_xml_hash text,
  hmrc_correlation_id text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pay_runs_client_idx on public.pay_runs (client_id);

create table if not exists public.payroll_timesheets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_start text not null,
  period_end text not null,
  filename text not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_timesheets_client_idx on public.payroll_timesheets (client_id);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type public.ledger_type not null,
  description text not null,
  amount_pence integer not null,
  vat_rate_bps integer not null default 2000,
  vat_pence integer not null,
  dated text not null,
  category text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_client_idx on public.ledger_entries (client_id);

create table if not exists public.vat_returns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_key text not null,
  status public.submission_status not null default 'draft',
  boxes jsonb not null default '{}'::jsonb,
  hmrc_form_bundle_number text,
  hmrc_payment_indicator text,
  hmrc_processing_date text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, period_key)
);

create index if not exists vat_returns_client_idx on public.vat_returns (client_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  dated text not null,
  description text not null,
  amount_pence integer not null,
  balance_pence integer,
  category text,
  matched_ledger_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists bank_transactions_client_idx on public.bank_transactions (client_id);

alter table public.employees enable row level security;
alter table public.pay_runs enable row level security;
alter table public.payroll_timesheets enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.vat_returns enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists "employees_member_all" on public.employees;
create policy "employees_member_all"
  on public.employees for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));

drop policy if exists "pay_runs_member_all" on public.pay_runs;
create policy "pay_runs_member_all"
  on public.pay_runs for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));

drop policy if exists "payroll_timesheets_member_all" on public.payroll_timesheets;
create policy "payroll_timesheets_member_all"
  on public.payroll_timesheets for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));

drop policy if exists "ledger_entries_member_all" on public.ledger_entries;
create policy "ledger_entries_member_all"
  on public.ledger_entries for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));

drop policy if exists "vat_returns_member_all" on public.vat_returns;
create policy "vat_returns_member_all"
  on public.vat_returns for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));

drop policy if exists "bank_transactions_member_all" on public.bank_transactions;
create policy "bank_transactions_member_all"
  on public.bank_transactions for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));
