-- Additive V1.17 Cloudy feedback -> V1.18 platform upgrade.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.rooms'::regclass
      AND attname = 'marketplace_amenities'
      AND atttypid = 'text[]'::regtype
      AND attnotnull AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'V1.17 Cloudy/Marketplace predecessor required';
  END IF;
  IF to_regclass('public.cloudy_unresolved_feedback') IS NULL
     OR to_regclass('public.cloudy_unresolved_feedback_reviews') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_attribute WHERE attrelid='public.accounts'::regclass
         AND attname='cloudy_feedback_opt_in_at' AND NOT attisdropped
     )
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.accounts'::regclass AND conname='accounts_role_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.accounts'::regclass AND conname='accounts_check')
  THEN
    RAISE EXCEPTION 'Exact V1.17 Cloudy predecessor required';
  END IF;
END $$;
CREATE UNIQUE INDEX accounts_email_normalized_v118 ON accounts(lower(trim(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX owners_email_normalized_v118 ON owners(lower(trim(contact_email))) WHERE contact_email IS NOT NULL;

CREATE TABLE platform_permissions (
  permission_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  permission varchar(64) NOT NULL CHECK (permission = 'PLATFORM_AUDIT_READ'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by varchar(200) NOT NULL,
  request_reference varchar(200) NOT NULL,
  reason varchar(1000) NOT NULL,
  revoked_at timestamptz,
  revoked_by varchar(200),
  CHECK (length(trim(granted_by)) > 0 AND length(trim(request_reference)) > 0 AND length(trim(reason)) > 0)
);
CREATE UNIQUE INDEX platform_permissions_active_key ON platform_permissions(account_id, permission) WHERE revoked_at IS NULL;

CREATE TABLE platform_audit_grants (
  session_token_hash char(64) PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL
);

CREATE TABLE platform_command_requests (
  command_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  operation varchar(80) NOT NULL,
  key_hash char(64) NOT NULL,
  fingerprint char(64) NOT NULL,
  safe_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_account_id, operation, key_hash)
);

CREATE TABLE platform_operator_invitations (
  invitation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_email varchar(254) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  request_reference varchar(200) NOT NULL,
  created_by varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_operator_invitation_pending ON platform_operator_invitations(lower(trim(recipient_email))) WHERE status = 'pending';

CREATE TABLE owner_account_invitations (
  invitation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES owners(owner_id) ON DELETE RESTRICT,
  recipient_email varchar(254) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by_account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  delivery_status varchar(20) NOT NULL DEFAULT 'demo_not_sent' CHECK (delivery_status IN ('demo_not_sent','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX owner_account_invitation_pending ON owner_account_invitations(owner_id) WHERE status = 'pending';
CREATE UNIQUE INDEX owner_account_invitation_email_pending ON owner_account_invitations(lower(trim(recipient_email))) WHERE status = 'pending';

-- Every email writer, including existing Admin/Resident flows, participates in
-- the same cross-table lock. The Owner's own Admin Account may share its email.
CREATE FUNCTION platform_email_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE normalized text;
BEGIN
  IF TG_TABLE_NAME = 'owners' THEN normalized := lower(trim(NEW.contact_email));
  ELSIF TG_TABLE_NAME = 'accounts' THEN normalized := lower(trim(NEW.email));
  ELSE normalized := lower(trim(NEW.recipient_email)); END IF;
  IF normalized IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(normalized));
  IF TG_TABLE_NAME = 'owners' THEN
    IF EXISTS (SELECT 1 FROM accounts a WHERE lower(trim(a.email))=normalized AND a.owner_id IS DISTINCT FROM NEW.owner_id)
      OR EXISTS (SELECT 1 FROM owner_account_invitations i WHERE lower(trim(i.recipient_email))=normalized AND i.status='pending' AND i.owner_id <> NEW.owner_id)
    THEN RAISE EXCEPTION 'OWNER_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
  ELSIF TG_TABLE_NAME = 'accounts' THEN
    IF EXISTS (SELECT 1 FROM owners o WHERE lower(trim(o.contact_email))=normalized AND o.owner_id IS DISTINCT FROM NEW.owner_id)
      OR EXISTS (SELECT 1 FROM owner_account_invitations i WHERE lower(trim(i.recipient_email))=normalized AND i.status='pending' AND i.owner_id IS DISTINCT FROM NEW.owner_id)
    THEN RAISE EXCEPTION 'OWNER_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
  ELSIF NEW.status='pending' THEN
    IF EXISTS (SELECT 1 FROM owners o WHERE lower(trim(o.contact_email))=normalized AND o.owner_id <> NEW.owner_id)
      OR EXISTS (SELECT 1 FROM accounts a WHERE lower(trim(a.email))=normalized)
    THEN RAISE EXCEPTION 'OWNER_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owners_email_guard BEFORE INSERT OR UPDATE OF contact_email ON owners
  FOR EACH ROW EXECUTE FUNCTION platform_email_guard();
CREATE TRIGGER accounts_email_guard BEFORE INSERT OR UPDATE OF email ON accounts
  FOR EACH ROW EXECUTE FUNCTION platform_email_guard();
CREATE TRIGGER owner_invitation_email_guard BEFORE INSERT OR UPDATE OF recipient_email ON owner_account_invitations
  FOR EACH ROW EXECUTE FUNCTION platform_email_guard();

CREATE TABLE owner_password_resets (
  reset_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  recipient_email varchar(254) NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','expired','revoked')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by_account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  delivery_status varchar(20) NOT NULL DEFAULT 'demo_not_sent' CHECK (delivery_status IN ('demo_not_sent','unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX owner_password_reset_pending ON owner_password_resets(account_id) WHERE status = 'pending';

ALTER TABLE properties ADD COLUMN public_report_code varchar(32);
CREATE UNIQUE INDEX properties_public_report_code_key ON properties(public_report_code) WHERE public_report_code IS NOT NULL;
UPDATE properties SET public_report_code=substr(md5(random()::text || property_id::text || clock_timestamp()::text),1,24);
CREATE FUNCTION property_report_code_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.public_report_code IS NULL THEN
    NEW.public_report_code := substr(md5(random()::text || clock_timestamp()::text),1,24);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER properties_report_code_before_insert BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION property_report_code_default();
ALTER TABLE properties ALTER COLUMN public_report_code SET NOT NULL;

CREATE TABLE platform_reports (
  report_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference_code varchar(40) NOT NULL UNIQUE,
  property_id bigint NOT NULL,
  owner_id bigint NOT NULL,
  content varchar(4000) NOT NULL CHECK (length(trim(content)) > 0),
  anonymous boolean NOT NULL DEFAULT true,
  contact_name varchar(200),
  contact_email varchar(254),
  contact_phone varchar(30),
  status varchar(16) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (property_id, owner_id) REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT
);
CREATE INDEX platform_reports_queue ON platform_reports(status, created_at DESC, report_id DESC);
CREATE TABLE platform_report_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id bigint NOT NULL REFERENCES platform_reports(report_id) ON DELETE RESTRICT,
  actor_account_id bigint REFERENCES accounts(account_id) ON DELETE RESTRICT,
  action varchar(30) NOT NULL CHECK (action IN ('CREATED','TRANSITION','NOTE')),
  from_status varchar(16),
  to_status varchar(16),
  note varchar(2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_report_history_by_report ON platform_report_history(report_id, history_id);

CREATE TABLE platform_audit_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_account_id bigint REFERENCES accounts(account_id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  result varchar(30) NOT NULL CHECK (result IN ('SUCCESS','DENIED','FAILED')),
  target_type varchar(50),
  target_id bigint,
  reason varchar(1000),
  request_id varchar(100)
);
CREATE INDEX platform_audit_events_order ON platform_audit_events(occurred_at DESC, event_id DESC);
CREATE INDEX platform_audit_events_actor ON platform_audit_events(actor_account_id, occurred_at DESC);
CREATE INDEX platform_audit_events_target ON platform_audit_events(target_type, target_id, occurred_at DESC);
CREATE FUNCTION platform_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'platform audit events are append-only';
END $$;
CREATE TRIGGER platform_audit_no_mutation BEFORE UPDATE OR DELETE ON platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION platform_audit_append_only();

COMMIT;
