-- Practice-specific bank category labels (stored as custom:{id} on transactions).

create table if not exists public.custom_bank_categories (
  id text primary key,
  practice_id uuid not null references public.practices (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists custom_bank_categories_practice_idx
  on public.custom_bank_categories (practice_id);

create unique index if not exists custom_bank_categories_practice_label_uidx
  on public.custom_bank_categories (practice_id, lower(label));

alter table public.custom_bank_categories enable row level security;

create policy "custom_bank_categories_select_member"
  on public.custom_bank_categories for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = custom_bank_categories.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "custom_bank_categories_insert_member"
  on public.custom_bank_categories for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = custom_bank_categories.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "custom_bank_categories_update_member"
  on public.custom_bank_categories for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = custom_bank_categories.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "custom_bank_categories_delete_member"
  on public.custom_bank_categories for delete
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = custom_bank_categories.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
