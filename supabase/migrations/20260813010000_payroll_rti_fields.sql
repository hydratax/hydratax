-- Extra payroll fields for weekly/monthly RTI, payroll IDs and payslip runs.
alter table employees
  add column if not exists payroll_id text,
  add column if not exists pay_frequency text not null default 'M1',
  add column if not exists ni_category text not null default 'A',
  add column if not exists job_title text,
  add column if not exists leave_date text,
  add column if not exists starter_declaration text,
  add column if not exists first_fps_sent boolean not null default false,
  add column if not exists previous_payroll_id text;

alter table pay_runs
  add column if not exists pay_frequency text not null default 'M1',
  add column if not exists kind text not null default 'FPS';
