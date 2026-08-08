-- Team module scopes for practice members
-- full | payroll | vat | corporation_tax

alter table public.practice_members
  add column if not exists module_access text not null default 'full'
  check (module_access in ('full', 'payroll', 'vat', 'corporation_tax'));

alter table public.practice_members
  add column if not exists display_name text;

alter table public.practice_members
  add column if not exists email text;

-- Invoices per client
create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null,
  invoice_number text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'due', 'paid', 'void')),
  issue_date date not null,
  due_date date not null,
  currency text not null default 'gbp',
  subtotal_pence integer not null default 0,
  vat_pence integer not null default 0,
  total_pence integer not null default 0,
  notes text,
  line_items jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_invoices_client_idx
  on public.client_invoices (client_id);

create index if not exists client_invoices_practice_idx
  on public.client_invoices (practice_id);

alter table public.client_invoices enable row level security;

create policy "invoices_select_member"
  on public.client_invoices for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_invoices.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "invoices_insert_member"
  on public.client_invoices for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_invoices.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
        and m.module_access in ('full')
    )
  );

create policy "invoices_update_member"
  on public.client_invoices for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_invoices.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
        and m.module_access in ('full')
    )
  );
