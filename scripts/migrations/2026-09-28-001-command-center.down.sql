-- Manual rollback for 2026-09-28-001-command-center.sql (never applied automatically).
-- Only drops objects introduced by the migration. Existing tables keep their original columns and data.
-- Run statement by statement after exporting anything worth keeping.
DROP TABLE IF EXISTS credits;
DROP TABLE IF EXISTS platform_payments;
DROP TABLE IF EXISTS platform_invoices;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS account_activity;
DROP TABLE IF EXISTS platform_state;
DROP TABLE IF EXISTS feature_flag_overrides;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS automation_rules;
DROP TABLE IF EXISTS saved_views;
DROP TABLE IF EXISTS assist_sessions;
DROP TABLE IF EXISTS cabinet_crm;
DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS support_messages;
DROP TABLE IF EXISTS internal_notes;
DROP TABLE IF EXISTS operational_events;
DROP TABLE IF EXISTS admin_members;
DROP RULE IF EXISTS audit_log_no_update ON audit_log;
ALTER TABLE support_tickets ALTER COLUMN status SET DEFAULT 'open';
UPDATE support_tickets SET status='open' WHERE status IN ('new','waiting_customer');
UPDATE support_tickets SET status='resolved' WHERE status='closed';
-- Added columns on audit_log, support_tickets and notifications are harmless and intentionally kept.
