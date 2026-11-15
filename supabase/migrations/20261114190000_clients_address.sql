-- Postal / trading address for desk clients (manual entry on create/edit).
alter table public.clients
  add column if not exists address text;
