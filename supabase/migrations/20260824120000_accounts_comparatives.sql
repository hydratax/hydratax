alter table public.clients
  add column if not exists accounts_comparatives jsonb;
