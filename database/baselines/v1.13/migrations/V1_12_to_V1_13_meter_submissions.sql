BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
 IF current_database() IN ('Goctro_dev_v18','Goctro_test3') AND current_setting('goctro.allow_locked_db_migration',true) IS DISTINCT FROM 'V1.13' THEN
  RAISE EXCEPTION 'V1.13 requires verified backup and exact predecessor authorization';
 END IF;
END $$;
CREATE TABLE resident_meter_submissions (
 submission_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id bigint NOT NULL,
 property_id bigint NOT NULL,
 room_id bigint NOT NULL,
 contract_id bigint NOT NULL,
 resident_id bigint NOT NULL,
 invoice_id bigint NOT NULL,
 utility varchar(16) NOT NULL CHECK (utility IN ('ELECTRICITY','WATER')),
 reading numeric(12,3) NOT NULL CHECK (reading >= 0),
 previous_draft_reading numeric(12,3),
 image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 1 AND 5242880),
 image_sha256 varchar(64) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
 decision_account_id bigint,
 decision_at timestamptz,
 decision_note varchar(1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (contract_id,room_id,property_id,owner_id) REFERENCES contracts(contract_id,room_id,property_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY (invoice_id,contract_id,property_id,owner_id) REFERENCES invoices(invoice_id,contract_id,property_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY (resident_id,owner_id) REFERENCES residents(resident_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY (decision_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
 CHECK ((status='PENDING' AND decision_account_id IS NULL AND decision_at IS NULL) OR (status<>'PENDING' AND decision_account_id IS NOT NULL AND decision_at IS NOT NULL))
);
CREATE UNIQUE INDEX resident_meter_pending ON resident_meter_submissions(invoice_id,utility) WHERE status='PENDING';
CREATE INDEX resident_meter_owner_queue ON resident_meter_submissions(owner_id,status,created_at DESC);
CREATE INDEX resident_meter_history ON resident_meter_submissions(resident_id,owner_id,created_at DESC);
COMMIT;
