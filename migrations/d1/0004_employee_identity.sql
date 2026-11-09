-- Identity fields for SA ↔ PAYE matching
ALTER TABLE employees ADD COLUMN date_of_birth TEXT;
ALTER TABLE employees ADD COLUMN address TEXT;
