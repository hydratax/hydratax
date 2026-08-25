-- Per-user Government Gateway credentials (Transaction Engine).
-- Strict isolation: only the owning auth user can read/write their rows.
-- Secrets are AES-GCM encrypted by the app before insert (never plaintext).

create table if not exists public.user_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sender_id_encrypted text not null,
  password_encrypted text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists user_gateway_credentials_user_idx
  on public.user_gateway_credentials (user_id);

create index if not exists user_gateway_credentials_client_idx
  on public.user_gateway_credentials (client_id);

alter table public.user_gateway_credentials enable row level security;

drop policy if exists "ugc_select_own" on public.user_gateway_credentials;
drop policy if exists "ugc_insert_own" on public.user_gateway_credentials;
drop policy if exists "ugc_update_own" on public.user_gateway_credentials;
drop policy if exists "ugc_delete_own" on public.user_gateway_credentials;

-- Owner-only: even practice colleagues cannot see another user's GG secrets.
create policy "ugc_select_own"
  on public.user_gateway_credentials for select
  using (user_id = auth.uid());

create policy "ugc_insert_own"
  on public.user_gateway_credentials for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.practice_members m
      where m.practice_id = user_gateway_credentials.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
    and exists (
      select 1 from public.clients c
      where c.id = user_gateway_credentials.client_id
        and c.practice_id = user_gateway_credentials.practice_id
    )
  );

create policy "ugc_update_own"
  on public.user_gateway_credentials for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ugc_delete_own"
  on public.user_gateway_credentials for delete
  using (user_id = auth.uid());
