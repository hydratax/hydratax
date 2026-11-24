-- Track which public filing CTA led to signup, resume path, and weekly nudges
-- until that filing is completed.

create table if not exists public.signup_filing_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  practice_id uuid references public.practices (id) on delete set null,
  button_id text not null,
  button_label text not null,
  resume_path text not null,
  company_number text,
  service_id text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  reminder_weekday smallint not null
    check (reminder_weekday between 0 and 6),
  reminder_hour_uk smallint not null default 10
    check (reminder_hour_uk between 9 and 17),
  last_reminded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_filing_intents_pending_weekday_idx
  on public.signup_filing_intents (status, reminder_weekday)
  where status = 'pending';

create index if not exists signup_filing_intents_user_idx
  on public.signup_filing_intents (user_id, status);

create index if not exists signup_filing_intents_company_idx
  on public.signup_filing_intents (company_number)
  where company_number is not null;

comment on table public.signup_filing_intents is
  'Public CTA pressed before signup; weekly reminders until that filing completes';

alter table public.signup_filing_intents enable row level security;

create policy signup_filing_intents_select_own
  on public.signup_filing_intents
  for select
  using (auth.uid() = user_id);

create policy signup_filing_intents_update_own
  on public.signup_filing_intents
  for update
  using (auth.uid() = user_id);
