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

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS booking_url text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_provider text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_data text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_data text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_hours jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clinic_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS services (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name text NOT NULL, description text NOT NULL DEFAULT '', duration integer NOT NULL DEFAULT 45 CHECK(duration BETWEEN 5 AND 480),
 price numeric(10,2) NOT NULL CHECK(price>=0), vat numeric(5,2) NOT NULL DEFAULT 0 CHECK(vat BETWEEN 0 AND 100),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS services_owner ON services(owner_id,active);

CREATE TABLE IF NOT EXISTS patient_records (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'actif',
 phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', tags text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,patient_id)
);
CREATE INDEX IF NOT EXISTS patient_records_owner ON patient_records(owner_id,updated_at DESC);
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS social_security_number text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS mutual_provider text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS mutual_member_number text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS insurance_card_data text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS insurance_card_name text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS billing_document_data text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS billing_document_name text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS medical_alerts text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS allergies text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS medications text NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS dental_chart jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS business_documents (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
 doc_type text NOT NULL CHECK(doc_type IN ('quote','invoice')), number text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','paid','cancelled')),
 issue_date date NOT NULL DEFAULT current_date, due_date date, items jsonb NOT NULL DEFAULT '[]'::jsonb,
 subtotal numeric(10,2) NOT NULL DEFAULT 0, tax numeric(10,2) NOT NULL DEFAULT 0, total numeric(10,2) NOT NULL DEFAULT 0,
 note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(owner_id,number)
);
CREATE INDEX IF NOT EXISTS documents_owner ON business_documents(owner_id,created_at DESC);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT '';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_url text NOT NULL DEFAULT '';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS pdf_data text NOT NULL DEFAULT '';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS pdf_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS tasks (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '', stage text NOT NULL DEFAULT 'À faire' CHECK(stage IN ('À faire','En cours','En attente','Terminé')),
 priority text NOT NULL DEFAULT 'Normale' CHECK(priority IN ('Basse','Normale','Haute','Urgente')),
 due_at timestamptz, assignee text NOT NULL DEFAULT '', patient_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
 checklist jsonb NOT NULL DEFAULT '[]'::jsonb, attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_id,stage,updated_at DESC);

CREATE TABLE IF NOT EXISTS missions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL, assignee text NOT NULL, title text NOT NULL,
 address text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','en_route','nearby','arrived','completed')),
 eta integer NOT NULL DEFAULT 0, latitude numeric(9,6), longitude numeric(9,6), photo_data text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS missions_owner ON missions(owner_id,updated_at DESC);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES business_documents(id) ON DELETE SET NULL;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'sur_place';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS insurance_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_details text NOT NULL DEFAULT '';
ALTER TABLE missions ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES accounts(id);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS location_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS dental_media (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('photo','xray','document')), title text NOT NULL DEFAULT '',
 data_url text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dental_media_patient ON dental_media(owner_id,patient_id,created_at DESC);

CREATE TABLE IF NOT EXISTS visit_notes (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
 title text NOT NULL, clinical_note text NOT NULL DEFAULT '', treatment_plan text NOT NULL DEFAULT '',
 tooth_data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_notes_patient ON visit_notes(owner_id,patient_id,created_at DESC);

CREATE TABLE IF NOT EXISTS clinic_members (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, job_title text NOT NULL DEFAULT '',
 permissions jsonb NOT NULL DEFAULT '[]'::jsonb, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,member_id)
);
CREATE INDEX IF NOT EXISTS clinic_members_owner ON clinic_members(owner_id,active);
ALTER TABLE clinic_members ADD COLUMN IF NOT EXISTS accepted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS support_tickets (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), subject text NOT NULL,
 body text NOT NULL, status text NOT NULL DEFAULT 'open', admin_reply text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

UPDATE platform_settings SET name='SmilePec' WHERE id=1 AND name='Amelib';
UPDATE platform_settings SET support_email='contact@smilepec.fr' WHERE id=1 AND support_email='';
UPDATE profiles p SET clinic_name=CASE WHEN p.clinic_name='' THEN 'SmilePec' ELSE p.clinic_name END,
 specialty=CASE WHEN p.specialty='' THEN 'Gestion et optimisation du tiers payant dentaire' ELSE p.specialty END,
 headline=CASE WHEN p.headline='' THEN 'Votre cabinet dentaire, mieux accompagné à chaque étape.' ELSE p.headline END,
 bio=CASE WHEN p.bio='' THEN 'Gestion complète du tiers payant, estimation optimisée, reprise des dossiers impayés et accompagnement à distance des cabinets dentaires partout en France.' ELSE p.bio END,
 contact_email=CASE WHEN p.contact_email='' THEN 'contact@smilepec.fr' ELSE p.contact_email END,
 website=CASE WHEN p.website='' THEN 'https://smilepec.fr/' ELSE p.website END,
 phone=CASE WHEN p.phone='' THEN '07 45 13 44 81' ELSE p.phone END
FROM accounts a WHERE a.id=p.account_id AND a.role='admin';
