// Versioned schema migrations, embedded so the deployed API can apply them itself (Vercel bundles no .sql files).
// Source of truth: scripts/migrations/*.sql — keep both in sync (tests/unit.mjs checks it).
export const MIGRATIONS = [
  { id: '2026-09-28-001-command-center', sql: `-- Amelib Command Center — migration 001 (additive, backward compatible)
-- Rollback: scripts/migrations/2026-09-28-001-command-center.down.sql
-- NOTE: statements are split on semicolons by scripts/migrate.mjs, never use one inside a comment or string.

-- 1. Internal RBAC. An admin account without a row keeps full rights (platform_owner) for backward compatibility.
CREATE TABLE IF NOT EXISTS admin_members (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 internal_role text NOT NULL DEFAULT 'platform_owner' CHECK(internal_role IN ('platform_owner','operations_admin','support_agent','finance_admin','verification_agent','read_only_analyst')),
 display_name text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Audit log enrichment (existing columns and rows untouched).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS impersonated_by uuid;
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity ON audit_log(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_tenant ON audit_log(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target ON audit_log(target_id,created_at DESC);
-- Append-only: updates are silently ignored. Deletes stay possible only for account erasure and test cleanup.
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;

-- 3. Central operational events (inbox). References the source entity, never copies it.
CREATE TABLE IF NOT EXISTS operational_events (
 id uuid PRIMARY KEY,
 type text NOT NULL CHECK(type IN ('verification','finance','support','document','onboarding','appointment','operational','security')),
 severity text NOT NULL DEFAULT 'medium' CHECK(severity IN ('info','low','medium','high','critical')),
 cabinet_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 entity_type text, entity_id text,
 title text NOT NULL, description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','dismissed')),
 owner_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
 due_at timestamptz, snoozed_until timestamptz, resolved_at timestamptz, resolved_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','rule')),
 rule_key text, dedupe_key text UNIQUE, auto_resolved boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_events_active ON operational_events(status,severity,created_at DESC);
CREATE INDEX IF NOT EXISTS operational_events_cabinet ON operational_events(cabinet_id,status);
CREATE INDEX IF NOT EXISTS operational_events_owner ON operational_events(owner_id,status);
CREATE INDEX IF NOT EXISTS operational_events_rule ON operational_events(rule_key,status);

-- 4. Internal notes (never exposed to cabinets).
CREATE TABLE IF NOT EXISTS internal_notes (
 id uuid PRIMARY KEY, entity_type text NOT NULL CHECK(entity_type IN ('cabinet','event','account')),
 entity_id text NOT NULL, cabinet_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES accounts(id), body text NOT NULL, mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internal_notes_entity ON internal_notes(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS internal_notes_cabinet ON internal_notes(cabinet_id,created_at DESC);

-- 5. Support Center. Existing tickets keep working: admin_reply mirrors the latest public reply for the cabinet view.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE support_tickets ALTER COLUMN status SET DEFAULT 'new';
CREATE INDEX IF NOT EXISTS support_tickets_status ON support_tickets(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_account ON support_tickets(account_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS support_messages (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES accounts(id), visibility text NOT NULL CHECK(visibility IN ('public','internal')),
 body text NOT NULL, attachments jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket ON support_messages(ticket_id,created_at);

-- 6. Verification workflow. profiles.verified stays the source of truth read by the rest of the app.
CREATE TABLE IF NOT EXISTS verifications (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','documents_received','reviewing','missing_information','approved','rejected')),
 checklist jsonb NOT NULL DEFAULT '{}'::jsonb, reviewer_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
 reviewed_at timestamptz, rejection_reason text NOT NULL DEFAULT '', missing_information text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Internal CRM (commercial lifecycle, distinct from the technical account status).
CREATE TABLE IF NOT EXISTS cabinet_crm (
 cabinet_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 lifecycle text NOT NULL DEFAULT 'onboarding' CHECK(lifecycle IN ('lead','contacted','demo','onboarding','active','at_risk','churned')),
 owner_id uuid REFERENCES accounts(id) ON DELETE SET NULL, tags jsonb NOT NULL DEFAULT '[]'::jsonb,
 training_done_at timestamptz, next_contact_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Read-only assistance sessions (View as cabinet).
CREATE TABLE IF NOT EXISTS assist_sessions (
 id uuid PRIMARY KEY, admin_id uuid NOT NULL REFERENCES accounts(id), cabinet_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'readonly' CHECK(mode IN ('readonly')), reason text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS assist_sessions_admin ON assist_sessions(admin_id,ended_at);

-- 9. Saved views, automations, feature flags, platform state.
CREATE TABLE IF NOT EXISTS saved_views (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK(scope IN ('inbox','cabinets','support','finance','verifications')), name text NOT NULL,
 filters jsonb NOT NULL DEFAULT '{}'::jsonb, shared boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_views_owner ON saved_views(owner_id,scope);
CREATE TABLE IF NOT EXISTS automation_rules (
 key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, params jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feature_flags (
 key text PRIMARY KEY CHECK(key ~ '^[a-z0-9_]{2,60}$'), label text NOT NULL, description text NOT NULL DEFAULT '',
 rollout text NOT NULL DEFAULT 'off' CHECK(rollout IN ('off','internal','pilot','all')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feature_flag_overrides (
 flag_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE, cabinet_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 enabled boolean NOT NULL, PRIMARY KEY(flag_key,cabinet_id)
);
CREATE TABLE IF NOT EXISTS platform_state (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());

-- 10. Adoption tracking (one row per account and day, written on session check).
CREATE TABLE IF NOT EXISTS account_activity (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, day date NOT NULL DEFAULT current_date,
 PRIMARY KEY(account_id,day)
);
CREATE INDEX IF NOT EXISTS account_activity_day ON account_activity(day);

-- 11. Admin notification grouping.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS cabinet_id uuid;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

-- 12. Indexes supporting admin aggregates. SmilePec revenue uses the existing
-- billing_clients and billing_invoices tables, scoped to Amel-owned clients.
CREATE INDEX IF NOT EXISTS documents_status_due ON business_documents(doc_type,status,due_date);
CREATE INDEX IF NOT EXISTS clinic_members_member ON clinic_members(member_id,active,accepted);
CREATE INDEX IF NOT EXISTS accounts_role_created ON accounts(role,created_at DESC);
CREATE INDEX IF NOT EXISTS patient_records_prosthesis ON patient_records(prosthesis_date) WHERE prosthesis_date IS NOT NULL;
` },
  { id: '2026-09-29-002-cabinet-crm', sql: `-- Cabinet CRM completion: a manually entered client is a real cabinet record,
-- kept distinct from an autonomous website signup.
ALTER TABLE cabinet_crm ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'signup'
  CHECK(source IN ('signup','manual','import'));
ALTER TABLE cabinet_crm ADD COLUMN IF NOT EXISTS internal_summary text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS cabinet_crm_source ON cabinet_crm(source,lifecycle);
` },
];
export const statements = (text) => text.replace(/^\uFEFF/, '').split(';').map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
