-- Bureau-scale payroll bulk import jobs + RTI submit throttle queue.
-- Durable DB-backed jobs (no Redis). Processed by /api/cron/payroll-jobs.
-- Idempotent; service role writes; practice members may read own practice jobs.

-- ---------------------------------------------------------------------------
-- bulk_import_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  created_by text,
  kind text not null default 'employee_csv_pack'
    check (kind in ('employee_csv_pack')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  source_label text,
  artifact_key text,
  total_items integer not null default 0,
  completed_items integer not null default 0,
  failed_items integer not null default 0,
  progress_pct integer not null default 0
    check (progress_pct >= 0 and progress_pct <= 100),
  error_summary text,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulk_import_jobs_practice_idx
  on public.bulk_import_jobs (practice_id, created_at desc);

create index if not exists bulk_import_jobs_status_idx
  on public.bulk_import_jobs (status, created_at asc)
  where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- bulk_import_job_items (one company / CSV file)
-- ---------------------------------------------------------------------------
create table if not exists public.bulk_import_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs (id) on delete cascade,
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  match_key text not null,
  match_kind text not null default 'company_number'
    check (match_kind in ('company_number', 'client_id', 'paye_ref')),
  filename text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'skipped')),
  csv_text text,
  employees_created integer not null default 0,
  employees_updated integer not null default 0,
  employees_skipped integer not null default 0,
  error_message text,
  claimed_at timestamptz,
  claimed_by text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulk_import_job_items_job_idx
  on public.bulk_import_job_items (job_id, status, created_at asc);

create index if not exists bulk_import_job_items_claim_idx
  on public.bulk_import_job_items (status, created_at asc)
  where status = 'queued';

-- Claim up to N queued items atomically (SKIP LOCKED).
create or replace function public.claim_bulk_import_job_items(
  p_limit integer default 5,
  p_worker text default 'cron'
)
returns setof public.bulk_import_job_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select i.id
    from public.bulk_import_job_items i
    join public.bulk_import_jobs j on j.id = i.job_id
    where i.status = 'queued'
      and j.status in ('queued', 'running')
    order by i.created_at asc
    for update of i skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 50))
  ),
  updated as (
    update public.bulk_import_job_items i
    set
      status = 'processing',
      claimed_at = now(),
      claimed_by = p_worker,
      updated_at = now()
    from picked
    where i.id = picked.id
    returning i.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_bulk_import_job_items(integer, text) from public;
grant execute on function public.claim_bulk_import_job_items(integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- rti_submit_jobs — throttle / serialize FPS+EPS submits per practice
-- ---------------------------------------------------------------------------
create table if not exists public.rti_submit_jobs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  pay_run_id uuid,
  kind text not null check (kind in ('FPS', 'EPS')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  correlation_id text,
  envelope_xml text,
  meta jsonb not null default '{}'::jsonb,
  created_by text,
  claimed_at timestamptz,
  claimed_by text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rti_submit_jobs_practice_queue_idx
  on public.rti_submit_jobs (practice_id, status, next_attempt_at asc, priority asc);

create index if not exists rti_submit_jobs_claim_idx
  on public.rti_submit_jobs (status, next_attempt_at asc)
  where status = 'queued';

create or replace function public.claim_rti_submit_jobs(
  p_limit integer default 2,
  p_worker text default 'cron'
)
returns setof public.rti_submit_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select r.id
    from public.rti_submit_jobs r
    where r.status = 'queued'
      and r.next_attempt_at <= now()
    order by r.priority asc, r.next_attempt_at asc, r.created_at asc
    for update of r skip locked
    limit greatest(1, least(coalesce(p_limit, 2), 20))
  ),
  updated as (
    update public.rti_submit_jobs r
    set
      status = 'processing',
      claimed_at = now(),
      claimed_by = p_worker,
      attempt_count = r.attempt_count + 1,
      updated_at = now()
    from picked
    where r.id = picked.id
    returning r.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_rti_submit_jobs(integer, text) from public;
grant execute on function public.claim_rti_submit_jobs(integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS — members read; writes via service role (cron / internal enqueue)
-- ---------------------------------------------------------------------------
alter table public.bulk_import_jobs enable row level security;
alter table public.bulk_import_job_items enable row level security;
alter table public.rti_submit_jobs enable row level security;

drop policy if exists "bulk_import_jobs_select_member" on public.bulk_import_jobs;
create policy "bulk_import_jobs_select_member"
  on public.bulk_import_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = bulk_import_jobs.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "bulk_import_job_items_select_member" on public.bulk_import_job_items;
create policy "bulk_import_job_items_select_member"
  on public.bulk_import_job_items for select
  to authenticated
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = bulk_import_job_items.practice_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "rti_submit_jobs_select_member" on public.rti_submit_jobs;
create policy "rti_submit_jobs_select_member"
  on public.rti_submit_jobs for select
  to authenticated
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = rti_submit_jobs.practice_id
        and m.user_id = auth.uid()
    )
  );
