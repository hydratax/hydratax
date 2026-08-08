-- Practice subscriptions + checkout orders (Stripe → entitlements)
-- Run in Supabase SQL editor after the auth/profiles migration.

create table if not exists public.practice_subscriptions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  plan_key text not null,
  status text not null default 'active',
  stripe_session_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  unique (stripe_session_id)
);

create index if not exists practice_subs_practice_idx
  on public.practice_subscriptions (practice_id);

alter table public.practice_subscriptions enable row level security;

create policy "subs_select_member"
  on public.practice_subscriptions for select
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id
        and m.user_id = auth.uid()
    )
  );

create policy "subs_insert_member"
  on public.practice_subscriptions for insert
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

create policy "subs_update_member"
  on public.practice_subscriptions for update
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_subscriptions.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_key text not null,
  amount_total integer,
  currency text,
  customer_email text,
  status text not null default 'paid',
  mode text,
  practice_id uuid references public.practices (id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.checkout_orders enable row level security;

create policy "orders_select_own_email_or_practice"
  on public.checkout_orders for select
  using (
    (
      customer_email is not null
      and lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1 from public.practice_members m
      where m.practice_id = checkout_orders.practice_id
        and m.user_id = auth.uid()
    )
  );
