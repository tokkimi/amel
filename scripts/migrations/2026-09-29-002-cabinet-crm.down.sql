-- Manual rollback for 2026-09-29-002-cabinet-crm.sql.
DROP INDEX IF EXISTS cabinet_crm_source;
ALTER TABLE cabinet_crm DROP COLUMN IF EXISTS internal_summary;
ALTER TABLE cabinet_crm DROP COLUMN IF EXISTS source;
