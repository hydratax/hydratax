-- Allow invoice-only and self-assessment-only team roles
alter table public.practice_members
  drop constraint if exists practice_members_module_access_check;

alter table public.practice_members
  add constraint practice_members_module_access_check
  check (
    module_access in (
      'full',
      'payroll',
      'vat',
      'corporation_tax',
      'invoices',
      'self_assessment'
    )
  );
