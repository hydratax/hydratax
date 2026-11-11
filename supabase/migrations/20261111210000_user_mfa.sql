-- Per-user two-factor authentication (email OTP or SMS OTP).

create table if not exists public.user_mfa_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  channel text check (channel is null or channel in ('email', 'phone', 'totp')),
  alt_email text,
  phone_e164 text,
  updated_at timestamptz not null default now()
);

alter table public.user_mfa_settings enable row level security;

drop policy if exists "user_mfa_settings_select_own" on public.user_mfa_settings;
create policy "user_mfa_settings_select_own"
  on public.user_mfa_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_mfa_settings_upsert_own" on public.user_mfa_settings;
create policy "user_mfa_settings_insert_own"
  on public.user_mfa_settings for insert
  with check (auth.uid() = user_id);

create policy "user_mfa_settings_update_own"
  on public.user_mfa_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  channel text not null check (channel in ('email', 'phone')),
  destination text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mfa_challenges_user_idx
  on public.mfa_challenges (user_id, created_at desc);

alter table public.mfa_challenges enable row level security;

-- Challenges are written/read from server actions (user session).
drop policy if exists "mfa_challenges_own" on public.mfa_challenges;
create policy "mfa_challenges_select_own"
  on public.mfa_challenges for select
  using (auth.uid() = user_id);

create policy "mfa_challenges_insert_own"
  on public.mfa_challenges for insert
  with check (auth.uid() = user_id);

create policy "mfa_challenges_delete_own"
  on public.mfa_challenges for delete
  using (auth.uid() = user_id);
