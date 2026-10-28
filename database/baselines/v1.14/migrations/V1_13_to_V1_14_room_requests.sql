BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF current_database() IN ('Goctro_dev_v18','Goctro_test3') AND current_setting('goctro.allow_locked_db_migration',true) IS DISTINCT FROM 'V1.14' THEN
  RAISE EXCEPTION 'V1.14 requires verified backup and explicit migration session';
 END IF;
END $$;
CREATE TABLE complaint_room_requests (
 complaint_id bigint PRIMARY KEY REFERENCES complaints(complaint_id) ON DELETE RESTRICT,
 occupancy_id bigint NOT NULL REFERENCES room_residents(occupancy_id) ON DELETE RESTRICT,
 request_key uuid NOT NULL UNIQUE,
 equipment_code varchar(32) CHECK (equipment_code IN ('FRIDGE','AIR_CONDITIONER','WASHING_MACHINE','WATER_HEATER','BED','WARDROBE','DESK')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE room_equipment (
 room_id bigint NOT NULL,
 property_id bigint NOT NULL,
 owner_id bigint NOT NULL,
 equipment_code varchar(32) NOT NULL CHECK (equipment_code IN ('FRIDGE','AIR_CONDITIONER','WASHING_MACHINE','WATER_HEATER','BED','WARDROBE','DESK')),
 source_complaint_id bigint NOT NULL UNIQUE REFERENCES complaint_room_requests(complaint_id) ON DELETE RESTRICT,
 confirmed_by_account_id bigint NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,equipment_code),
 FOREIGN KEY(room_id,property_id,owner_id) REFERENCES rooms(room_id,property_id,owner_id) ON DELETE RESTRICT,
 FOREIGN KEY(confirmed_by_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX room_equipment_by_owner ON room_equipment(owner_id,room_id);
CREATE FUNCTION enforce_complaint_room_request_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM complaints c JOIN room_residents rr ON rr.occupancy_id=NEW.occupancy_id
   WHERE c.complaint_id=NEW.complaint_id AND c.owner_id=rr.owner_id AND c.resident_id=rr.resident_id AND c.room_id=rr.room_id AND c.property_id=rr.property_id) THEN
  RAISE EXCEPTION 'Complaint request must match occupancy scope' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER complaint_room_request_scope BEFORE INSERT OR UPDATE ON complaint_room_requests FOR EACH ROW EXECUTE FUNCTION enforce_complaint_room_request_scope();
CREATE FUNCTION enforce_room_equipment_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM complaint_room_requests x JOIN complaints c ON c.complaint_id=x.complaint_id
   WHERE x.complaint_id=NEW.source_complaint_id AND x.equipment_code=NEW.equipment_code AND c.room_id=NEW.room_id AND c.owner_id=NEW.owner_id AND c.property_id=NEW.property_id) THEN
  RAISE EXCEPTION 'Equipment source must match complaint room and requested equipment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER room_equipment_source BEFORE INSERT OR UPDATE ON room_equipment FOR EACH ROW EXECUTE FUNCTION enforce_room_equipment_source();
COMMIT;
