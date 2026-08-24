-- Fix infinite recursion in practice_members RLS.
-- Policies that subquery practice_members re-trigger RLS on the same table.

create or replace function public.is_practice_member(p_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practice_members m
    where m.practice_id = p_practice_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_practice_role(p_practice_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practice_members m
    where m.practice_id = p_practice_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.is_practice_member(uuid) from public;
revoke all on function public.has_practice_role(uuid, text[]) from public;
grant execute on function public.is_practice_member(uuid) to authenticated;
grant execute on function public.has_practice_role(uuid, text[]) to authenticated;

drop policy if exists "members_select_practice" on public.practice_members;
drop policy if exists "members_select_own_practice" on public.practice_members;
drop policy if exists "members_insert_owner" on public.practice_members;
drop policy if exists "members_insert_self_owner" on public.practice_members;
drop policy if exists "members_update_owner" on public.practice_members;
drop policy if exists "members_delete_owner" on public.practice_members;

create policy "members_select_practice"
  on public.practice_members for select
  using (
    user_id = auth.uid()
    or public.is_practice_member(practice_id)
  );

-- First owner can self-insert; owners/admins can invite teammates.
create policy "members_insert_owner"
  on public.practice_members for insert
  with check (
    (user_id = auth.uid() and role = 'owner')
    or public.has_practice_role(practice_id, array['owner', 'admin']::text[])
  );

create policy "members_update_owner"
  on public.practice_members for update
  using (public.has_practice_role(practice_id, array['owner', 'admin']::text[]))
  with check (public.has_practice_role(practice_id, array['owner', 'admin']::text[]));

create policy "members_delete_owner"
  on public.practice_members for delete
  using (public.has_practice_role(practice_id, array['owner', 'admin']::text[]));

drop policy if exists "practices_select_member" on public.practices;
drop policy if exists "practices_update_owner" on public.practices;

create policy "practices_select_member"
  on public.practices for select
  using (public.is_practice_member(id));

create policy "practices_update_owner"
  on public.practices for update
  using (public.has_practice_role(id, array['owner', 'admin']::text[]));
