CREATE TABLE IF NOT EXISTS accounts (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 recovery_hash text NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('patient','professional','worker','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 specialty text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 bio text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', languages text NOT NULL DEFAULT 'Français',
 qualifications text NOT NULL DEFAULT '', identifier text NOT NULL DEFAULT '', price numeric(10,2) NOT NULL DEFAULT 0 CHECK(price>=0),
 published boolean NOT NULL DEFAULT false, verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS slots (
 id uuid PRIMARY KEY, professional_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL, duration integer NOT NULL DEFAULT 45 CHECK(duration BETWEEN 15 AND 180),
 available boolean NOT NULL DEFAULT true, UNIQUE(professional_id, starts_at)
);
CREATE TABLE IF NOT EXISTS appointments (
 id uuid PRIMARY KEY, slot_id uuid NOT NULL REFERENCES slots(id), patient_id uuid NOT NULL REFERENCES accounts(id),
 professional_id uuid NOT NULL REFERENCES accounts(id), reason text NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_slot ON appointments(slot_id) WHERE status <> 'cancelled';
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY, appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES accounts(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, label text NOT NULL,
 amount numeric(10,2) NOT NULL CHECK(amount>0), kind text NOT NULL CHECK(kind IN ('income','expense')),
 paid boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS appointment_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS appointment_professional ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS session_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS message_appointment ON messages(appointment_id,created_at);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS audit_log(id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES accounts(id),action text NOT NULL,target_id uuid,detail text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS platform_settings(id integer PRIMARY KEY CHECK(id=1),name text NOT NULL DEFAULT 'Amelib',support_email text NOT NULL DEFAULT '',announcement text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO platform_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
