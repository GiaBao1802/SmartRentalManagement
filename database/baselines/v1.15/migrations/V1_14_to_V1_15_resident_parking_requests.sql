BEGIN;
SET LOCAL search_path = public, pg_catalog;
DO $$
BEGIN
  IF current_database() IN ('Goctro_dev_v18', 'Goctro_test3')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.15' THEN
    RAISE EXCEPTION 'Refusing V1.15 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501';
  END IF;
END $$;

ALTER TABLE parking_slots
  ADD COLUMN accepted_vehicle_type varchar(40),
  ADD COLUMN default_entitlement_id bigint,
  ADD CONSTRAINT parking_slots_accepted_vehicle_type_check
    CHECK (accepted_vehicle_type IS NULL OR accepted_vehicle_type IN ('MOTORCYCLE','CAR','BICYCLE','OTHER')),
  ADD CONSTRAINT parking_slots_default_entitlement_fk
    FOREIGN KEY (default_entitlement_id, owner_id, property_id)
    REFERENCES parking_entitlements(parking_entitlement_id, owner_id, property_id) ON DELETE RESTRICT;

CREATE TABLE parking_slot_requests (
  request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL,
  property_id bigint NOT NULL,
  parking_slot_id bigint NOT NULL,
  vehicle_id bigint NOT NULL,
  resident_id bigint NOT NULL,
  room_id bigint NOT NULL,
  contract_id bigint NOT NULL,
  entitlement_id bigint NOT NULL,
  started_at date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by_account_id bigint,
  review_note varchar(1000),
  assignment_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parking_slot_requests_expiry_check CHECK (expires_at > requested_at),
  CONSTRAINT parking_slot_requests_review_state_check CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_account_id IS NULL AND assignment_id IS NULL)
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND reviewed_by_account_id IS NOT NULL AND assignment_id IS NOT NULL)
    OR (status IN ('rejected','cancelled','expired') AND reviewed_at IS NOT NULL AND assignment_id IS NULL)
  ),
  CONSTRAINT parking_slot_requests_slot_fk
    FOREIGN KEY (parking_slot_id, property_id, owner_id)
    REFERENCES parking_slots(parking_slot_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_vehicle_fk
    FOREIGN KEY (vehicle_id, resident_id, owner_id)
    REFERENCES vehicles(vehicle_id, resident_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_resident_fk
    FOREIGN KEY (resident_id, owner_id)
    REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_room_fk
    FOREIGN KEY (room_id, property_id, owner_id)
    REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_contract_fk
    FOREIGN KEY (contract_id, room_id, property_id, owner_id)
    REFERENCES contracts(contract_id, room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_entitlement_fk
    FOREIGN KEY (entitlement_id, owner_id, property_id)
    REFERENCES parking_entitlements(parking_entitlement_id, owner_id, property_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_reviewer_fk
    FOREIGN KEY (reviewed_by_account_id, owner_id)
    REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT parking_slot_requests_assignment_fk
    FOREIGN KEY (assignment_id, owner_id, property_id)
    REFERENCES parking_slot_assignments(assignment_id, owner_id, property_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX parking_slot_requests_one_pending_per_slot
  ON parking_slot_requests(parking_slot_id) WHERE status = 'pending';
CREATE UNIQUE INDEX parking_slot_requests_one_pending_per_resident
  ON parking_slot_requests(resident_id) WHERE status = 'pending';
CREATE INDEX parking_slot_requests_admin_queue
  ON parking_slot_requests(owner_id, property_id, status, requested_at DESC);
CREATE INDEX parking_slot_requests_resident_history
  ON parking_slot_requests(resident_id, requested_at DESC);

COMMENT ON TABLE parking_slot_requests IS 'Resident requests reserve one configured parking slot for 24 hours; Admin approval creates the linked assignment.';
COMMENT ON COLUMN parking_slots.default_entitlement_id IS 'Slot offer for Resident requests; paid prices remain sourced from Property pricing.';
COMMENT ON COLUMN parking_slots.accepted_vehicle_type IS 'Optional vehicle category restriction; null accepts every category.';

COMMIT;
