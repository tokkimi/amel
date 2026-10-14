
CREATE TABLE IF NOT EXISTS service_access (
 cabinet_id uuid PRIMARY KEY REFERENCES accounts(id), active boolean NOT NULL DEFAULT false,
 activated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO service_access(cabinet_id,active,activated_at)
 SELECT id,true,now() FROM accounts WHERE role='professional'
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS service_files (
 id uuid PRIMARY KEY, cabinet_id uuid NOT NULL REFERENCES accounts(id), author_id uuid NOT NULL REFERENCES accounts(id),
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size BETWEEN 1 AND 52428800),
 ready boolean NOT NULL DEFAULT false, digest text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_files_cabinet ON service_files(cabinet_id,created_at);
CREATE TABLE IF NOT EXISTS service_file_chunks (
 file_id uuid NOT NULL REFERENCES service_files(id) ON DELETE CASCADE, part integer NOT NULL CHECK(part BETWEEN 0 AND 199),
 data text NOT NULL, PRIMARY KEY(file_id,part)
);
CREATE TABLE IF NOT EXISTS service_quotes (
 id uuid PRIMARY KEY, cabinet_id uuid NOT NULL REFERENCES accounts(id), ticket_id uuid NOT NULL REFERENCES support_tickets(id),
 file_id uuid NOT NULL REFERENCES service_files(id), author_id uuid NOT NULL REFERENCES accounts(id),
 status text NOT NULL DEFAULT 'sent' CHECK(status IN('sent','accepted','rejected','superseded')),
 decided_by uuid REFERENCES accounts(id), decided_at timestamptz, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_meetings (
 id uuid PRIMARY KEY, cabinet_id uuid NOT NULL REFERENCES accounts(id), ticket_id uuid NOT NULL REFERENCES support_tickets(id),
 starts_at timestamptz NOT NULL, duration integer NOT NULL DEFAULT 30 CHECK(duration IN(15,30,45,60)),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','confirmed','cancelled','completed')),
 provider text NOT NULL DEFAULT 'smilepec' CHECK(provider IN('smilepec','external')), external_url text,
 confirmed_by uuid REFERENCES accounts(id), call_generation uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_quotes_one_pending ON service_quotes(cabinet_id) WHERE status='sent';
CREATE TABLE IF NOT EXISTS service_call_signals (
 id bigserial PRIMARY KEY, meeting_id uuid NOT NULL REFERENCES service_meetings(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES accounts(id), kind text NOT NULL CHECK(kind IN('offer','answer','ice','hangup')),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_call_signals_meeting ON service_call_signals(meeting_id,id);
CREATE TABLE IF NOT EXISTS service_mail_outbox (
 id uuid PRIMARY KEY, cabinet_id uuid NOT NULL REFERENCES accounts(id), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS service_mail_outbox_pending ON service_mail_outbox(status,retry_at);
CREATE TABLE IF NOT EXISTS workspace_drafts (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, scope text NOT NULL, payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,scope)
);
