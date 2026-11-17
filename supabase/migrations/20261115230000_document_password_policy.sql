-- Practice preference: which client identifier locks each document desk section.
alter table public.practices
  add column if not exists document_password_policy jsonb;

comment on column public.practices.document_password_policy is
  'Per-section document pack password identifier (sa/ct/accounts/… → date_of_birth|company_utr|…).';
