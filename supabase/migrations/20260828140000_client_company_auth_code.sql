-- Store per-client Companies House authentication codes (from CH letter / bulk import).

alter table public.clients
  add column if not exists company_auth_code text;

comment on column public.clients.company_auth_code is
  'Six-character Companies House company authentication code for XML filings (CS01, accounts, etc.).';
