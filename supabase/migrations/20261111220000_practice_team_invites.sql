-- Pending team invites (email signup link before the user has a HydraTax account).

create table if not exists public.practice_team_invites (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  email text not null,
  display_name text not null,
  module_access text not null default 'payroll',
  invited_by uuid references auth.users (id) on delete set null,
  token text not null unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists practice_team_invites_practice_email_uidx
  on public.practice_team_invites (practice_id, lower(email))
  where accepted_at is null;

create index if not exists practice_team_invites_token_idx
  on public.practice_team_invites (token);

alter table public.practice_team_invites enable row level security;

drop policy if exists "practice_team_invites_select" on public.practice_team_invites;
create policy "practice_team_invites_select"
  on public.practice_team_invites for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "practice_team_invites_insert" on public.practice_team_invites;
create policy "practice_team_invites_insert"
  on public.practice_team_invites for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "practice_team_invites_update" on public.practice_team_invites;
create policy "practice_team_invites_update"
  on public.practice_team_invites for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "practice_team_invites_delete" on public.practice_team_invites;
create policy "practice_team_invites_delete"
  on public.practice_team_invites for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
