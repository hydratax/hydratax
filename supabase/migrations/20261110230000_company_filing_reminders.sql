-- Weekly filing nudges for single-company (solo) signups — 4 months from join.

alter table public.email_preferences
  add column if not exists company_filing_reminders boolean not null default true,
  add column if not exists company_filing_reminder_weekday smallint
    check (company_filing_reminder_weekday between 0 and 6),
  add column if not exists company_filing_reminder_started_at timestamptz,
  add column if not exists company_filing_reminder_sent_at timestamptz,
  add column if not exists company_filing_reminder_ends_at timestamptz;

comment on column public.email_preferences.company_filing_reminders is
  'Solo / single-company weekly nudges for CS, accounts and CT600';
comment on column public.email_preferences.company_filing_reminder_weekday is
  '0=Sun … 6=Sat — random day chosen at signup for once-weekly sends';
