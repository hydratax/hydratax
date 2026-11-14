-- UK GDPR / DPA 2018 data-rights & breach-readiness tables.
-- Apply in the Supabase SQL editor (or `supabase db push`). Idempotent.
--
--  1. security_events           append-only security / privacy event log
--  2. account_deletion_requests grace-period queue for sole-owner erasure
--  3. data_subject_requests     DSAR register (Art 12 one-month clock)
--  4. feature_requests          hide author_email from anon / authenticated
--
-- All new tables: RLS enabled with NO policies (deny by default) and all
-- table privileges revoked from anon / authenticated. Only the service-role
-- key (server-side) can read or write them.

-- ---------------------------------------------------------------------------
-- 1. security_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  actor_user_id uuid,
  subject_user_id uuid,
  practice_id uuid,
  -- HMAC of the client IP (never the raw IP). Null when no salt configured.
  ip_hash text,
  -- No secrets / NINO / UTR / message bodies — sanitised by the app.
  details jsonb not null default '{}'::jsonb
);

create index if not exists security_events_occurred_idx
  on public.security_events (occurred_at desc);
create index if not exists security_events_type_idx
  on public.security_events (event_type, occurred_at desc);
create index if not exists security_events_subject_idx
  on public.security_events (subject_user_id)
  where subject_user_id is not null;
create index if not exists security_events_actor_idx
  on public.security_events (actor_user_id)
  where actor_user_id is not null;

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select, insert on public.security_events to service_role;

-- Append-only: block UPDATE always, DELETE unless run by the retention
-- function below (which sets a transaction-local flag).
create or replace function public.security_events_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'security_events is append-only (UPDATE blocked)';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('hydratax.security_events_purge', true), '') <> 'on' then
    raise exception 'security_events is append-only (DELETE blocked)';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists security_events_no_update on public.security_events;
create trigger security_events_no_update
  before update on public.security_events
  for each row execute function public.security_events_guard();

drop trigger if exists security_events_no_delete on public.security_events;
create trigger security_events_no_delete
  before delete on public.security_events
  for each row execute function public.security_events_guard();

-- Retention: the only sanctioned way to delete rows. Called by
-- src/server/privacy/retention.ts via the service role.
create or replace function public.purge_expired_security_events(retain_days integer default 365)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if retain_days < 30 then
    raise exception 'retain_days must be at least 30';
  end if;
  perform set_config('hydratax.security_events_purge', 'on', true);
  delete from public.security_events
   where occurred_at < now() - make_interval(days => retain_days);
  get diagnostics removed = row_count;
  perform set_config('hydratax.security_events_purge', 'off', true);
  return removed;
end;
$$;

revoke all on function public.purge_expired_security_events(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_security_events(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. account_deletion_requests
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- No FK: the row must survive deletion of the auth user as proof of erasure.
  user_id uuid not null,
  -- sha256(lower(email)) — proof of identity without keeping the address.
  subject_ref text not null,
  -- Practices that will be erased with this request (sole-member only).
  practice_ids uuid[] not null default '{}',
  mode text not null default 'scheduled'
    check (mode in ('scheduled', 'immediate', 'member_only')),
  status text not null default 'pending'
    check (status in ('pending', 'cancelled', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  -- sha256 of the one-time cancel token e-mailed to the user.
  cancel_token_hash text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Machine-readable step results (counts / step names only, no personal data).
  result jsonb not null default '{}'::jsonb
);

create unique index if not exists account_deletion_one_pending_uidx
  on public.account_deletion_requests (user_id)
  where status = 'pending';
create index if not exists account_deletion_due_idx
  on public.account_deletion_requests (scheduled_for)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

-- ---------------------------------------------------------------------------
-- 3. data_subject_requests (DSAR register)
-- ---------------------------------------------------------------------------
create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  subject_ref text,
  request_type text not null
    check (request_type in (
      'access', 'portability', 'erasure', 'rectification',
      'restriction', 'objection', 'other'
    )),
  channel text not null default 'self_service'
    check (channel in ('self_service', 'email', 'post', 'other')),
  received_at timestamptz not null default now(),
  -- One calendar month from receipt (UK GDPR Art 12(3)); extendable by 2 months.
  due_at timestamptz not null default (now() + interval '1 month'),
  status text not null default 'open'
    check (status in ('open', 'completed', 'refused', 'extended')),
  completed_at timestamptz,
  -- Never put the data itself here.
  notes text
);

create index if not exists dsr_status_due_idx
  on public.data_subject_requests (status, due_at);
create index if not exists dsr_user_idx
  on public.data_subject_requests (user_id)
  where user_id is not null;

alter table public.data_subject_requests enable row level security;
revoke all on public.data_subject_requests from anon, authenticated;
grant select, insert, update, delete on public.data_subject_requests to service_role;

-- ---------------------------------------------------------------------------
-- 4. feature_requests: keep author_email / author_user_id off the public REST
--    API. 20261113230000_security_hardening_public_data.sql already dropped the
--    `using (true)` policies, revoked ALL table privileges from anon /
--    authenticated and published the safe `feature_requests_public` view. This
--    step must NOT re-grant anything on the base table (an earlier draft
--    granted column-level SELECT here, which silently undid that lock-down), so
--    it only re-asserts the locked-down state and is safe in any run order.
--    The app reads the base tables through Drizzle / the service role, which
--    are unaffected.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.feature_requests') is not null then
    drop policy if exists "feature_requests_public_read" on public.feature_requests;
    revoke all on public.feature_requests from anon, authenticated;
  end if;
  if to_regclass('public.feature_votes') is not null then
    drop policy if exists "feature_votes_public_read" on public.feature_votes;
    revoke all on public.feature_votes from anon, authenticated;
  end if;
end $$;
