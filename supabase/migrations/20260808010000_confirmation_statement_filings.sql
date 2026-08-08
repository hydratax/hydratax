-- Confirmation statement direct-filing packages (CS01)
-- Personal codes + company auth codes stored encrypted only.

create table if not exists public.confirmation_statement_filings (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (status in (
      'draft', 'validated', 'queued', 'submitting',
      'submitted', 'accepted', 'rejected', 'failed'
    )),
  company_number text not null,
  company_name text not null,
  confirmation_date date not null,
  client_id uuid,
  practice_id uuid,
  encrypted_secrets text,
  director_names jsonb not null default '[]'::jsonb,
  lawful_purpose_confirmed boolean not null default false,
  registered_email text,
  ch_transaction_ref text,
  ch_submission_number text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_filings_company_idx
  on public.confirmation_statement_filings (company_number);

create index if not exists cs_filings_status_idx
  on public.confirmation_statement_filings (status);

create index if not exists cs_filings_practice_idx
  on public.confirmation_statement_filings (practice_id);

alter table public.confirmation_statement_filings enable row level security;
