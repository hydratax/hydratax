-- Practice desk client records + immutable audit log (required for /clients/new).

do $$ begin
  create type public.client_type as enum (
    'sole_trader',
    'limited_company',
    'partnership'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  name text not null,
  type public.client_type not null,
  company_number text,
  utr text,
  vrn text,
  nino text,
  paye_ref text,
  accounts_office_ref text,
  is_employer boolean not null default false,
  is_vat_registered boolean not null default false,
  contact_email text,
  payroll_pack_password_encrypted text,
  companies_house jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_practice_idx on public.clients (practice_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid,
  client_id uuid,
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload_hash text,
  hmrc_status_code integer,
  hmrc_correlation_id text,
  detail jsonb,
  prev_hash text,
  event_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_client_idx on public.audit_events (client_id);
create index if not exists audit_practice_idx on public.audit_events (practice_id);
create index if not exists audit_created_idx on public.audit_events (created_at);

alter table public.clients enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "clients_select_member" on public.clients;
drop policy if exists "clients_insert_member" on public.clients;
drop policy if exists "clients_update_member" on public.clients;

create policy "clients_select_member"
  on public.clients for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = clients.practice_id and m.user_id = auth.uid()
    )
  );

create policy "clients_insert_member"
  on public.clients for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = clients.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "clients_update_member"
  on public.clients for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = clients.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

drop policy if exists "audit_select_member" on public.audit_events;
create policy "audit_select_member"
  on public.audit_events for select
  using (
    practice_id is null
    or exists (
      select 1 from public.practice_members m
      where m.practice_id = audit_events.practice_id and m.user_id = auth.uid()
    )
  );
