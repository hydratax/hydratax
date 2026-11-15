-- Client invoice desk extras + Stripe Connect (practice payment gateways)
-- Local migration only until applied to remote (supabee / MCP). Do not invent Capium naming.

-- ---------------------------------------------------------------------------
-- Practices: Stripe Connect + invoice number defaults
-- ---------------------------------------------------------------------------
alter table public.practices
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_connected_at timestamptz,
  add column if not exists invoice_number_prefix text not null default 'INV',
  add column if not exists invoice_number_next integer not null default 1;

comment on column public.practices.stripe_connect_account_id is
  'Stripe Connect Standard account id (acct_…) for receiving client invoice payments';
comment on column public.practices.invoice_number_prefix is
  'Prefix for auto invoice numbers, e.g. INV → INV-000001';

create unique index if not exists practices_stripe_connect_account_uidx
  on public.practices (stripe_connect_account_id)
  where stripe_connect_account_id is not null;

-- ---------------------------------------------------------------------------
-- Client invoices: Zoho-like header / totals / pay / recurring hooks
-- ---------------------------------------------------------------------------
alter table public.client_invoices
  add column if not exists subject text,
  add column if not exists order_number text,
  add column if not exists payment_terms text,
  add column if not exists salesperson text,
  add column if not exists ar_account text default 'Accounts Receivable',
  add column if not exists discount_pence integer not null default 0,
  add column if not exists discount_percent_bps integer,
  add column if not exists shipping_pence integer not null default 0,
  add column if not exists adjustment_pence integer not null default 0,
  add column if not exists terms_conditions text,
  add column if not exists enable_online_pay boolean not null default false,
  add column if not exists recurring_enabled boolean not null default false,
  add column if not exists recurring_interval text
    check (recurring_interval is null or recurring_interval in ('weekly', 'monthly', 'quarterly', 'yearly')),
  add column if not exists pay_token uuid unique default gen_random_uuid(),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz;

comment on column public.client_invoices.pay_token is
  'Public token for /pay/{token} online card payment (Stripe Connect destination charge)';
comment on column public.client_invoices.enable_online_pay is
  'When true and practice has Connect, invoice email/print can offer Pay online';

create index if not exists client_invoices_pay_token_idx
  on public.client_invoices (pay_token)
  where pay_token is not null;

-- Backfill pay_token for existing rows
update public.client_invoices
set pay_token = gen_random_uuid()
where pay_token is null;
