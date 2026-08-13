-- Trial reminder funnel + ensure trial_ends_at exists.
alter table public.practice_subscriptions
  add column if not exists trial_ends_at timestamptz;

alter table public.practice_subscriptions
  add column if not exists trial_reminder_sent_at timestamptz;

create index if not exists practice_subs_trial_ends_idx
  on public.practice_subscriptions (status, trial_ends_at)
  where status = 'trialing';
