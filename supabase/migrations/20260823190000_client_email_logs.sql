-- Client communication log (emails sent to clients from practice users).

create table if not exists public.client_email_logs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  from_email text not null,
  to_email text not null,
  subject text not null,
  message_preview text,
  kind text not null default 'general',
  document_count integer not null default 0,
  delivery text not null default 'logged',
  accounts_due text,
  created_at timestamptz not null default now()
);

create index if not exists client_email_logs_client_idx
  on public.client_email_logs (client_id);

create index if not exists client_email_logs_practice_idx
  on public.client_email_logs (practice_id);

create index if not exists client_email_logs_created_idx
  on public.client_email_logs (created_at desc);

alter table public.client_email_logs enable row level security;

drop policy if exists "client_email_logs_select_member" on public.client_email_logs;
create policy "client_email_logs_select_member"
  on public.client_email_logs for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_email_logs.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "client_email_logs_insert_member" on public.client_email_logs;
create policy "client_email_logs_insert_member"
  on public.client_email_logs for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_email_logs.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
