-- Security hardening: public data exposure + WhatsApp PIN brute-force limiting.
-- Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- 1. Feature requests: stop exposing author_email / author_user_id / voter_key
--    to the anon key. The Next.js app reads these tables server-side through
--    the direct Postgres connection (drizzle), which is unaffected by RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "feature_requests_public_read" on public.feature_requests;
drop policy if exists "feature_votes_public_read" on public.feature_votes;

alter table public.feature_requests enable row level security;
alter table public.feature_votes enable row level security;

-- No policies remain => anon/authenticated cannot read or write the base tables.
revoke all on public.feature_requests from anon, authenticated;
revoke all on public.feature_votes from anon, authenticated;

-- Safe public projection (no author_email, no author_user_id, no voters).
-- A plain (non security_invoker) view runs with the owner's rights, so it can
-- read the RLS-protected table while exposing only these columns.
create or replace view public.feature_requests_public
with (security_invoker = false) as
select
  id,
  title,
  body,
  author_name,
  status,
  vote_count,
  created_at
from public.feature_requests;

revoke all on public.feature_requests_public from public;
grant select on public.feature_requests_public to anon, authenticated;

comment on view public.feature_requests_public is
  'Public-safe feature request board (no author email / user id / voter keys).';

-- ---------------------------------------------------------------------------
-- 2. WhatsApp bot: persist PIN failure counters for lock-out (5 failures =>
--    1 hour lock). Table is service-role only (RLS enabled, no policies).
--    Kept separate from bot_sessions so clearing a chat session ("HELP" /
--    "CANCEL") can never reset a lock-out.
-- ---------------------------------------------------------------------------
-- Counters are keyed per phone AND per client, so rotating numbers against
-- one client record does not bypass the limit.
create table if not exists public.bot_pin_attempts (
  scope_key text primary key,        -- 'phone:<e164>' or 'client:<uuid>'
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.bot_pin_attempts enable row level security;
revoke all on public.bot_pin_attempts from anon, authenticated;
