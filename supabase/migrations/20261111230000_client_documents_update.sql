-- Allow practice members to retag documents (e.g. prior-year SA100 / SA302).

drop policy if exists "documents_update_member" on public.client_documents;
create policy "documents_update_member"
  on public.client_documents for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid()
        and m.role <> 'readonly'
    )
  )
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_documents.practice_id
        and m.user_id = auth.uid()
        and m.role <> 'readonly'
    )
  );
