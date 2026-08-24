-- Allow practice owners/admins to manage team members (not only self-insert).

drop policy if exists "members_insert_self_owner" on public.practice_members;
drop policy if exists "members_insert_owner" on public.practice_members;
drop policy if exists "members_update_owner" on public.practice_members;
drop policy if exists "members_delete_owner" on public.practice_members;
drop policy if exists "members_select_own_practice" on public.practice_members;

create policy "members_select_practice"
  on public.practice_members for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_members.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "members_insert_owner"
  on public.practice_members for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_members.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "members_update_owner"
  on public.practice_members for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_members.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "members_delete_owner"
  on public.practice_members for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_members.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
