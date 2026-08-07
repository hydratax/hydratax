-- HydraTax Supabase schema: profiles, practices, membership, documents
-- Run in Supabase SQL editor or: supabase db query < file
-- Auth users live in auth.users; this extends them with practice data.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
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

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Practices
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

create index if not exists practice_members_user_idx
  on public.practice_members (user_id);

create policy "members_select_own_practice"
  on public.practice_members for select
  using (user_id = auth.uid());

create policy "members_insert_self_owner"
  on public.practice_members for insert
  with check (user_id = auth.uid());

create policy "practices_select_member"
  on public.practices for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practices.id and m.user_id = auth.uid()
    )
  );

create policy "practices_insert_authenticated"
  on public.practices for insert
  to authenticated
  with check (true);

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
-- Document metadata (files stored on Cloudflare R2)
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

create index if not exists client_documents_practice_idx
  on public.client_documents (practice_id);

create policy "documents_select_member"
  on public.client_documents for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "documents_insert_member"
  on public.client_documents for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid()
        and m.role <> 'readonly'
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
-- Auto-create profile + practice on signup
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
  values (new.id, new.email, meta_first, meta_surname, meta_org);

  insert into public.practices (name, org_type)
  values (practice_name, meta_org)
  returning id into new_practice_id;

  insert into public.practice_members (practice_id, user_id, role)
  values (new_practice_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
