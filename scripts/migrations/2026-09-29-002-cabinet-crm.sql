-- Cabinet CRM completion: a manually entered client is a real cabinet record,
-- kept distinct from an autonomous website signup.
ALTER TABLE cabinet_crm ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'signup'
  CHECK(source IN ('signup','manual','import'));
ALTER TABLE cabinet_crm ADD COLUMN IF NOT EXISTS internal_summary text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS cabinet_crm_source ON cabinet_crm(source,lifecycle);
