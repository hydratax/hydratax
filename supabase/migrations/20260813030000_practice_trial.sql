-- Practice desk free trial end timestamp.
alter table practice_subscriptions
  add column if not exists trial_ends_at timestamptz;
