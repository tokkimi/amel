-- Financial breakdown for PEC optimisation reports. Amounts remain internal to SmilePec.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS initial_social_security_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_social_security_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS initial_mutual_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_mutual_amount numeric(12,2) NOT NULL DEFAULT 0;
