ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES tasks(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS plan_name text NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS initial_quote numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_quote numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recovered_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS financial_date date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_parent ON tasks(owner_id,parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_financial ON tasks(owner_id,financial_date,practitioner_id);
