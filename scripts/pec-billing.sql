ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_stage_check;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS impression_date date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS placement_date date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS quote_document_data text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS quote_document_name text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS impression_date date;
CREATE TABLE IF NOT EXISTS billing_clients (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name text NOT NULL,email text NOT NULL,address text NOT NULL DEFAULT '',company_id text NOT NULL DEFAULT '',
 monthly_amount integer NOT NULL DEFAULT 0 CHECK(monthly_amount>=0),service_label text NOT NULL DEFAULT 'Accompagnement SmilePec',
 stripe_customer_id text UNIQUE,stripe_subscription_id text UNIQUE,stripe_session_id text,stripe_session_url text,
 subscription_status text NOT NULL DEFAULT 'not_started',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_clients_owner ON billing_clients(owner_id);
CREATE TABLE IF NOT EXISTS billing_invoices (
 stripe_invoice_id text PRIMARY KEY,client_id uuid NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
 number text,status text,amount_due integer,amount_paid integer,currency text,hosted_url text,pdf_url text,issued_at timestamptz,
 email_sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS stripe_events (id text PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now());
