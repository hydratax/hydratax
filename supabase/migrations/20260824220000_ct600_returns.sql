-- CT600 returns for Corporation Tax Online (XML) submissions.

create table if not exists public.ct600_returns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_start text not null,
  period_end text not null,
  status public.submission_status not null default 'draft',
  figures jsonb not null,
  questionnaire jsonb not null default '{}'::jsonb,
  taxable_profit_pence integer,
  xml_payload_hash text,
  hmrc_correlation_id text,
  hmrc_receipt text,
  validation_issues jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ct600_returns_client_idx on public.ct600_returns (client_id);

alter table public.ct600_returns enable row level security;

drop policy if exists "ct600_returns_member_all" on public.ct600_returns;
create policy "ct600_returns_member_all"
  on public.ct600_returns for all
  using (public.user_can_access_client(client_id))
  with check (public.user_can_access_client(client_id));
