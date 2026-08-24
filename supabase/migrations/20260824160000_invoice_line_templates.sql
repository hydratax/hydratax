-- Invoice line templates + extra invoice fields (PO / payment instructions)

create table if not exists public.invoice_line_templates (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  label text,
  description text not null,
  quantity numeric not null default 1,
  unit_price_pence integer not null default 0,
  vat_rate_bps integer not null default 2000
    check (vat_rate_bps in (0, 500, 2000)),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_line_templates_practice_idx
  on public.invoice_line_templates (practice_id);

alter table public.invoice_line_templates enable row level security;

create policy "invoice_templates_select_member"
  on public.invoice_line_templates for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = invoice_line_templates.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "invoice_templates_insert_member"
  on public.invoice_line_templates for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = invoice_line_templates.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "invoice_templates_update_member"
  on public.invoice_line_templates for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = invoice_line_templates.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "invoice_templates_delete_member"
  on public.invoice_line_templates for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = invoice_line_templates.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

alter table public.client_invoices
  add column if not exists reference text,
  add column if not exists payment_instructions text;
