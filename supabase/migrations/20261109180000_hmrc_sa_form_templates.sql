-- Official HMRC Self Assessment stationery catalog (files live in public/hmrc).
-- Personal SA100 packs attach only the supplement rows whose attach_rule matches
-- the taxpayer's income flags. kind=manual (SA800 notes) is reference only.

create table if not exists public.hmrc_sa_form_templates (
  id uuid primary key default gen_random_uuid(),
  form_code text not null,
  tax_year text not null,
  title text not null,
  filename text not null,
  kind text not null check (kind in ('main', 'supplement', 'manual')),
  attach_rule text
    check (
      attach_rule is null
      or attach_rule in (
        'employment',
        'self_employment',
        'partnership',
        'uk_property',
        'foreign',
        'capital_gains',
        'residence'
      )
    ),
  created_at timestamptz not null default now(),
  unique (form_code, tax_year, filename)
);

create index if not exists hmrc_sa_form_templates_year_idx
  on public.hmrc_sa_form_templates (tax_year);

insert into public.hmrc_sa_form_templates
  (form_code, tax_year, title, filename, kind, attach_rule)
values
  ('SA100', '2025-26', 'Tax Return 2026 (SA100)', 'SA100-2026.pdf', 'main', null),
  ('SA102', '2025-26', 'Employment (SA102)', 'SA102-2026.pdf', 'supplement', 'employment'),
  ('SA103F', '2025-26', 'Self-employment full (SA103F)', 'SA103F_2026.pdf', 'supplement', 'self_employment'),
  ('SA103S', '2025-26', 'Self-employment short (SA103S)', 'SA103S-2026.pdf', 'supplement', null),
  ('SA104F', '2025-26', 'Partnership full (SA104F)', 'SA104F_2026.pdf', 'supplement', 'partnership'),
  ('SA105', '2025-26', 'UK property (SA105)', 'SA105_2026_v0.1.pdf', 'supplement', 'uk_property'),
  ('SA106', '2025-26', 'Foreign (SA106)', 'SA106_2026.pdf', 'supplement', 'foreign'),
  ('SA108', '2025-26', 'Capital gains (SA108)', 'SA108-2026.pdf', 'supplement', 'capital_gains'),
  ('SA109', '2025-26', 'Residence / remittance / domicile (SA109)', 'SA109-2026.pdf', 'supplement', 'residence'),
  ('SA800MAN', '2022-23', 'Partnership tax return notes 2023', 'sa800man_2023.pdf', 'manual', null),
  ('SA800MAN', '2023-24', 'Partnership tax return notes 2024', 'SA800man_2024.pdf', 'manual', null),
  ('SA800MAN', '2024-25', 'Partnership tax return notes 2025', 'SA800man_2025.pdf', 'manual', null),
  ('SA800MAN', '2025-26', 'Partnership tax return notes 2026', 'SA800man-2026.pdf', 'manual', null)
on conflict (form_code, tax_year, filename) do update
set
  title = excluded.title,
  kind = excluded.kind,
  attach_rule = excluded.attach_rule;
