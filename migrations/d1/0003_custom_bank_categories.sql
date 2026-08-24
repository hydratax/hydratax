-- Practice-specific bank category labels (stored as custom:{id} on transactions).

CREATE TABLE IF NOT EXISTS custom_bank_categories (
  id TEXT PRIMARY KEY NOT NULL,
  practice_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS custom_bank_categories_practice_idx
  ON custom_bank_categories (practice_id);
