-- Security hardening (audit follow-up). Idempotent; does not edit older migrations.
--
--  1. practice_members: no more "self-insert as owner into ANY practice";
--     admins cannot create/promote owners; last owner cannot be removed/demoted.
--  2. practices: no client INSERT (practices are provisioned server-side).
--  3. Billing/entitlement tables are read-only for end users (server writes via
--     service role): practice_subscriptions, checkout_orders.
--  4. Append-only audit trails: audit_events, practice_activity_logs.
--  5. MFA tables are server-written only; OTP attempt counter column.
--  6. RLS on hmrc_sa_form_templates (read-only) and payroll_timesheets.
--  7. Team invites: accepted only by the server, never by the invitee's client.

-- ---------------------------------------------------------------------------
-- 0. Helper: does a practice already have any member?
--    SECURITY DEFINER so it can see all rows regardless of the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.practice_has_members(p_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.practice_members m where m.practice_id = p_practice_id
  );
$$;

revoke all on function public.practice_has_members(uuid) from public;
grant execute on function public.practice_has_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. practice_members
-- ---------------------------------------------------------------------------
drop policy if exists "members_insert_owner" on public.practice_members;
drop policy if exists "members_insert_self_owner" on public.practice_members;
drop policy if exists "members_update_owner" on public.practice_members;
drop policy if exists "members_delete_owner" on public.practice_members;

-- * First owner of an EMPTY practice may self-insert (bootstrap only).
-- * Owners may add anyone with any role.
-- * Admins may add non-owner roles only.
create policy "members_insert_owner"
  on public.practice_members for insert
  to authenticated
  with check (
    (
      user_id = auth.uid()
      and role = 'owner'
      and not public.practice_has_members(practice_id)
    )
    or public.has_practice_role(practice_id, array['owner']::text[])
    or (
      public.has_practice_role(practice_id, array['admin']::text[])
      and role in ('admin', 'practitioner', 'readonly')
    )
  );

-- Admins can manage non-owner rows and cannot promote anyone to owner.
create policy "members_update_owner"
  on public.practice_members for update
  to authenticated
  using (
    public.has_practice_role(practice_id, array['owner']::text[])
    or (
      public.has_practice_role(practice_id, array['admin']::text[])
      and role <> 'owner'
    )
  )
  with check (
    public.has_practice_role(practice_id, array['owner']::text[])
    or (
      public.has_practice_role(practice_id, array['admin']::text[])
      and role <> 'owner'
    )
  );

create policy "members_delete_owner"
  on public.practice_members for delete
  to authenticated
  using (
    public.has_practice_role(practice_id, array['owner']::text[])
    or (
      public.has_practice_role(practice_id, array['admin']::text[])
      and role <> 'owner'
    )
  );

-- Invariants for end-user (PostgREST) traffic: membership identity is immutable
-- and a practice always keeps at least one owner. Service role / SQL editor /
-- FK cascades (practice or user deletion) are unaffected.
create or replace function public.practice_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(auth.role(), '');
begin
  if caller_role not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.practice_id is distinct from old.practice_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Membership practice and user cannot be changed'
        using errcode = '42501';
    end if;
    if old.role = 'owner' and new.role <> 'owner' and not exists (
      select 1 from public.practice_members m
      where m.practice_id = old.practice_id
        and m.role = 'owner'
        and m.id <> old.id
    ) then
      raise exception 'A practice must keep at least one owner'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and not exists (
      select 1 from public.practice_members m
      where m.practice_id = old.practice_id
        and m.role = 'owner'
        and m.id <> old.id
    ) then
      raise exception 'A practice must keep at least one owner'
        using errcode = '42501';
    end if;
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.practice_members_guard() from public;

drop trigger if exists practice_members_guard on public.practice_members;
create trigger practice_members_guard
  before update or delete on public.practice_members
  for each row execute function public.practice_members_guard();

-- ---------------------------------------------------------------------------
-- 2. practices: provisioned server-side (service role) only
-- ---------------------------------------------------------------------------
drop policy if exists "practices_insert_authenticated" on public.practices;

-- ---------------------------------------------------------------------------
-- 3. Billing / entitlement tables: read-only for end users
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('practice_subscriptions', 'checkout_orders')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table if exists public.practice_subscriptions enable row level security;
alter table if exists public.checkout_orders enable row level security;

revoke insert, update, delete, truncate on public.practice_subscriptions from anon, authenticated;
revoke insert, update, delete, truncate on public.checkout_orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Append-only audit trails (no client INSERT/UPDATE/DELETE at all)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('audit_events', 'practice_activity_logs')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- audit_events: members only see their own practice (practice-less rows were
-- previously visible to every signed-in user).
drop policy if exists "audit_select_member" on public.audit_events;
create policy "audit_select_member"
  on public.audit_events for select
  to authenticated
  using (
    practice_id is not null
    and exists (
      select 1 from public.practice_members m
      where m.practice_id = audit_events.practice_id
        and m.user_id = auth.uid()
    )
  );

revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
revoke insert, update, delete, truncate on public.practice_activity_logs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. MFA: server-written only; OTP attempt counter
-- ---------------------------------------------------------------------------
alter table public.mfa_challenges
  add column if not exists attempts integer not null default 0;

do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = 'mfa_challenges'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_mfa_settings'
      and cmd <> 'SELECT'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- mfa_challenges: no policies => unreachable from the browser (code hashes are
-- never exposed). user_mfa_settings keeps SELECT-own only.
alter table public.mfa_challenges enable row level security;
revoke all on public.mfa_challenges from anon, authenticated;
revoke insert, update, delete, truncate on public.user_mfa_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Missing RLS
-- ---------------------------------------------------------------------------
alter table if exists public.hmrc_sa_form_templates enable row level security;

drop policy if exists "hmrc_sa_form_templates_select_authenticated"
  on public.hmrc_sa_form_templates;
create policy "hmrc_sa_form_templates_select_authenticated"
  on public.hmrc_sa_form_templates for select
  to authenticated
  using (true);

revoke insert, update, delete, truncate on public.hmrc_sa_form_templates from anon, authenticated;

-- payroll_timesheets is defined twice (20260813020000 without RLS, then
-- 20260823020000 with). Enabling again is a no-op where already on.
alter table if exists public.payroll_timesheets enable row level security;

-- ---------------------------------------------------------------------------
-- 7. Team invites: invitee must not be able to mutate/accept via the client.
--    Acceptance runs server-side (service role) after verifying the email.
-- ---------------------------------------------------------------------------
drop policy if exists "practice_team_invites_update" on public.practice_team_invites;
create policy "practice_team_invites_update"
  on public.practice_team_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_team_invites.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
