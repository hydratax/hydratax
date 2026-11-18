-- Durable VAT registration date on the client record (desk identifier + gate).
alter table public.clients
  add column if not exists vat_registration_date date;
