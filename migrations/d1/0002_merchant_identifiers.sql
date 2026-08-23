-- Merchant / counterparty identifier rules for bank auto-categorisation.
-- practice_id NULL = global default; practice-specific rows override on match.

CREATE TABLE IF NOT EXISTS merchant_identifiers (
  id TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT,
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains',
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS merchant_identifiers_practice_idx
  ON merchant_identifiers (practice_id);

-- Global fuel identifiers
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-shell', NULL, 'shell', 'contains', 'fuel', 'Shell', 10),
  ('mi-bp', NULL, 'bp ', 'contains', 'fuel', 'BP', 10),
  ('mi-esso', NULL, 'esso', 'contains', 'fuel', 'Esso', 10),
  ('mi-texaco', NULL, 'texaco', 'contains', 'fuel', 'Texaco', 10),
  ('mi-tesco', NULL, 'tesco', 'contains', 'fuel', 'Tesco', 8),
  ('mi-sainsburys', NULL, 'sainsbury', 'contains', 'fuel', 'Sainsburys', 8),
  ('mi-asda', NULL, 'asda', 'contains', 'fuel', 'Asda', 8),
  ('mi-morrisons', NULL, 'morrisons', 'contains', 'fuel', 'Morrisons', 8),
  ('mi-petrol', NULL, 'petrol', 'contains', 'fuel', 'Petrol', 9),
  ('mi-diesel', NULL, 'diesel', 'contains', 'fuel', 'Diesel', 9),
  ('mi-fuel', NULL, 'fuel', 'contains', 'fuel', 'Fuel', 9);

-- Insurance
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-insurance', NULL, 'insurance', 'contains', 'insurance', 'Insurance', 10),
  ('mi-aviva', NULL, 'aviva', 'contains', 'insurance', 'Aviva', 10),
  ('mi-axa', NULL, 'axa', 'contains', 'insurance', 'AXA', 10),
  ('mi-hiscox', NULL, 'hiscox', 'contains', 'insurance', 'Hiscox', 10),
  ('mi-zurich', NULL, 'zurich', 'contains', 'insurance', 'Zurich', 10);

-- Finance / loan costs
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-loan', NULL, 'loan', 'contains', 'finance', 'Loan', 10),
  ('mi-interest', NULL, 'interest', 'contains', 'finance', 'Interest', 9),
  ('mi-hp', NULL, 'hire purchase', 'contains', 'finance', 'HP', 10),
  ('mi-leasing', NULL, 'leasing', 'contains', 'finance', 'Leasing', 10),
  ('mi-barclays-loan', NULL, 'barclays loan', 'contains', 'finance', 'Barclays Loan', 10),
  ('mi-lloyds-loan', NULL, 'lloyds loan', 'contains', 'finance', 'Lloyds Loan', 10);

-- Salaries & wages
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-payroll', NULL, 'payroll', 'contains', 'salaries', 'Payroll', 10),
  ('mi-wages', NULL, 'wages', 'contains', 'salaries', 'Wages', 10),
  ('mi-salary', NULL, 'salary', 'contains', 'salaries', 'Salary', 10),
  ('mi-paye', NULL, 'paye', 'contains', 'salaries', 'PAYE', 9),
  ('mi-nest', NULL, 'nest pension', 'contains', 'salaries', 'NEST', 8),
  ('mi-pension', NULL, 'auto enrol', 'contains', 'salaries', 'Pension', 8);

-- Subcontractors
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-subcontractor', NULL, 'subcontract', 'contains', 'subcontractors', 'Subcontractor', 10),
  ('mi-contractor', NULL, 'contractor', 'contains', 'subcontractors', 'Contractor', 8),
  ('mi-freelancer', NULL, 'freelance', 'contains', 'subcontractors', 'Freelancer', 8),
  ('mi-upwork', NULL, 'upwork', 'contains', 'subcontractors', 'Upwork', 10),
  ('mi-fiverr', NULL, 'fiverr', 'contains', 'subcontractors', 'Fiverr', 10);

-- Travel
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-uber', NULL, 'uber', 'contains', 'travel', 'Uber', 10),
  ('mi-trainline', NULL, 'trainline', 'contains', 'travel', 'Trainline', 10),
  ('mi-tfl', NULL, 'tfl', 'contains', 'travel', 'TfL', 10);

-- Professional & office
INSERT OR IGNORE INTO merchant_identifiers (id, practice_id, pattern, match_type, category, label, priority) VALUES
  ('mi-xero', NULL, 'xero', 'contains', 'accountancy', 'Xero', 10),
  ('mi-sage', NULL, 'sage', 'contains', 'accountancy', 'Sage', 10),
  ('mi-hmrc', NULL, 'hmrc', 'contains', 'tax', 'HMRC', 10),
  ('mi-rent', NULL, 'rent', 'contains', 'rent_rates', 'Rent', 9);
