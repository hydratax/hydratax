-- Allow practice members to delete clients (cascades to module tables).

drop policy if exists "clients_delete_member" on public.clients;

create policy "clients_delete_member"
  on public.clients for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = clients.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

drop policy if exists "invoices_delete_member" on public.client_invoices;

create policy "invoices_delete_member"
  on public.client_invoices for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = client_invoices.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
