-- Practice letterhead for formal client letters
alter table public.practices
  add column if not exists letterhead jsonb;

comment on column public.practices.letterhead is
  'Letterhead/footer JSON for formal accountant letters (name, address, contact, footer lines).';
