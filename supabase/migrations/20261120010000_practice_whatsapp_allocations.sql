-- Shared HydraTax WhatsApp number: per-practice entitlements + send log.
-- Accountants do not connect their own Meta number; platform env credentials send on their behalf.

create table if not exists public.practice_whatsapp_allocations (
  practice_id uuid primary key references public.practices (id) on delete cascade,
  enabled boolean not null default false,
  -- HydraTax-issued credential (plaintext shown once to admin; store hash only)
  api_key_hash text,
  api_key_prefix text,
  monthly_message_limit integer not null default 0
    check (monthly_message_limit >= 0),
  monthly_document_limit integer not null default 0
    check (monthly_document_limit >= 0),
  used_messages integer not null default 0
    check (used_messages >= 0),
  used_documents integer not null default 0
    check (used_documents >= 0),
  -- Calendar month bucket "YYYY-MM" for usage counters
  period_ym text not null default to_char(now() at time zone 'Europe/London', 'YYYY-MM'),
  label text,
  notes text,
  assigned_by uuid,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  kind text not null default 'text'
    check (kind in ('text', 'document', 'template')),
  to_phone text not null,
  body_preview text,
  filename text,
  meta_message_id text,
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'skipped')),
  error_detail text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists practice_whatsapp_sends_practice_idx
  on public.practice_whatsapp_sends (practice_id, created_at desc);

alter table public.practice_whatsapp_allocations enable row level security;
alter table public.practice_whatsapp_sends enable row level security;

-- Practice members may read their own allocation / send history.
drop policy if exists "wa_alloc_member_select" on public.practice_whatsapp_allocations;
create policy "wa_alloc_member_select" on public.practice_whatsapp_allocations
  for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_whatsapp_allocations.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "wa_sends_member_select" on public.practice_whatsapp_sends;
create policy "wa_sends_member_select" on public.practice_whatsapp_sends
  for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_whatsapp_sends.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "wa_sends_member_insert" on public.practice_whatsapp_sends;
create policy "wa_sends_member_insert" on public.practice_whatsapp_sends
  for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_whatsapp_sends.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

-- Writes to allocations are via service role (platform admin actions).
