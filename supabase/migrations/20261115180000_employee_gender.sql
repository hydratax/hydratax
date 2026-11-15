-- HMRC FPS requires EmployeeDetails/Gender (M|F).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender text;
