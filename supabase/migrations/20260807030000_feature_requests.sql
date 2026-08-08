-- Public feature request board (accountants vote on roadmap)

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_name text not null,
  author_email text,
  author_user_id text,
  status text not null default 'open'
    check (status in ('open', 'planned', 'shipping', 'shipped')),
  vote_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_votes_idx
  on public.feature_requests (vote_count desc, created_at desc);

create index if not exists feature_requests_status_idx
  on public.feature_requests (status);

create table if not exists public.feature_votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feature_requests (id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists feature_votes_request_voter_uidx
  on public.feature_votes (request_id, voter_key);

create index if not exists feature_votes_voter_idx
  on public.feature_votes (voter_key);

alter table public.feature_requests enable row level security;
alter table public.feature_votes enable row level security;

-- App uses service role / server actions; allow anon read via policies if using supabase-js client later
create policy "feature_requests_public_read"
  on public.feature_requests for select
  using (true);

create policy "feature_votes_public_read"
  on public.feature_votes for select
  using (true);
