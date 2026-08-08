-- HydraTax: idempotent bootstrap of all required public tables
-- Safe to re-run. Project: uytcstgitxwrwuffgmyh

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  first_name text,
  surname text,
  org_type text check (org_type in ('company', 'sole_trader', 'partnership', 'practice')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Practices + members
-- ---------------------------------------------------------------------------
create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text check (org_type in ('company', 'sole_trader', 'partnership', 'practice')),
  created_at timestamptz not null default now()
);

alter table public.practices enable row level security;

create table if not exists public.practice_members (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'admin', 'practitioner', 'readonly')),
  created_at timestamptz not null default now(),
  unique (practice_id, user_id)
);

alter table public.practice_members enable row level security;
create index if not exists practice_members_user_idx on public.practice_members (user_id);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'practice_members' and column_name = 'module_access'
  ) then
    alter table public.practice_members
      add column module_access text not null default 'full'
      check (module_access in ('full', 'payroll', 'vat', 'corporation_tax'));
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'practice_members' and column_name = 'display_name'
  ) then
    alter table public.practice_members add column display_name text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'practice_members' and column_name = 'email'
  ) then
    alter table public.practice_members add column email text;
  end if;
end $$;

drop policy if exists "members_select_own_practice" on public.practice_members;
drop policy if exists "members_insert_self_owner" on public.practice_members;
drop policy if exists "practices_select_member" on public.practices;
drop policy if exists "practices_insert_authenticated" on public.practices;
drop policy if exists "practices_update_owner" on public.practices;

create policy "members_select_own_practice"
  on public.practice_members for select using (user_id = auth.uid());
create policy "members_insert_self_owner"
  on public.practice_members for insert with check (user_id = auth.uid());
create policy "practices_select_member"
  on public.practices for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practices.id and m.user_id = auth.uid()
    )
  );
create policy "practices_insert_authenticated"
  on public.practices for insert to authenticated with check (true);
create policy "practices_update_owner"
  on public.practices for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practices.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Signup trigger: profile + practice + owner membership
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
  practice_name text;
  meta_org text;
  meta_first text;
  meta_surname text;
begin
  meta_org := coalesce(new.raw_user_meta_data->>'org_type', 'practice');
  meta_first := coalesce(new.raw_user_meta_data->>'first_name', '');
  meta_surname := coalesce(new.raw_user_meta_data->>'surname', '');
  practice_name := coalesce(
    nullif(new.raw_user_meta_data->>'org_search', ''),
    nullif(trim(meta_first || ' ' || meta_surname), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, first_name, surname, org_type)
  values (new.id, new.email, meta_first, meta_surname, meta_org)
  on conflict (id) do nothing;

  insert into public.practices (name, org_type)
  values (practice_name, meta_org)
  returning id into new_practice_id;

  insert into public.practice_members (practice_id, user_id, role)
  values (new_practice_id, new.id, 'owner')
  on conflict (practice_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Documents metadata
-- ---------------------------------------------------------------------------
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid,
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  r2_key text not null,
  category text not null default 'general',
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.client_documents enable row level security;
create index if not exists client_documents_practice_idx on public.client_documents (practice_id);

drop policy if exists "documents_select_member" on public.client_documents;
drop policy if exists "documents_insert_member" on public.client_documents;
drop policy if exists "documents_delete_member" on public.client_documents;

create policy "documents_select_member"
  on public.client_documents for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id and m.user_id = auth.uid()
    )
  );
create policy "documents_insert_member"
  on public.client_documents for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid() and m.role <> 'readonly'
    )
  );
create policy "documents_delete_member"
  on public.client_documents for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

-- ---------------------------------------------------------------------------
-- Practice subscriptions + checkout orders (Stripe entitlements)
-- ---------------------------------------------------------------------------
create table if not exists public.practice_subscriptions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  plan_key text not null,
  status text not null default 'active',
  stripe_session_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  unique (stripe_session_id)
);

create index if not exists practice_subs_practice_idx on public.practice_subscriptions (practice_id);
alter table public.practice_subscriptions enable row level security;

drop policy if exists "subs_select_member" on public.practice_subscriptions;
drop policy if exists "subs_insert_member" on public.practice_subscriptions;
drop policy if exists "subs_update_member" on public.practice_subscriptions;

create policy "subs_select_member"
  on public.practice_subscriptions for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id and m.user_id = auth.uid()
    )
  );
create policy "subs_insert_member"
  on public.practice_subscriptions for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
create policy "subs_update_member"
  on public.practice_subscriptions for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_key text not null,
  amount_total integer,
  currency text,
  customer_email text,
  status text not null default 'paid',
  mode text,
  practice_id uuid references public.practices (id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.checkout_orders enable row level security;

drop policy if exists "orders_select_own_email_or_practice" on public.checkout_orders;
create policy "orders_select_own_email_or_practice"
  on public.checkout_orders for select
  using (
    (
      customer_email is not null
      and lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1 from public.practice_members m
      where m.practice_id = checkout_orders.practice_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Client invoices
-- ---------------------------------------------------------------------------
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

create index if not exists client_invoices_client_idx on public.client_invoices (client_id);
create index if not exists client_invoices_practice_idx on public.client_invoices (practice_id);
alter table public.client_invoices enable row level security;

drop policy if exists "invoices_select_member" on public.client_invoices;
drop policy if exists "invoices_insert_member" on public.client_invoices;
drop policy if exists "invoices_update_member" on public.client_invoices;

create policy "invoices_select_member"
  on public.client_invoices for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_invoices.practice_id and m.user_id = auth.uid()
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
    )
  );

-- ---------------------------------------------------------------------------
-- Feature request board
-- ---------------------------------------------------------------------------
create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_name text not null,
  author_email text,
  author_user_id text,
  status text not null default 'open'
    check (status in ('open', 'planned', 'shipping', 'shipped')),
  vote_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_votes_idx
  on public.feature_requests (vote_count desc, created_at desc);
create index if not exists feature_requests_status_idx on public.feature_requests (status);

create table if not exists public.feature_votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feature_requests (id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists feature_votes_request_voter_uidx
  on public.feature_votes (request_id, voter_key);
create index if not exists feature_votes_voter_idx on public.feature_votes (voter_key);

alter table public.feature_requests enable row level security;
alter table public.feature_votes enable row level security;

drop policy if exists "feature_requests_public_read" on public.feature_requests;
drop policy if exists "feature_votes_public_read" on public.feature_votes;
create policy "feature_requests_public_read" on public.feature_requests for select using (true);
create policy "feature_votes_public_read" on public.feature_votes for select using (true);

-- ---------------------------------------------------------------------------
-- Confirmation statement filings
-- ---------------------------------------------------------------------------
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

create index if not exists cs_filings_company_idx on public.confirmation_statement_filings (company_number);
create index if not exists cs_filings_status_idx on public.confirmation_statement_filings (status);
create index if not exists cs_filings_practice_idx on public.confirmation_statement_filings (practice_id);
alter table public.confirmation_statement_filings enable row level security;

drop policy if exists "cs_filings_select_member" on public.confirmation_statement_filings;
create policy "cs_filings_select_member"
  on public.confirmation_statement_filings for select
  using (
    practice_id is null
    or exists (
      select 1 from public.practice_members m
      where m.practice_id = confirmation_statement_filings.practice_id
        and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: any auth user without a practice membership gets one
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  new_practice_id uuid;
  pname text;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (
      select 1 from public.practice_members m where m.user_id = u.id
    )
  loop
    pname := coalesce(
      nullif(r.raw_user_meta_data->>'org_search', ''),
      nullif(trim(coalesce(r.raw_user_meta_data->>'first_name','') || ' ' || coalesce(r.raw_user_meta_data->>'surname','')), ''),
      split_part(r.email, '@', 1),
      'Practice'
    );
    insert into public.practices (name, org_type)
    values (pname, coalesce(r.raw_user_meta_data->>'org_type', 'practice'))
    returning id into new_practice_id;

    insert into public.practice_members (practice_id, user_id, role)
    values (new_practice_id, r.id, 'owner');

    insert into public.profiles (id, email, first_name, surname, org_type)
    values (
      r.id,
      r.email,
      r.raw_user_meta_data->>'first_name',
      r.raw_user_meta_data->>'surname',
      coalesce(r.raw_user_meta_data->>'org_type', 'practice')
    )
    on conflict (id) do nothing;
  end loop;
end $$;
