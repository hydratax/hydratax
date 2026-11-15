-- HMRC MTD OAuth token store (VAT / ITSA). Tokens are AES-GCM encrypted by the app.

create table if not exists public.hmrc_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  hmrc_env text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create index if not exists hmrc_connections_client_idx
  on public.hmrc_connections (client_id);

alter table public.hmrc_connections enable row level security;

-- Practice members can see connection metadata for their clients.
-- Token ciphertext is never useful without TOKEN_ENCRYPTION_KEY (server-only).
drop policy if exists "hmrc_connections_select_member" on public.hmrc_connections;
create policy "hmrc_connections_select_member"
  on public.hmrc_connections for select
  using (
    exists (
      select 1
      from public.clients c
      join public.practice_members m on m.practice_id = c.practice_id
      where c.id = hmrc_connections.client_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner', 'readonly')
    )
  );

drop policy if exists "hmrc_connections_insert_member" on public.hmrc_connections;
create policy "hmrc_connections_insert_member"
  on public.hmrc_connections for insert
  with check (
    exists (
      select 1
      from public.clients c
      join public.practice_members m on m.practice_id = c.practice_id
      where c.id = hmrc_connections.client_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

drop policy if exists "hmrc_connections_update_member" on public.hmrc_connections;
create policy "hmrc_connections_update_member"
  on public.hmrc_connections for update
  using (
    exists (
      select 1
      from public.clients c
      join public.practice_members m on m.practice_id = c.practice_id
      where c.id = hmrc_connections.client_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.practice_members m on m.practice_id = c.practice_id
      where c.id = hmrc_connections.client_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

drop policy if exists "hmrc_connections_delete_member" on public.hmrc_connections;
create policy "hmrc_connections_delete_member"
  on public.hmrc_connections for delete
  using (
    exists (
      select 1
      from public.clients c
      join public.practice_members m on m.practice_id = c.practice_id
      where c.id = hmrc_connections.client_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
