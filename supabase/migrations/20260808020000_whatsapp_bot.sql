-- WhatsApp client document bot (Meta Cloud API + Supabase Storage)
-- Run in Supabase SQL editor after creating a private Storage bucket named: documents

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Clients reachable by WhatsApp (phone = digits only, e.g. 447700900123)
-- verification_pin = last 4 of UTR / NINO / practice-issued PIN
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices (id) on delete set null,
  name text not null,
  phone text not null,
  verification_pin text not null,
  created_at timestamptz not null default now(),
  constraint clients_phone_unique unique (phone)
);

create index if not exists clients_phone_idx on public.clients (phone);

alter table public.clients enable row level security;

-- Bot uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). No anon policies.

-- ---------------------------------------------------------------------------
-- Conversation state
-- ---------------------------------------------------------------------------
create table if not exists public.bot_sessions (
  phone text primary key,
  session_stage text not null default 'IDLE'
    check (session_stage in ('IDLE', 'AWAITING_VERIFICATION', 'AUTHENTICATED')),
  client_id uuid references public.clients (id) on delete set null,
  pending_document_category text,
  pending_tax_year text,
  updated_at timestamptz not null default now()
);

alter table public.bot_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Document index → paths inside Storage bucket "documents"
-- ---------------------------------------------------------------------------
create table if not exists public.client_storage_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  category text not null,
  tax_year text,
  title text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_storage_documents_client_idx
  on public.client_storage_documents (client_id, category);

alter table public.client_storage_documents enable row level security;

-- Example seed (replace phone / pin / path with real values):
-- insert into public.clients (name, phone, verification_pin)
-- values ('Amina Patel', '447700900123', '4321');
--
-- insert into public.client_storage_documents (client_id, category, tax_year, title, storage_path)
-- values (
--   (select id from public.clients where phone = '447700900123'),
--   'self_assessment',
--   '2024-25',
--   'Self Assessment tax return 2024-25',
--   '447700900123/self_assessment/2024-25.pdf'
-- );
