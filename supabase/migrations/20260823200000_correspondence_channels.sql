-- Correspondence templates support, document requests, WhatsApp/email channels

alter table public.clients
  add column if not exists contact_phone text,
  add column if not exists document_status text not null default 'none',
  add column if not exists document_status_updated_at timestamptz;

create table if not exists public.correspondence_templates (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  key text not null,
  name text not null,
  channel text not null default 'email',
  subject text,
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, key)
);

create table if not exists public.client_document_requests (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  template_key text not null,
  status text not null default 'requested',
  period_start date,
  period_end date,
  subject text,
  body text,
  channel text not null default 'email',
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  created_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists client_document_requests_client_idx
  on public.client_document_requests (client_id);

create table if not exists public.practice_channel_connections (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  channel text not null,
  status text not null default 'disconnected',
  external_account_id text,
  display_name text,
  credentials_encrypted text,
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, channel)
);

create table if not exists public.client_channel_messages (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  channel text not null,
  direction text not null,
  from_address text not null,
  to_address text,
  subject text,
  body_text text,
  body_preview text,
  external_id text,
  thread_id text,
  matched_by text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (practice_id, channel, external_id)
);

create index if not exists client_channel_messages_client_idx
  on public.client_channel_messages (client_id, sent_at desc);

alter table public.correspondence_templates enable row level security;
alter table public.client_document_requests enable row level security;
alter table public.practice_channel_connections enable row level security;
alter table public.client_channel_messages enable row level security;

drop policy if exists "corr_templates_member" on public.correspondence_templates;
create policy "corr_templates_member" on public.correspondence_templates for all
  using (exists (select 1 from public.practice_members m where m.practice_id = correspondence_templates.practice_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.practice_members m where m.practice_id = correspondence_templates.practice_id and m.user_id = auth.uid() and m.role in ('owner','admin','practitioner')));

drop policy if exists "doc_requests_member" on public.client_document_requests;
create policy "doc_requests_member" on public.client_document_requests for all
  using (exists (select 1 from public.practice_members m where m.practice_id = client_document_requests.practice_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.practice_members m where m.practice_id = client_document_requests.practice_id and m.user_id = auth.uid() and m.role in ('owner','admin','practitioner')));

drop policy if exists "channel_conn_member" on public.practice_channel_connections;
create policy "channel_conn_member" on public.practice_channel_connections for all
  using (exists (select 1 from public.practice_members m where m.practice_id = practice_channel_connections.practice_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.practice_members m where m.practice_id = practice_channel_connections.practice_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

drop policy if exists "channel_msg_member" on public.client_channel_messages;
create policy "channel_msg_member" on public.client_channel_messages for all
  using (exists (select 1 from public.practice_members m where m.practice_id = client_channel_messages.practice_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.practice_members m where m.practice_id = client_channel_messages.practice_id and m.user_id = auth.uid() and m.role in ('owner','admin','practitioner')));
