-- Practice-wide activity log (admin) + support tickets raised from the desk.

create table if not exists public.practice_activity_logs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  summary text not null,
  entity_type text,
  entity_id text,
  client_id uuid references public.clients (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists practice_activity_logs_practice_idx
  on public.practice_activity_logs (practice_id, created_at desc);

create index if not exists practice_activity_logs_client_idx
  on public.practice_activity_logs (client_id);

alter table public.practice_activity_logs enable row level security;

drop policy if exists "practice_activity_logs_select_admin" on public.practice_activity_logs;
create policy "practice_activity_logs_select_admin"
  on public.practice_activity_logs for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_activity_logs.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "practice_activity_logs_insert_member" on public.practice_activity_logs;
create policy "practice_activity_logs_insert_member"
  on public.practice_activity_logs for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_activity_logs.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  raised_by uuid references auth.users (id) on delete set null,
  ticket_ref text not null,
  subject text not null,
  message text not null,
  help_topic text,
  module text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  page_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_tickets_ref_uidx
  on public.support_tickets (ticket_ref);

create index if not exists support_tickets_practice_idx
  on public.support_tickets (practice_id, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_select_member" on public.support_tickets;
create policy "support_tickets_select_member"
  on public.support_tickets for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = support_tickets.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "support_tickets_insert_member" on public.support_tickets;
create policy "support_tickets_insert_member"
  on public.support_tickets for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = support_tickets.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
