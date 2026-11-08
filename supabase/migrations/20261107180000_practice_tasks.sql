-- Practice Tasks: Documents + Queries inbox (email → allocate to client / team)

alter table public.practices
  add column if not exists task_inbox_key text;

create unique index if not exists practices_task_inbox_key_uidx
  on public.practices (task_inbox_key)
  where task_inbox_key is not null;

create table if not exists public.practice_tasks (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  kind text not null check (kind in ('document', 'query')),
  status text not null default 'unallocated'
    check (status in ('unallocated', 'allocated', 'done', 'cancelled')),
  title text not null,
  body text,
  from_address text,
  source text not null default 'email'
    check (source in ('email', 'manual', 'forward')),
  source_email_id text,
  -- Documents: allocate to a company / client
  client_id uuid references public.clients (id) on delete set null,
  -- Queries: allocate to a practice team member (auth.users)
  assignee_user_id uuid references auth.users (id) on delete set null,
  allocated_by uuid references auth.users (id) on delete set null,
  allocated_at timestamptz,
  -- Attachment metadata (documents)
  filename text,
  content_type text,
  storage_key text,
  byte_size integer,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practice_tasks_practice_kind_idx
  on public.practice_tasks (practice_id, kind, status, created_at desc);

create index if not exists practice_tasks_assignee_idx
  on public.practice_tasks (assignee_user_id, status)
  where assignee_user_id is not null;

create index if not exists practice_tasks_client_idx
  on public.practice_tasks (client_id)
  where client_id is not null;

create table if not exists public.practice_task_comments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  task_id uuid not null references public.practice_tasks (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists practice_task_comments_task_idx
  on public.practice_task_comments (task_id, created_at asc);

alter table public.practice_tasks enable row level security;
alter table public.practice_task_comments enable row level security;

drop policy if exists "practice_tasks_member" on public.practice_tasks;
create policy "practice_tasks_member" on public.practice_tasks for all
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_tasks.practice_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_tasks.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );

drop policy if exists "practice_task_comments_member" on public.practice_task_comments;
create policy "practice_task_comments_member" on public.practice_task_comments for all
  using (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_task_comments.practice_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.practice_members m
      where m.practice_id = practice_task_comments.practice_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'practitioner')
    )
  );
