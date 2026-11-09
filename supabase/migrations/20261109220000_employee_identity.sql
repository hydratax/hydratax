-- Identity fields so SA can match a person to a company PAYE employee
-- (NINO + date of birth + address must all agree before PAYE figures are pulled).
alter table employees
  add column if not exists date_of_birth text,
  add column if not exists address text;
