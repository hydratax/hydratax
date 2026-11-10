-- Practice time & fees (billable WIP) against clients

create table if not exists public.practice_time_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  work_date date not null,
  description text not null,
  minutes integer not null check (minutes > 0 and minutes <= 24 * 60 * 14),
  rate_pence_per_hour integer not null check (rate_pence_per_hour >= 0),
  amount_pence integer not null check (amount_pence >= 0),
  staff_name text,
  status text not null default 'wip'
    check (status in ('wip', 'billed', 'written_off')),
  invoice_id uuid references public.client_invoices (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practice_time_entries_client_idx
  on public.practice_time_entries (client_id, work_date desc);

create index if not exists practice_time_entries_practice_idx
  on public.practice_time_entries (practice_id, status);

alter table public.practice_time_entries enable row level security;

create policy "time_entries_select_member"
  on public.practice_time_entries for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_time_entries.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "time_entries_insert_member"
  on public.practice_time_entries for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_time_entries.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "time_entries_update_member"
  on public.practice_time_entries for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_time_entries.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "time_entries_delete_member"
  on public.practice_time_entries for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_time_entries.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
