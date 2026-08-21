-- Companies House filing checkout queue (CS01, accounts, incorporation, etc.)
-- Practice IDs match public.practices from auth_profiles_practices.

create table if not exists public.companies_house_requests (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  service_id text not null,
  company_number text,
  account_ref text not null,
  payment_status text not null default 'unpaid',
  subscription_active boolean not null default false,
  plan_key text,
  status text not null default 'received',
  amount_pence integer not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ch_requests_practice_idx
  on public.companies_house_requests (practice_id);
create index if not exists ch_requests_status_idx
  on public.companies_house_requests (status);
create index if not exists ch_requests_payment_idx
  on public.companies_house_requests (payment_status);

alter table public.companies_house_requests enable row level security;

create policy "practice members read ch requests"
  on public.companies_house_requests
  for select
  using (
    exists (
      select 1 from public.practice_members pm
      where pm.practice_id = companies_house_requests.practice_id
        and pm.user_id = auth.uid()
    )
  );

create policy "practice members insert ch requests"
  on public.companies_house_requests
  for insert
  with check (
    exists (
      select 1 from public.practice_members pm
      where pm.practice_id = companies_house_requests.practice_id
        and pm.user_id = auth.uid()
    )
  );
