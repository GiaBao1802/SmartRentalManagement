BEGIN;




CREATE TABLE owners (
    owner_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name   varchar(200) NOT NULL,
    contact_phone  varchar(30),
    contact_email  varchar(254),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
    property_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id       bigint NOT NULL REFERENCES owners(owner_id) ON DELETE RESTRICT,
    property_code  varchar(40) NOT NULL,
    name           varchar(150) NOT NULL,
    province       varchar(120) NOT NULL,
    address        text NOT NULL,
    manager_name   varchar(150),
    status         varchar(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','building','paused','archived')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_id, property_code),
    UNIQUE (property_id, owner_id)
);
CREATE INDEX properties_by_owner_status ON properties(owner_id, status);

CREATE TABLE rooms (
    room_id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id             bigint NOT NULL,
    owner_id                bigint NOT NULL,
    room_code               varchar(40) NOT NULL,
    status                  varchar(20) NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','occupied','inactive')),
    area_m2                 numeric(8,2) NOT NULL CHECK (area_m2 > 0),
    default_rent            bigint NOT NULL CHECK (default_rent >= 0),
    default_capacity        integer NOT NULL CHECK (default_capacity >= 1),
    is_active               boolean NOT NULL DEFAULT true,
    is_public               boolean NOT NULL DEFAULT false,
    public_description      text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (property_id, room_code),
    UNIQUE (room_id, property_id),
    UNIQUE (room_id, property_id, owner_id),
    UNIQUE (room_id, owner_id),
    FOREIGN KEY (property_id, owner_id) REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT
);
CREATE INDEX rooms_by_property_status ON rooms(property_id, status, room_code);
CREATE INDEX rooms_public_listing ON rooms(property_id, status) WHERE is_public AND is_active;

CREATE TABLE residents (
    resident_id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id                        bigint NOT NULL REFERENCES owners(owner_id) ON DELETE RESTRICT,
    national_id                     varchar(12),
    full_name                       varchar(200) NOT NULL,
    phone                           varchar(30),
    email                           varchar(254),
    avatar_storage_key              text,
    birth_date                      date,
    gender                          varchar(40),
    residence_status                varchar(20) NOT NULL DEFAULT 'living'
                                    CHECK (residence_status IN ('living','left')),
    residence_registration_status   varchar(32) NOT NULL DEFAULT 'not_completed'
                                    CHECK (residence_registration_status IN
                                           ('not_completed','temporary_resident','temporary_absence')),
    archived_at                     timestamptz,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    CHECK (national_id IS NULL OR national_id ~ '^[0-9]{12}$'),
    UNIQUE (owner_id, national_id),
    UNIQUE (resident_id, owner_id)
);
CREATE UNIQUE INDEX residents_avatar_storage_key_key
    ON residents(avatar_storage_key) WHERE avatar_storage_key IS NOT NULL;
CREATE INDEX residents_by_owner_status ON residents(owner_id, residence_status, full_name) WHERE archived_at IS NULL;
CREATE INDEX residents_by_owner_registration ON residents(owner_id, residence_registration_status)
    WHERE archived_at IS NULL;

CREATE TABLE accounts (
    account_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id        bigint UNIQUE REFERENCES owners(owner_id) ON DELETE RESTRICT,
    resident_id     bigint UNIQUE REFERENCES residents(resident_id) ON DELETE RESTRICT,
    role            varchar(16) NOT NULL CHECK (role IN ('admin','resident')),
    email           varchar(254) UNIQUE,
    phone           varchar(30),
    password_hash   text NOT NULL,
    status          varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((role = 'admin' AND owner_id IS NOT NULL AND resident_id IS NULL)
        OR (role = 'resident' AND owner_id IS NULL AND resident_id IS NOT NULL))
);
CREATE INDEX accounts_by_status_role ON accounts(status, role);
CREATE UNIQUE INDEX accounts_phone_nonnull_key
    ON accounts(phone) WHERE phone IS NOT NULL;
-- Supports Owner-scoped uploader/invitation references without trusting caller-supplied scope.
ALTER TABLE accounts ADD CONSTRAINT accounts_id_owner_unique UNIQUE (account_id, owner_id);

CREATE TABLE account_invitations (
    invitation_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id               bigint NOT NULL REFERENCES owners(owner_id) ON DELETE RESTRICT,
    resident_id            bigint NOT NULL,
    created_by_account_id  bigint NOT NULL,
    token_hash             varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    status                 varchar(16) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','expired','revoked')),
    expires_at             timestamptz NOT NULL,
    accepted_at            timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (accepted_at IS NULL OR accepted_at <= expires_at),
    CHECK ((status = 'accepted' AND accepted_at IS NOT NULL)
        OR (status <> 'accepted' AND accepted_at IS NULL)),
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by_account_id, owner_id) REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT
);
CREATE INDEX account_invitations_by_resident_status
    ON account_invitations(owner_id, resident_id, status, created_at DESC);
CREATE UNIQUE INDEX one_pending_invitation_per_resident
    ON account_invitations(owner_id, resident_id) WHERE status = 'pending';

CREATE FUNCTION prevent_invitation_identity_overwrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.owner_id, NEW.resident_id, NEW.created_by_account_id, NEW.token_hash,
           NEW.expires_at, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.owner_id, OLD.resident_id, OLD.created_by_account_id, OLD.token_hash,
           OLD.expires_at, OLD.created_at) THEN
        RAISE EXCEPTION 'invitation identity/token is immutable; create a new invitation'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER account_invitation_identity_immutable
BEFORE UPDATE ON account_invitations
FOR EACH ROW EXECUTE FUNCTION prevent_invitation_identity_overwrite();

CREATE FUNCTION prevent_invitation_history_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'invitation history cannot be deleted'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER account_invitation_history_no_delete
BEFORE DELETE ON account_invitations
FOR EACH ROW EXECUTE FUNCTION prevent_invitation_history_delete();

CREATE TABLE contracts (
    contract_id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_no                 varchar(40) NOT NULL UNIQUE,
    room_id                     bigint NOT NULL,
    property_id                 bigint NOT NULL,
    owner_id                    bigint NOT NULL,
    representative_resident_id  bigint NOT NULL,
    previous_contract_id       bigint,
    start_date                  date NOT NULL,
    end_date                    date NOT NULL,
    status                      varchar(16) NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','active','expired','terminated')),
    revision                    integer NOT NULL DEFAULT 0 CONSTRAINT contracts_revision_nonnegative CHECK (revision >= 0),
    rent_amount                 bigint NOT NULL CHECK (rent_amount >= 0),
    deposit_amount              bigint NOT NULL CHECK (deposit_amount >= 0),
    resident_capacity           integer NOT NULL CHECK (resident_capacity >= 1),
    initial_electric_kwh        numeric(12,3) CHECK (initial_electric_kwh IS NULL OR initial_electric_kwh >= 0),
    initial_water_m3            numeric(12,3) CHECK (initial_water_m3 IS NULL OR initial_water_m3 >= 0),
    termination_date            date,
    termination_reason          text,
    final_electric_kwh          numeric(12,3) CHECK (final_electric_kwh IS NULL OR final_electric_kwh >= 0),
    final_water_m3              numeric(12,3) CHECK (final_water_m3 IS NULL OR final_water_m3 >= 0),
    deposit_deduction           bigint CHECK (deposit_deduction IS NULL OR deposit_deduction >= 0),
    deposit_settlement_amount   bigint CHECK (deposit_settlement_amount IS NULL OR deposit_settlement_amount >= 0),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contracts_status_revision_consistent CHECK (
        (status = 'draft' AND revision = 0)
        OR (status IN ('active','expired','terminated') AND revision >= 1)
    ),
    CHECK (end_date > start_date),
    CHECK (termination_date IS NULL OR termination_date >= start_date),
    CHECK (deposit_deduction IS NULL OR deposit_deduction <= deposit_amount),
    CHECK (deposit_settlement_amount IS NULL OR
           deposit_settlement_amount = deposit_amount - COALESCE(deposit_deduction, 0)),
    CONSTRAINT contracts_id_owner_unique UNIQUE (contract_id, owner_id),
    UNIQUE (contract_id, room_id),
    UNIQUE (contract_id, property_id, owner_id),
    UNIQUE (contract_id, room_id, property_id, owner_id),
    UNIQUE (contract_id, room_id, owner_id),
    CHECK (previous_contract_id IS NULL OR previous_contract_id <> contract_id),
    FOREIGN KEY (room_id, property_id, owner_id) REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (representative_resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (previous_contract_id, room_id, owner_id)
        REFERENCES contracts(contract_id, room_id, owner_id) ON DELETE RESTRICT
);
-- One record marked active per room. Date-range overlap (including future contracts) must also
-- be checked in a backend transaction that locks the room row before create/renew/activate.
CREATE UNIQUE INDEX one_active_contract_per_room ON contracts(room_id) WHERE status = 'active';
CREATE INDEX contracts_by_resident ON contracts(owner_id, representative_resident_id, start_date DESC);
CREATE INDEX contracts_by_room_dates ON contracts(owner_id, room_id, start_date, end_date);

CREATE UNIQUE INDEX one_successor_per_contract ON contracts(previous_contract_id)
    WHERE previous_contract_id IS NOT NULL;

CREATE TABLE contract_change_history (
    change_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id            bigint NOT NULL,
    owner_id               bigint NOT NULL,
    changed_by_account_id  bigint NOT NULL,
    revision               integer NOT NULL CHECK (revision >= 1),
    change_type            varchar(32) NOT NULL
                           CHECK (change_type IN ('activation','material_update','status_transition')),
    change_reason          varchar(1000),
    before_data            jsonb NOT NULL CHECK (jsonb_typeof(before_data) = 'object'),
    after_data             jsonb NOT NULL CHECK (jsonb_typeof(after_data) = 'object'),
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_change_history_material_reason CHECK (
        change_type <> 'material_update'
        OR (change_reason IS NOT NULL AND length(btrim(change_reason)) BETWEEN 1 AND 1000)
    ),
    UNIQUE (contract_id, revision),
    FOREIGN KEY (contract_id, owner_id)
        REFERENCES contracts(contract_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (changed_by_account_id, owner_id)
        REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE RESTRICT
);
CREATE INDEX contract_change_history_by_owner_contract_revision
    ON contract_change_history(owner_id, contract_id, revision DESC);

CREATE FUNCTION prevent_contract_change_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'contract change history is append-only; record a new event instead'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER contract_change_history_append_only
BEFORE UPDATE OR DELETE ON contract_change_history
FOR EACH ROW EXECUTE FUNCTION prevent_contract_change_history_mutation();
CREATE TABLE contract_documents (
    document_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id             bigint NOT NULL,
    property_id             bigint NOT NULL,
    owner_id                bigint NOT NULL,
    file_name               varchar(255) NOT NULL,
    storage_key             text NOT NULL UNIQUE CHECK (length(trim(storage_key)) > 0),
    mime_type               varchar(150) NOT NULL,
    file_size               bigint NOT NULL CHECK (file_size >= 0),
    document_type           varchar(20) NOT NULL
                            CHECK (document_type IN ('contract','renewal','termination','attachment')),
    version                 integer NOT NULL CHECK (version >= 1),
    checksum_sha256         varchar(64) CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
    status                  varchar(16) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','generated','signed','superseded','archived')),
    uploaded_by_account_id  bigint NOT NULL,
    signed_at               timestamptz,
    signature_provider      varchar(100),
    signature_reference     varchar(255),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contract_id, document_type, version),
    FOREIGN KEY (contract_id, property_id, owner_id)
        REFERENCES contracts(contract_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (uploaded_by_account_id, owner_id)
        REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
    CHECK (status <> 'signed' OR signed_at IS NOT NULL),
    CHECK (signature_reference IS NULL OR signed_at IS NOT NULL)
);
CREATE INDEX contract_documents_by_contract
    ON contract_documents(owner_id, contract_id, document_type, version DESC);

CREATE FUNCTION prevent_contract_document_version_overwrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.contract_id, NEW.property_id, NEW.owner_id, NEW.file_name, NEW.storage_key,
           NEW.mime_type, NEW.file_size, NEW.document_type, NEW.version, NEW.checksum_sha256,
           NEW.uploaded_by_account_id)
       IS DISTINCT FROM
       ROW(OLD.contract_id, OLD.property_id, OLD.owner_id, OLD.file_name, OLD.storage_key,
           OLD.mime_type, OLD.file_size, OLD.document_type, OLD.version, OLD.checksum_sha256,
           OLD.uploaded_by_account_id) THEN
        RAISE EXCEPTION 'contract document version metadata is immutable; insert a new version'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER contract_document_version_immutable
BEFORE UPDATE ON contract_documents
FOR EACH ROW EXECUTE FUNCTION prevent_contract_document_version_overwrite();

CREATE FUNCTION prevent_contract_document_history_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'contract document history cannot be deleted; archive the record instead'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER contract_document_history_no_delete
BEFORE DELETE ON contract_documents
FOR EACH ROW EXECUTE FUNCTION prevent_contract_document_history_delete();

CREATE TABLE room_residents (
    occupancy_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id        bigint NOT NULL,
    property_id    bigint NOT NULL,
    owner_id       bigint NOT NULL,
    resident_id    bigint NOT NULL,
    contract_id    bigint,
    started_at     date NOT NULL,
    ended_at       date,
    status         varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (contract_id, room_id, property_id, owner_id) REFERENCES contracts(contract_id, room_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (room_id, property_id, owner_id) REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK ((status = 'active' AND ended_at IS NULL) OR (status = 'ended' AND ended_at IS NOT NULL)),
    UNIQUE (resident_id, room_id, started_at)
);
CREATE INDEX room_residents_by_room_status ON room_residents(room_id, owner_id, status, started_at);
CREATE INDEX room_residents_by_resident ON room_residents(resident_id, owner_id, started_at DESC);

CREATE TABLE invoices (
    invoice_id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_no                  varchar(40) NOT NULL UNIQUE,
    contract_id                 bigint NOT NULL,
    property_id                 bigint NOT NULL,
    owner_id                    bigint NOT NULL,
    period_start                date NOT NULL,
    period_end                  date NOT NULL,
    due_date                    date,
    finalized_at                timestamptz,
    rent_amount                 bigint NOT NULL DEFAULT 0 CHECK (rent_amount >= 0),
    electricity_previous_kwh    numeric(12,3) CHECK (electricity_previous_kwh IS NULL OR electricity_previous_kwh >= 0),
    electricity_current_kwh     numeric(12,3) CHECK (electricity_current_kwh IS NULL OR electricity_current_kwh >= 0),
    electricity_amount          bigint NOT NULL DEFAULT 0 CHECK (electricity_amount >= 0),
    water_previous_m3           numeric(12,3) CHECK (water_previous_m3 IS NULL OR water_previous_m3 >= 0),
    water_current_m3            numeric(12,3) CHECK (water_current_m3 IS NULL OR water_current_m3 >= 0),
    water_amount                bigint NOT NULL DEFAULT 0 CHECK (water_amount >= 0),
    service_amount              bigint NOT NULL DEFAULT 0 CHECK (service_amount >= 0),
    total_amount                bigint NOT NULL CHECK (total_amount >= 0),
    status                      varchar(16) NOT NULL DEFAULT 'draft',
    revision                    integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contract_id, period_start, period_end),
    UNIQUE (invoice_id, contract_id, property_id, owner_id),
    FOREIGN KEY (contract_id, property_id, owner_id) REFERENCES contracts(contract_id, property_id, owner_id) ON DELETE RESTRICT,
    CHECK (period_end >= period_start),
    CHECK (total_amount = rent_amount + electricity_amount + water_amount + service_amount),
    CONSTRAINT invoices_status_allowed CHECK (status IN ('draft','unpaid','paid')),
    CONSTRAINT invoices_lifecycle_consistent CHECK (
        (status = 'draft' AND finalized_at IS NULL AND due_date IS NULL)
        OR
        (status IN ('unpaid','paid') AND finalized_at IS NOT NULL AND due_date IS NOT NULL)
    )
);
CREATE INDEX invoices_by_status_due ON invoices(owner_id, status, due_date);
CREATE INDEX invoices_by_period ON invoices(owner_id, period_start DESC);

CREATE TABLE payment_transactions (
    payment_transaction_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id              bigint NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
    payment_session_id      uuid NOT NULL,
    provider                varchar(16) NOT NULL CHECK (provider IN ('momo','zalopay','demo')),
    provider_transaction_id varchar(160),
    provider_event_id       varchar(160),
    provider_reference      varchar(200),
    amount                  bigint NOT NULL CHECK (amount > 0),
    currency                char(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    status                  varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
    error_code              varchar(100),
    error_message           text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    processed_at            timestamptz,
    CHECK ((status = 'pending' AND processed_at IS NULL) OR
           (status IN ('success','failed') AND processed_at IS NOT NULL))
);
CREATE UNIQUE INDEX payment_provider_transaction_unique
    ON payment_transactions(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX payment_provider_event_unique
    ON payment_transactions(provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX payment_by_invoice_created ON payment_transactions(invoice_id, created_at DESC);
CREATE INDEX payment_by_session ON payment_transactions(payment_session_id, created_at);
CREATE UNIQUE INDEX one_success_payment_per_invoice
    ON payment_transactions(invoice_id) WHERE status = 'success';

CREATE TABLE invoice_zalo_oa_send_logs (
    send_log_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id           bigint NOT NULL,
    contract_id          bigint NOT NULL,
    property_id          bigint NOT NULL,
    owner_id             bigint NOT NULL,
    recipient_resident_id bigint NOT NULL,
    recipient_phone      varchar(30),
    invoice_revision     integer NOT NULL CHECK (invoice_revision >= 1),
    status               varchar(16) NOT NULL CHECK (status IN ('queued','sent','failed')),
    provider_message_id  varchar(160),
    provider_response    jsonb,
    error_message        text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    sent_at              timestamptz,
    FOREIGN KEY (invoice_id, contract_id, property_id, owner_id) REFERENCES invoices(invoice_id, contract_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (recipient_resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT
);
CREATE INDEX invoice_zalo_logs_by_invoice ON invoice_zalo_oa_send_logs(invoice_id, created_at DESC);

CREATE TABLE amenities (
    amenity_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id      bigint NOT NULL,
    owner_id         bigint NOT NULL,
    amenity_type     varchar(16) NOT NULL CHECK (amenity_type IN ('pool','gym','other')),
    name             varchar(150) NOT NULL,
    description      text,
    location         varchar(200),
    opening_time     time,
    closing_time     time,
    operating_info   text,
    rules            text,
    registration_type varchar(20) NOT NULL DEFAULT 'information'
                     CHECK (registration_type IN ('information','subscription')),
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (property_id, name),
    UNIQUE (amenity_id, property_id),
    UNIQUE (amenity_id, property_id, owner_id),
    FOREIGN KEY (property_id, owner_id) REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT,
    CHECK ((amenity_type IN ('pool','gym') AND registration_type = 'subscription') OR
           (amenity_type = 'other' AND registration_type = 'information'))
);
CREATE INDEX amenities_by_property_active ON amenities(property_id, active);

CREATE TABLE amenity_price_history (
    amenity_price_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amenity_id       bigint NOT NULL REFERENCES amenities(amenity_id) ON DELETE RESTRICT,
    effective_at     timestamptz NOT NULL,
    price_amount     bigint NOT NULL CHECK (price_amount >= 0),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (amenity_id, effective_at)
);
CREATE INDEX amenity_price_asof ON amenity_price_history(amenity_id, effective_at DESC);

CREATE TABLE amenity_subscriptions (
    subscription_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amenity_id               bigint NOT NULL,
    property_id              bigint NOT NULL,
    owner_id                 bigint NOT NULL,
    resident_id              bigint NOT NULL,
    contract_id              bigint NOT NULL,
    started_at               timestamptz NOT NULL,
    status                   varchar(24) NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','cancellation_requested','ended','contract_ended')),
    cancellation_requested_at timestamptz,
    effective_end_at         timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'cancellation_requested' AND cancellation_requested_at IS NOT NULL AND effective_end_at IS NOT NULL)
        OR status <> 'cancellation_requested'),
    UNIQUE (subscription_id, amenity_id),
    UNIQUE (subscription_id, contract_id, property_id, owner_id),
    FOREIGN KEY (amenity_id, property_id, owner_id) REFERENCES amenities(amenity_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (contract_id, property_id, owner_id) REFERENCES contracts(contract_id, property_id, owner_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_active_subscription_per_resident_amenity
    ON amenity_subscriptions(resident_id, amenity_id)
    WHERE status IN ('active','cancellation_requested');
CREATE INDEX amenity_subscriptions_by_contract ON amenity_subscriptions(owner_id, contract_id, status);

CREATE TABLE amenity_subscription_cycles (
    subscription_cycle_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id       bigint NOT NULL,
    contract_id           bigint NOT NULL,
    property_id           bigint NOT NULL,
    owner_id              bigint NOT NULL,
    cycle_start           timestamptz NOT NULL,
    cycle_end             timestamptz NOT NULL,
    price_snapshot        bigint NOT NULL CHECK (price_snapshot >= 0),
    status                varchar(16) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('planned','active','completed','cancelled')),
    invoice_id            bigint,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CHECK (cycle_end > cycle_start AND cycle_end - cycle_start = interval '720 hours'),
    UNIQUE (subscription_id, cycle_start),
    FOREIGN KEY (subscription_id, contract_id, property_id, owner_id)
        REFERENCES amenity_subscriptions(subscription_id, contract_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (invoice_id, contract_id, property_id, owner_id)
        REFERENCES invoices(invoice_id, contract_id, property_id, owner_id) MATCH SIMPLE ON DELETE RESTRICT
);
CREATE INDEX amenity_cycles_by_subscription ON amenity_subscription_cycles(subscription_id, cycle_start);
CREATE INDEX amenity_cycles_by_invoice ON amenity_subscription_cycles(invoice_id) WHERE invoice_id IS NOT NULL;
-- Unique start and 720-hour CHECK protect individual cycles. The backend must lock a subscription
-- while creating the next cycle and reject any overlap with an existing cycle.

CREATE TABLE parking_areas (
    parking_area_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id     bigint NOT NULL,
    owner_id        bigint NOT NULL,
    name            varchar(150) NOT NULL,
    location        varchar(200),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (property_id, name),
    UNIQUE (parking_area_id, property_id),
    UNIQUE (parking_area_id, property_id, owner_id),
    FOREIGN KEY (property_id, owner_id) REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE parking_slots (
    parking_slot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parking_area_id bigint NOT NULL,
    property_id     bigint NOT NULL,
    owner_id        bigint NOT NULL,
    slot_code       varchar(40) NOT NULL,
    status          varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (parking_area_id, slot_code),
    UNIQUE (parking_slot_id, parking_area_id),
    UNIQUE (parking_slot_id, property_id, owner_id),
    FOREIGN KEY (parking_area_id, property_id, owner_id) REFERENCES parking_areas(parking_area_id, property_id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE vehicles (
    vehicle_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resident_id   bigint NOT NULL,
    owner_id      bigint NOT NULL,
    vehicle_type  varchar(40) NOT NULL,
    plate_number  varchar(30),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, resident_id),
    UNIQUE (vehicle_id, resident_id, owner_id),
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE parking_slot_assignments (
    assignment_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parking_slot_id bigint NOT NULL,
    property_id     bigint NOT NULL,
    owner_id        bigint NOT NULL,
    vehicle_id      bigint NOT NULL,
    resident_id     bigint NOT NULL,
    room_id         bigint NOT NULL,
    contract_id     bigint NOT NULL,
    started_at      date NOT NULL,
    ended_at        date,
    status          varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','revoked')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (parking_slot_id, property_id, owner_id) REFERENCES parking_slots(parking_slot_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id, resident_id, owner_id) REFERENCES vehicles(vehicle_id, resident_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (room_id, property_id, owner_id) REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (contract_id, room_id, property_id, owner_id) REFERENCES contracts(contract_id, room_id, property_id, owner_id) ON DELETE RESTRICT,
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK ((status = 'active' AND ended_at IS NULL) OR (status IN ('ended','revoked') AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_assignment_per_slot ON parking_slot_assignments(parking_slot_id) WHERE status = 'active';
CREATE UNIQUE INDEX one_active_assignment_per_vehicle ON parking_slot_assignments(vehicle_id) WHERE status = 'active';
CREATE INDEX parking_assignments_by_room_status ON parking_slot_assignments(owner_id, room_id, status);

CREATE TABLE complaints (
    complaint_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resident_id   bigint NOT NULL,
    property_id   bigint NOT NULL,
    owner_id      bigint NOT NULL,
    room_id       bigint,
    category      varchar(100) NOT NULL,
    content       text NOT NULL,
    priority      varchar(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    status        varchar(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','resolved','rejected')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz,
    FOREIGN KEY (room_id, property_id) REFERENCES rooms(room_id, property_id) ON DELETE RESTRICT,
    FOREIGN KEY (property_id, owner_id) REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (resident_id, owner_id) REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
    CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR status <> 'resolved')
);
CREATE INDEX complaints_by_property_status_date ON complaints(owner_id, property_id, status, created_at DESC);
CREATE INDEX complaints_by_resident_date ON complaints(owner_id, resident_id, created_at DESC);

CREATE TABLE complaint_history (
    complaint_history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaint_id         bigint NOT NULL REFERENCES complaints(complaint_id) ON DELETE RESTRICT,
    actor_account_id     bigint REFERENCES accounts(account_id) ON DELETE SET NULL,
    action               varchar(24) NOT NULL CHECK (action IN ('created','status_changed','note_added','reopened')),
    from_status          varchar(20) CHECK (from_status IS NULL OR from_status IN ('pending','in_progress','resolved','rejected')),
    to_status            varchar(20) CHECK (to_status IS NULL OR to_status IN ('pending','in_progress','resolved','rejected')),
    note                 text,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_history_by_complaint ON complaint_history(complaint_id, created_at);

CREATE TABLE contact_requests (
    contact_request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id        bigint NOT NULL REFERENCES properties(property_id) ON DELETE RESTRICT,
    room_id            bigint,
    requester_name     varchar(200) NOT NULL,
    phone              varchar(30) NOT NULL,
    email              varchar(254),
    message            text,
    status             varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (room_id, property_id) REFERENCES rooms(room_id, property_id) ON DELETE RESTRICT
);
CREATE INDEX contact_requests_by_property_status ON contact_requests(property_id, status, created_at DESC);

CREATE TABLE notifications (
    notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    notification_type varchar(40) NOT NULL,
    title           varchar(200) NOT NULL,
    body            text NOT NULL,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_by_account_unread ON notifications(account_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
    account_id          bigint PRIMARY KEY REFERENCES accounts(account_id) ON DELETE RESTRICT,
    new_invoice         boolean NOT NULL DEFAULT true,
    overdue_invoice     boolean NOT NULL DEFAULT true,
    expiring_contract   boolean NOT NULL DEFAULT true,
    complaint_updates   boolean NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_images (
    room_image_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id       bigint NOT NULL
                  REFERENCES rooms(room_id) ON DELETE RESTRICT,
    storage_key   varchar(512) NOT NULL,
    is_cover      boolean NOT NULL DEFAULT false,
    sort_order    integer NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT room_images_storage_key_not_blank CHECK (length(btrim(storage_key)) > 0),
    CONSTRAINT room_images_room_storage_key_key UNIQUE (room_id, storage_key)
);

CREATE INDEX room_images_by_room_order
    ON room_images(room_id, sort_order, room_image_id);

CREATE INDEX room_images_by_storage_key
    ON room_images(storage_key);

CREATE UNIQUE INDEX room_images_one_cover_per_room
    ON room_images(room_id) WHERE is_cover;

CREATE FUNCTION room_images_lock_parent_before_insert_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Fail fast if another transaction is inserting into this Room. A waiting
    -- INSERT would retain its original statement snapshot after the row lock
    -- is released and could miss the committed association in its count check.
    IF NOT pg_try_advisory_xact_lock(
        hashtextextended('goctro:room-images:' || NEW.room_id::text, 0)
    ) THEN
        RAISE EXCEPTION 'Concurrent Room image write; retry the operation'
            USING ERRCODE = '40001', CONSTRAINT = 'room_images_max_5_per_room';
    END IF;

    -- Updating updated_at both records the gallery mutation and makes a
    -- transaction using a stale REPEATABLE READ snapshot fail serialization.
    UPDATE rooms SET updated_at = clock_timestamp() WHERE room_id = NEW.room_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room does not exist' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER room_images_lock_parent_before_insert
    BEFORE INSERT ON room_images
    FOR EACH ROW EXECUTE FUNCTION room_images_lock_parent_before_insert_fn();

CREATE FUNCTION room_images_identity_immutable_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key THEN
        RAISE EXCEPTION 'Room image association identity is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'room_images_identity_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER room_images_identity_immutable
    BEFORE UPDATE OF room_id, storage_key ON room_images
    FOR EACH ROW EXECUTE FUNCTION room_images_identity_immutable_fn();

CREATE FUNCTION room_images_enforce_max_five_after_insert_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected_room_id bigint;
    image_count integer;
BEGIN
    FOR affected_room_id IN
        SELECT DISTINCT room_id FROM inserted_room_images ORDER BY room_id
    LOOP
        SELECT count(*) INTO image_count
        FROM room_images WHERE room_id = affected_room_id;
        IF image_count > 5 THEN
            RAISE EXCEPTION 'A Room can have at most 5 images'
                USING ERRCODE = '23514', CONSTRAINT = 'room_images_max_5_per_room';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE TRIGGER room_images_max_5_after_insert
    AFTER INSERT ON room_images
    REFERENCING NEW TABLE AS inserted_room_images
    FOR EACH STATEMENT EXECUTE FUNCTION room_images_enforce_max_five_after_insert_fn();
-- Database V1.5 additive object, matching the prior V1.4 → V1.5 migration.


CREATE TABLE contract_idempotency_requests (
    request_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id                bigint NOT NULL,
    account_id              bigint NOT NULL,
    operation_scope         varchar(200) NOT NULL,
    idempotency_key_hash    bytea NOT NULL,
    request_fingerprint     bytea NOT NULL,
    fingerprint_version     smallint NOT NULL DEFAULT 1,
    state                   varchar(16) NOT NULL DEFAULT 'in_progress',
    response_status         smallint,
    response_ciphertext     bytea,
    response_nonce          bytea,
    response_auth_tag       bytea,
    response_key_version    varchar(64),
    created_at              timestamptz NOT NULL DEFAULT now(),
    completed_at            timestamptz,

    CONSTRAINT contract_idempotency_requests_owner_fk
        FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE RESTRICT,
    CONSTRAINT contract_idempotency_requests_account_owner_fk
        FOREIGN KEY (account_id, owner_id)
        REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
    CONSTRAINT contract_idempotency_requests_scope_key_key
        UNIQUE (owner_id, account_id, operation_scope, idempotency_key_hash),
    CONSTRAINT contract_idempotency_requests_key_hash_check
        CHECK (octet_length(idempotency_key_hash) = 32),
    CONSTRAINT contract_idempotency_requests_fingerprint_check
        CHECK (octet_length(request_fingerprint) = 32 AND fingerprint_version >= 1),
    CONSTRAINT contract_idempotency_requests_scope_check
        CHECK (operation_scope ~ '^(contracts\.create|contracts\.(activate|renew|terminate):[1-9][0-9]*)$'),
    CONSTRAINT contract_idempotency_requests_state_check
        CHECK (state IN ('in_progress','completed')),
    CONSTRAINT contract_idempotency_requests_response_state_check
        CHECK (
            (state = 'in_progress'
                AND response_status IS NULL AND response_ciphertext IS NULL
                AND response_nonce IS NULL AND response_auth_tag IS NULL
                AND response_key_version IS NULL AND completed_at IS NULL)
            OR
            (state = 'completed'
                AND response_status BETWEEN 200 AND 299
                AND response_ciphertext IS NOT NULL
                AND response_nonce IS NOT NULL AND octet_length(response_nonce) = 12
                AND response_auth_tag IS NOT NULL AND octet_length(response_auth_tag) = 16
                AND response_key_version IS NOT NULL AND length(response_key_version) > 0
                AND completed_at IS NOT NULL AND completed_at >= created_at)
        )
);

CREATE INDEX contract_idempotency_requests_account_owner_idx
    ON contract_idempotency_requests(account_id, owner_id);

COMMENT ON TABLE contract_idempotency_requests IS
    'Database V1.5: durable successful Contract command replay; Owner/Account scoped; response encrypted; no automatic expiry.';
COMMENT ON COLUMN contract_idempotency_requests.idempotency_key_hash IS
    'SHA-256 digest of the validated Idempotency-Key; raw key is never persisted.';
COMMENT ON COLUMN contract_idempotency_requests.request_fingerprint IS
    'Versioned SHA-256 fingerprint of canonical normalized semantic input.';
COMMENT ON COLUMN contract_idempotency_requests.response_ciphertext IS
    'AES-256-GCM encrypted serialized successful JSON response; key material is external to PostgreSQL.';



-- V1.7 additive Billing objects
CREATE TABLE utility_tariffs (
  utility_tariff_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL,
  property_id bigint NOT NULL,
  utility_type varchar(16) NOT NULL CHECK (utility_type IN ('ELECTRICITY','WATER')),
  code varchar(60) NOT NULL,
  name varchar(150) NOT NULL,
  provider_name varchar(200), locality varchar(200), source_metadata jsonb,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,property_id,utility_type,code),
  UNIQUE(utility_tariff_id,owner_id,property_id,utility_type),
  FOREIGN KEY(property_id,owner_id) REFERENCES properties(property_id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX utility_tariffs_property_type_status ON utility_tariffs(owner_id,property_id,utility_type,status);

CREATE TABLE utility_tariff_versions (
  utility_tariff_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  utility_tariff_id bigint NOT NULL, owner_id bigint NOT NULL, property_id bigint NOT NULL,
  utility_type varchar(16) NOT NULL CHECK(utility_type IN ('ELECTRICITY','WATER')),
  version_no integer NOT NULL CHECK(version_no > 0), effective_from date NOT NULL,
  unit varchar(12) NOT NULL CHECK(unit IN ('kWh','m3')),
  calculation_mode varchar(16) NOT NULL CHECK(calculation_mode IN ('PROGRESSIVE','FLAT')),
  flat_unit_price bigint CHECK(flat_unit_price IS NULL OR flat_unit_price >= 0),
  source_name varchar(200), source_reference text, source_snapshot jsonb,
  published_at timestamptz, published_by_account_id bigint,
  correction_reason text, supersedes_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(), created_by_account_id bigint NOT NULL,
  UNIQUE(utility_tariff_id,version_no), UNIQUE(utility_tariff_id,effective_from,version_no),
  UNIQUE(utility_tariff_version_id,owner_id,property_id,utility_type),
  FOREIGN KEY(utility_tariff_id,owner_id,property_id,utility_type)
    REFERENCES utility_tariffs(utility_tariff_id,owner_id,property_id,utility_type) ON DELETE RESTRICT,
  FOREIGN KEY(published_by_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(supersedes_version_id,owner_id,property_id,utility_type)
    REFERENCES utility_tariff_versions(utility_tariff_version_id,owner_id,property_id,utility_type) ON DELETE RESTRICT,
  CHECK((utility_type='WATER' AND unit='m3' AND calculation_mode='FLAT' AND flat_unit_price IS NOT NULL)
     OR (utility_type='ELECTRICITY' AND unit='kWh' AND calculation_mode='PROGRESSIVE' AND flat_unit_price IS NULL)),
  CHECK((published_at IS NULL AND published_by_account_id IS NULL)
     OR (published_at IS NOT NULL AND published_by_account_id IS NOT NULL))
);
CREATE INDEX utility_tariff_versions_asof ON utility_tariff_versions(utility_tariff_id,effective_from DESC,version_no DESC)
  WHERE published_at IS NOT NULL;

CREATE TABLE electricity_tariff_tiers (
  electricity_tariff_tier_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  utility_tariff_version_id bigint NOT NULL REFERENCES utility_tariff_versions(utility_tariff_version_id) ON DELETE RESTRICT,
  tier_no integer NOT NULL CHECK(tier_no>0), lower_kwh numeric(12,3) NOT NULL CHECK(lower_kwh>=0),
  upper_kwh numeric(12,3) CHECK(upper_kwh IS NULL OR upper_kwh>lower_kwh),
  unit_price bigint NOT NULL CHECK(unit_price>=0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(utility_tariff_version_id,tier_no), UNIQUE(utility_tariff_version_id,lower_kwh),
  UNIQUE(electricity_tariff_tier_id,utility_tariff_version_id)
);
CREATE UNIQUE INDEX electricity_tiers_one_open_final ON electricity_tariff_tiers(utility_tariff_version_id)
  WHERE upper_kwh IS NULL;

CREATE TABLE property_facilities (
  property_facility_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL, property_id bigint NOT NULL, name varchar(150) NOT NULL,
  description text, location varchar(200), active boolean NOT NULL DEFAULT true,
  legacy_amenity_id bigint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,name), UNIQUE(property_facility_id,owner_id,property_id),
  UNIQUE(legacy_amenity_id),
  FOREIGN KEY(property_id,owner_id) REFERENCES properties(property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(legacy_amenity_id,property_id,owner_id) REFERENCES amenities(amenity_id,property_id,owner_id) ON DELETE RESTRICT
);

CREATE TABLE property_pricing_items (
  property_pricing_item_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL, property_id bigint NOT NULL,
  kind varchar(24) NOT NULL CHECK(kind IN ('FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING')),
  code varchar(60) NOT NULL, name varchar(150) NOT NULL, description text,
  unit varchar(30) NOT NULL, status varchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,code), UNIQUE(property_pricing_item_id,owner_id,property_id,kind),
  FOREIGN KEY(property_id,owner_id) REFERENCES properties(property_id,owner_id) ON DELETE RESTRICT
);
CREATE INDEX property_pricing_items_kind_status ON property_pricing_items(owner_id,property_id,kind,status);

CREATE TABLE property_flexible_service_configurations (
  property_pricing_item_id bigint PRIMARY KEY,
  owner_id bigint NOT NULL,
  property_id bigint NOT NULL,
  kind varchar(24) NOT NULL DEFAULT 'FLEXIBLE_SERVICE' CHECK (kind = 'FLEXIBLE_SERVICE'),
  service_mode varchar(16) NOT NULL CHECK (service_mode IN ('BOOKING', 'SUBSCRIPTION')),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  open_monday boolean NOT NULL DEFAULT true,
  open_tuesday boolean NOT NULL DEFAULT true,
  open_wednesday boolean NOT NULL DEFAULT true,
  open_thursday boolean NOT NULL DEFAULT true,
  open_friday boolean NOT NULL DEFAULT true,
  open_saturday boolean NOT NULL DEFAULT true,
  open_sunday boolean NOT NULL DEFAULT true,
  slot_duration_minutes integer,
  capacity_per_slot integer,
  package_duration_count integer,
  package_duration_unit varchar(8),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (property_pricing_item_id, owner_id, property_id, kind),
  FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_pricing_items(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CHECK (opens_at < closes_at),
  CHECK (open_monday OR open_tuesday OR open_wednesday OR open_thursday OR open_friday OR open_saturday OR open_sunday),
  CHECK (
    (service_mode = 'BOOKING'
      AND slot_duration_minutes > 0
      AND capacity_per_slot > 0
      AND package_duration_count IS NULL
      AND package_duration_unit IS NULL
      AND slot_duration_minutes <= floor(extract(epoch FROM (closes_at - opens_at)) / 60))
    OR
    (service_mode = 'SUBSCRIPTION'
      AND slot_duration_minutes IS NULL
      AND capacity_per_slot IS NULL
      AND package_duration_count > 0
      AND package_duration_unit IN ('MONTH', 'YEAR'))
  )
);
CREATE INDEX property_flexible_service_configurations_owner_property_mode
  ON property_flexible_service_configurations(owner_id, property_id, service_mode);
COMMENT ON TABLE property_flexible_service_configurations IS
  'V1.9 current Admin configuration for Flexible Service booking slots or time-bounded subscription packages.';
COMMENT ON COLUMN property_flexible_service_configurations.opens_at IS
  'Local property opening time (Asia/Ho_Chi_Minh for current product); shared by selected weekdays.';
COMMENT ON COLUMN property_flexible_service_configurations.capacity_per_slot IS
  'Maximum concurrent attendees for one BOOKING slot; does not limit SUBSCRIPTION package attendance.';

CREATE TABLE property_price_versions (
  property_price_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_pricing_item_id bigint NOT NULL, owner_id bigint NOT NULL, property_id bigint NOT NULL,
  kind varchar(24) NOT NULL CHECK(kind IN ('FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING')),
  version_no integer NOT NULL CHECK(version_no>0), effective_from date NOT NULL,
  unit_price bigint NOT NULL CHECK(unit_price>=0), source_name varchar(200), source_reference text,
  published_at timestamptz, published_by_account_id bigint NOT NULL,
  reason text, supersedes_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(), created_by_account_id bigint NOT NULL,
  UNIQUE(property_pricing_item_id,version_no), UNIQUE(property_pricing_item_id,effective_from,version_no),
  UNIQUE(property_price_version_id,owner_id,property_id,kind),
  FOREIGN KEY(property_pricing_item_id,owner_id,property_id,kind)
    REFERENCES property_pricing_items(property_pricing_item_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  FOREIGN KEY(published_by_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(supersedes_version_id,owner_id,property_id,kind)
    REFERENCES property_price_versions(property_price_version_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  CHECK(published_at IS NOT NULL)
);
CREATE INDEX property_price_versions_asof ON property_price_versions(property_pricing_item_id,effective_from DESC,version_no DESC);

CREATE TABLE parking_entitlements (
  parking_entitlement_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL, property_id bigint NOT NULL,
  entitlement_type varchar(32) NOT NULL CHECK(entitlement_type IN ('PAID_SLOT','FREE_SLOT','MOTORCYCLE_VEHICLE_CARD','APARTMENT_VEHICLE_CARD','LEGACY_UNCLASSIFIED')),
  billability varchar(16) NOT NULL CHECK(billability IN ('PAID','FREE','UNCLASSIFIED')),
  property_pricing_item_id bigint, pricing_kind varchar(24), code varchar(60) NOT NULL, name varchar(150) NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,code), UNIQUE(parking_entitlement_id,owner_id,property_id),
  UNIQUE(parking_entitlement_id,owner_id,property_id,billability),
  FOREIGN KEY(property_id,owner_id) REFERENCES properties(property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(property_pricing_item_id,owner_id,property_id,pricing_kind)
    REFERENCES property_pricing_items(property_pricing_item_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  CHECK((billability='PAID' AND pricing_kind='PARKING' AND property_pricing_item_id IS NOT NULL)
     OR (billability IN ('FREE','UNCLASSIFIED') AND property_pricing_item_id IS NULL AND pricing_kind IS NULL)),
  CHECK((entitlement_type='PAID_SLOT' AND billability='PAID')
     OR (entitlement_type='FREE_SLOT' AND billability='FREE')
     OR (entitlement_type IN ('MOTORCYCLE_VEHICLE_CARD','APARTMENT_VEHICLE_CARD') AND billability IN ('PAID','FREE'))
     OR (entitlement_type='LEGACY_UNCLASSIFIED' AND billability='UNCLASSIFIED'))
);
ALTER TABLE parking_slot_assignments ADD COLUMN entitlement_id bigint;
ALTER TABLE parking_slot_assignments ADD CONSTRAINT parking_assignments_entitlement_fk
  FOREIGN KEY(entitlement_id,owner_id,property_id)
  REFERENCES parking_entitlements(parking_entitlement_id,owner_id,property_id) ON DELETE RESTRICT;

CREATE TABLE flexible_service_charges (
  flexible_service_charge_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL, property_id bigint NOT NULL, room_id bigint NOT NULL, contract_id bigint NOT NULL,
  resident_id bigint, property_pricing_item_id bigint NOT NULL, kind varchar(24) NOT NULL DEFAULT 'FLEXIBLE_SERVICE' CHECK(kind='FLEXIBLE_SERVICE'),
  property_price_version_id bigint NOT NULL, occurred_at timestamptz NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK(quantity>0), unit varchar(30) NOT NULL,
  unit_price_snapshot bigint NOT NULL CHECK(unit_price_snapshot>=0), amount bigint NOT NULL CHECK(amount>=0),
  source_system varchar(80) NOT NULL, source_event_key varchar(200) NOT NULL, payload_fingerprint bytea NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','INVOICED','VOID')),
  invoice_id bigint, actor_account_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,source_system,source_event_key), UNIQUE(flexible_service_charge_id,owner_id,property_id),
  FOREIGN KEY(property_pricing_item_id,owner_id,property_id,kind) REFERENCES property_pricing_items(property_pricing_item_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  FOREIGN KEY(property_price_version_id,owner_id,property_id,kind) REFERENCES property_price_versions(property_price_version_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  FOREIGN KEY(room_id,property_id,owner_id) REFERENCES rooms(room_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(contract_id,room_id,property_id,owner_id) REFERENCES contracts(contract_id,room_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(resident_id,owner_id) REFERENCES residents(resident_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(actor_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(invoice_id,contract_id,property_id,owner_id) REFERENCES invoices(invoice_id,contract_id,property_id,owner_id) ON DELETE RESTRICT,
  CHECK(octet_length(payload_fingerprint)=32)
);

CREATE TABLE meter_readings (
  meter_reading_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL, property_id bigint NOT NULL, room_id bigint NOT NULL, contract_id bigint NOT NULL,
  utility_type varchar(16) NOT NULL CHECK(utility_type IN ('ELECTRICITY','WATER')),
  value numeric(12,3) NOT NULL CHECK(value>=0), reading_at timestamptz NOT NULL,
  source varchar(16) NOT NULL DEFAULT 'MANUAL' CHECK(source='MANUAL'), actor_account_id bigint NOT NULL,
  note text, supersedes_reading_id bigint, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type),
  FOREIGN KEY(room_id,property_id,owner_id) REFERENCES rooms(room_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(contract_id,room_id,property_id,owner_id) REFERENCES contracts(contract_id,room_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(actor_account_id,owner_id) REFERENCES accounts(account_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(supersedes_reading_id,owner_id,property_id,room_id,contract_id,utility_type)
    REFERENCES meter_readings(meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type) ON DELETE RESTRICT
);
CREATE INDEX meter_readings_contract_utility_time ON meter_readings(owner_id,contract_id,utility_type,reading_at DESC);

ALTER TABLE invoices ADD COLUMN snapshot_kind varchar(24) NOT NULL DEFAULT 'NOT_FINALIZED'
  CHECK(snapshot_kind IN ('NOT_FINALIZED','LEGACY_AGGREGATE','ITEMIZED'));
UPDATE invoices SET snapshot_kind=CASE WHEN status='draft' THEN 'NOT_FINALIZED' ELSE 'LEGACY_AGGREGATE' END;
ALTER TABLE invoices ADD CONSTRAINT invoices_snapshot_kind_lifecycle CHECK(
  (status='draft' AND snapshot_kind='NOT_FINALIZED') OR
  (status='unpaid' AND snapshot_kind IN ('LEGACY_AGGREGATE','ITEMIZED')) OR
  (status='paid' AND snapshot_kind IN ('LEGACY_AGGREGATE','ITEMIZED'))
);

CREATE TABLE invoice_meter_reading_snapshots (
  invoice_meter_reading_snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL, owner_id bigint NOT NULL, property_id bigint NOT NULL, room_id bigint NOT NULL, contract_id bigint NOT NULL,
  utility_type varchar(16) NOT NULL CHECK(utility_type IN ('ELECTRICITY','WATER')),
  snapshot_role varchar(8) NOT NULL CHECK(snapshot_role IN ('OPENING','ENDING')),
  value numeric(12,3) NOT NULL CHECK(value>=0), reading_at timestamptz,
  source_kind varchar(32) NOT NULL CHECK(source_kind IN ('MANUAL_READING','FINALIZED_INVOICE','CONTRACT_INITIAL','PREDECESSOR_CONTRACT_CLOSE')),
  source_meter_reading_id bigint, source_invoice_id bigint, source_contract_id bigint, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id,utility_type,snapshot_role),
  FOREIGN KEY(invoice_id,contract_id,property_id,owner_id) REFERENCES invoices(invoice_id,contract_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(room_id,property_id,owner_id) REFERENCES rooms(room_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type)
    REFERENCES meter_readings(meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type) ON DELETE RESTRICT,
  FOREIGN KEY(source_invoice_id,contract_id,property_id,owner_id) REFERENCES invoices(invoice_id,contract_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_contract_id,room_id,property_id,owner_id) REFERENCES contracts(contract_id,room_id,property_id,owner_id) ON DELETE RESTRICT,
  CHECK((source_kind='MANUAL_READING' AND source_meter_reading_id IS NOT NULL AND source_invoice_id IS NULL AND source_contract_id IS NULL)
     OR (source_kind='FINALIZED_INVOICE' AND source_invoice_id IS NOT NULL AND source_meter_reading_id IS NULL AND source_contract_id IS NULL)
     OR (source_kind IN ('CONTRACT_INITIAL','PREDECESSOR_CONTRACT_CLOSE') AND source_contract_id IS NOT NULL AND source_meter_reading_id IS NULL AND source_invoice_id IS NULL))
);

ALTER TABLE parking_slot_assignments ADD CONSTRAINT parking_assignments_id_owner_property_unique
  UNIQUE(assignment_id,owner_id,property_id);

CREATE TABLE invoice_items (
  invoice_item_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL, owner_id bigint NOT NULL, property_id bigint NOT NULL, contract_id bigint NOT NULL,
  item_key varchar(100) NOT NULL, category varchar(24) NOT NULL CHECK(category IN ('RENT','ELECTRICITY','WATER','FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING')),
  source_type varchar(32) NOT NULL, source_reference text,
  utility_tariff_version_id bigint, utility_type varchar(16), property_price_version_id bigint, pricing_kind varchar(24),
  flexible_service_charge_id bigint, parking_assignment_id bigint, parking_entitlement_id bigint,
  label_snapshot varchar(200) NOT NULL, description_snapshot text, quantity numeric(12,3) NOT NULL CHECK(quantity>=0), unit varchar(30) NOT NULL,
  unit_price_snapshot bigint CHECK(unit_price_snapshot IS NULL OR unit_price_snapshot>=0), amount bigint NOT NULL CHECK(amount>=0),
  calculation_rule_version varchar(40) NOT NULL, applicable_period_start date, applicable_period_end date, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id,item_key), UNIQUE(invoice_item_id,invoice_id,category),
  UNIQUE(invoice_item_id,utility_tariff_version_id),
  UNIQUE(flexible_service_charge_id),
  FOREIGN KEY(invoice_id,contract_id,property_id,owner_id) REFERENCES invoices(invoice_id,contract_id,property_id,owner_id) ON DELETE RESTRICT,
  FOREIGN KEY(utility_tariff_version_id,owner_id,property_id,utility_type) REFERENCES utility_tariff_versions(utility_tariff_version_id,owner_id,property_id,utility_type) ON DELETE RESTRICT,
  FOREIGN KEY(property_price_version_id,owner_id,property_id,pricing_kind) REFERENCES property_price_versions(property_price_version_id,owner_id,property_id,kind) ON DELETE RESTRICT,
  FOREIGN KEY(flexible_service_charge_id,owner_id,property_id) REFERENCES flexible_service_charges(flexible_service_charge_id,owner_id,property_id) ON DELETE RESTRICT,
  FOREIGN KEY(parking_assignment_id,owner_id,property_id) REFERENCES parking_slot_assignments(assignment_id,owner_id,property_id) ON DELETE RESTRICT,
  FOREIGN KEY(parking_entitlement_id,owner_id,property_id) REFERENCES parking_entitlements(parking_entitlement_id,owner_id,property_id) ON DELETE RESTRICT,
  CHECK(applicable_period_end IS NULL OR applicable_period_start IS NULL OR applicable_period_end>=applicable_period_start),
  CHECK((category='ELECTRICITY' AND utility_type='ELECTRICITY' AND utility_tariff_version_id IS NOT NULL)
     OR (category='WATER' AND utility_type='WATER' AND utility_tariff_version_id IS NOT NULL)
     OR (category NOT IN ('ELECTRICITY','WATER') AND utility_type IS NULL AND utility_tariff_version_id IS NULL)),
  CHECK((category IN ('FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING') AND property_price_version_id IS NOT NULL AND pricing_kind=category)
     OR (category NOT IN ('FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING') AND property_price_version_id IS NULL AND pricing_kind IS NULL)),
  CHECK((category='FLEXIBLE_SERVICE' AND flexible_service_charge_id IS NOT NULL) OR (category<>'FLEXIBLE_SERVICE' AND flexible_service_charge_id IS NULL)),
  CHECK(category<>'ELECTRICITY' OR unit_price_snapshot IS NULL)
);
CREATE INDEX invoice_items_invoice_category ON invoice_items(invoice_id,category);
CREATE UNIQUE INDEX invoice_items_invoice_parking_assignment_unique
  ON invoice_items(invoice_id,parking_assignment_id)
  WHERE parking_assignment_id IS NOT NULL;
CREATE FUNCTION validate_invoice_item_source_shape() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_billability varchar(16); v_entitlement_item bigint; v_assignment_entitlement bigint; v_version_item bigint;
BEGIN
 IF NEW.category='PARKING' THEN
   IF NEW.parking_entitlement_id IS NULL THEN RAISE EXCEPTION 'Parking invoice item requires explicit entitlement' USING ERRCODE='23514'; END IF;
   SELECT billability,property_pricing_item_id INTO v_billability,v_entitlement_item
     FROM parking_entitlements WHERE parking_entitlement_id=NEW.parking_entitlement_id AND owner_id=NEW.owner_id AND property_id=NEW.property_id;
   IF v_billability IS DISTINCT FROM 'PAID' THEN RAISE EXCEPTION 'Only explicitly paid Parking entitlement is billable' USING ERRCODE='23514'; END IF;
   SELECT property_pricing_item_id INTO v_version_item FROM property_price_versions
     WHERE property_price_version_id=NEW.property_price_version_id AND owner_id=NEW.owner_id AND property_id=NEW.property_id AND kind='PARKING';
   IF v_version_item IS DISTINCT FROM v_entitlement_item THEN RAISE EXCEPTION 'Parking price version must match paid entitlement price item' USING ERRCODE='23514'; END IF;
   IF NEW.parking_assignment_id IS NOT NULL THEN
     SELECT entitlement_id INTO v_assignment_entitlement FROM parking_slot_assignments
       WHERE assignment_id=NEW.parking_assignment_id AND owner_id=NEW.owner_id AND property_id=NEW.property_id;
     IF v_assignment_entitlement IS DISTINCT FROM NEW.parking_entitlement_id THEN RAISE EXCEPTION 'Parking assignment entitlement must match invoice source' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 IF NEW.category='FLEXIBLE_SERVICE' AND NOT EXISTS(
   SELECT 1 FROM flexible_service_charges c WHERE c.flexible_service_charge_id=NEW.flexible_service_charge_id
    AND c.owner_id=NEW.owner_id AND c.property_id=NEW.property_id AND c.property_price_version_id=NEW.property_price_version_id
    AND c.invoice_id=NEW.invoice_id AND c.status='INVOICED' AND c.amount=NEW.amount AND c.quantity=NEW.quantity
 ) THEN RAISE EXCEPTION 'Flexible item must reconcile to its server-priced invoiced charge' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_item_source_shape BEFORE INSERT OR UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION validate_invoice_item_source_shape();

CREATE TABLE invoice_item_electricity_tiers (
  invoice_item_electricity_tier_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_item_id bigint NOT NULL, utility_tariff_version_id bigint NOT NULL,
  electricity_tariff_tier_id bigint, tier_no integer NOT NULL CHECK(tier_no>0),
  lower_kwh numeric(12,3) NOT NULL CHECK(lower_kwh>=0), upper_kwh numeric(12,3) CHECK(upper_kwh IS NULL OR upper_kwh>lower_kwh),
  quantity numeric(12,3) NOT NULL CHECK(quantity>=0), unit_price_snapshot bigint NOT NULL CHECK(unit_price_snapshot>=0),
  amount bigint NOT NULL CHECK(amount>=0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_item_id,tier_no),
  FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(invoice_item_id) ON DELETE RESTRICT,
  FOREIGN KEY(invoice_item_id,utility_tariff_version_id)
    REFERENCES invoice_items(invoice_item_id,utility_tariff_version_id) ON DELETE RESTRICT,
  FOREIGN KEY(electricity_tariff_tier_id,utility_tariff_version_id)
    REFERENCES electricity_tariff_tiers(electricity_tariff_tier_id,utility_tariff_version_id) ON DELETE RESTRICT
);
CREATE FUNCTION validate_electricity_tier_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM invoice_items WHERE invoice_item_id=NEW.invoice_item_id AND category='ELECTRICITY'
               AND utility_tariff_version_id=NEW.utility_tariff_version_id) THEN
   RAISE EXCEPTION 'Tier snapshots require a matching ELECTRICITY parent item and tariff version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_electricity_tier_parent_guard BEFORE INSERT OR UPDATE ON invoice_item_electricity_tiers FOR EACH ROW EXECUTE FUNCTION validate_electricity_tier_parent();

-- Append-only protection of published rates and amenity price history.
CREATE FUNCTION reject_published_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'utility_tariff_versions' THEN
      IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published utility tariff version is immutable' USING ERRCODE='55000'; END IF;
    WHEN 'property_price_versions' THEN
      IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published property price version is immutable' USING ERRCODE='55000'; END IF;
    WHEN 'electricity_tariff_tiers' THEN
      IF EXISTS (SELECT 1 FROM utility_tariff_versions v WHERE v.utility_tariff_version_id=OLD.utility_tariff_version_id AND v.published_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Published electricity tiers are immutable' USING ERRCODE='55000';
      END IF;
    WHEN 'amenity_price_history' THEN RAISE EXCEPTION 'Amenity price history is append-only' USING ERRCODE='55000';
  END CASE;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER utility_tariff_versions_immutable BEFORE UPDATE OR DELETE ON utility_tariff_versions FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER electricity_tiers_immutable BEFORE UPDATE OR DELETE ON electricity_tariff_tiers FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER property_price_versions_immutable BEFORE UPDATE OR DELETE ON property_price_versions FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER amenity_price_history_immutable BEFORE UPDATE OR DELETE ON amenity_price_history FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();

CREATE FUNCTION reject_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='55000';
END $$;

-- Published electricity tier set must start at zero, be contiguous, and have one open final tier.
CREATE FUNCTION validate_electricity_tier_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad boolean;
BEGIN
 IF NEW.published_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.published_at IS NULL) AND NEW.utility_type='ELECTRICITY' THEN
   SELECT count(*)=0 OR min(tier_no)<>1 OR count(*) FILTER(WHERE upper_kwh IS NULL)<>1
     OR min(lower_kwh)<>0 OR EXISTS(SELECT 1 FROM (
       SELECT tier_no, upper_kwh, lead(lower_kwh) OVER(ORDER BY tier_no) next_lower,
              lead(tier_no) OVER(ORDER BY tier_no) next_no
       FROM electricity_tariff_tiers WHERE utility_tariff_version_id=NEW.utility_tariff_version_id
     ) q WHERE next_no IS NOT NULL AND (next_no<>tier_no+1 OR upper_kwh IS NULL OR upper_kwh<>next_lower))
   INTO bad FROM electricity_tariff_tiers WHERE utility_tariff_version_id=NEW.utility_tariff_version_id;
   IF bad THEN RAISE EXCEPTION 'Electricity tariff tiers must start at zero, be contiguous, and have one open final tier' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER utility_tariff_publish_tiers BEFORE INSERT OR UPDATE OF published_at ON utility_tariff_versions FOR EACH ROW EXECUTE FUNCTION validate_electricity_tier_publication();
CREATE FUNCTION protect_published_electricity_tier_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM utility_tariff_versions WHERE utility_tariff_version_id=NEW.utility_tariff_version_id AND published_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Cannot add tiers to a published electricity tariff version' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER electricity_tiers_published_insert_guard BEFORE INSERT ON electricity_tariff_tiers FOR EACH ROW EXECUTE FUNCTION protect_published_electricity_tier_insert();

-- Financial rows become immutable when parent Invoice finalizes; unpaid -> paid remains allowed.
CREATE FUNCTION reject_finalized_invoice_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE iid bigint;
BEGIN
 IF TG_TABLE_NAME='invoice_item_electricity_tiers' THEN
   IF TG_OP='DELETE' THEN
     SELECT i.invoice_id INTO iid FROM invoice_items i WHERE i.invoice_item_id=OLD.invoice_item_id;
   ELSE
     SELECT i.invoice_id INTO iid FROM invoice_items i WHERE i.invoice_item_id=NEW.invoice_item_id;
   END IF;
 ELSE
   IF TG_OP='DELETE' THEN iid := OLD.invoice_id; ELSE iid := NEW.invoice_id; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM invoices WHERE invoice_id=iid AND snapshot_kind<>'NOT_FINALIZED') THEN
   RAISE EXCEPTION 'Finalized invoice financial children are immutable' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invoice_items_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION reject_finalized_invoice_child_mutation();
CREATE TRIGGER invoice_tiers_finalized_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_item_electricity_tiers FOR EACH ROW EXECUTE FUNCTION reject_finalized_invoice_child_mutation();
CREATE FUNCTION guard_meter_snapshot_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM invoices WHERE invoice_id=NEW.invoice_id AND snapshot_kind<>'NOT_FINALIZED') THEN
   RAISE EXCEPTION 'Finalized invoice reading snapshots are immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_meter_snapshot_finalized_guard BEFORE INSERT ON invoice_meter_reading_snapshots FOR EACH ROW EXECUTE FUNCTION guard_meter_snapshot_insert();
CREATE FUNCTION guard_invoice_financial_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.snapshot_kind<>'NOT_FINALIZED' AND
   (NEW.snapshot_kind IS DISTINCT FROM OLD.snapshot_kind OR NEW.rent_amount IS DISTINCT FROM OLD.rent_amount OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at OR NEW.revision IS DISTINCT FROM OLD.revision OR
    NEW.electricity_previous_kwh IS DISTINCT FROM OLD.electricity_previous_kwh OR NEW.electricity_current_kwh IS DISTINCT FROM OLD.electricity_current_kwh OR
    NEW.electricity_amount IS DISTINCT FROM OLD.electricity_amount OR NEW.water_previous_m3 IS DISTINCT FROM OLD.water_previous_m3 OR
    NEW.water_current_m3 IS DISTINCT FROM OLD.water_current_m3 OR NEW.water_amount IS DISTINCT FROM OLD.water_amount OR
    NEW.service_amount IS DISTINCT FROM OLD.service_amount OR NEW.total_amount IS DISTINCT FROM OLD.total_amount) THEN
   RAISE EXCEPTION 'Finalized invoice financial history is immutable' USING ERRCODE='55000';
 END IF;
 IF OLD.snapshot_kind<>'NOT_FINALIZED' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='unpaid' AND NEW.status='paid') THEN
   RAISE EXCEPTION 'Finalized invoice status only permits unpaid to paid' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoices_financial_guard BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_financial_history();
CREATE FUNCTION guard_finalized_invoice_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.snapshot_kind<>'NOT_FINALIZED' THEN RAISE EXCEPTION 'Finalized invoice is immutable and cannot be deleted' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER invoices_finalized_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_finalized_invoice_delete();
CREATE FUNCTION reconcile_itemized_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE iid bigint; v_total bigint; v_rent bigint; v_electric bigint; v_water bigint; v_service bigint;
        v_parent bigint; v_parent_qty numeric; v_parent_amount bigint;
BEGIN
 IF TG_TABLE_NAME='invoices' THEN iid:=NEW.invoice_id;
 ELSIF TG_TABLE_NAME='invoice_item_electricity_tiers' THEN
   SELECT invoice_id,invoice_item_id INTO iid,v_parent FROM invoice_items WHERE invoice_item_id=COALESCE(NEW.invoice_item_id,OLD.invoice_item_id);
 ELSE iid:=COALESCE(NEW.invoice_id,OLD.invoice_id); END IF;
 IF EXISTS(SELECT 1 FROM invoices WHERE invoice_id=iid AND snapshot_kind='ITEMIZED') THEN
   SELECT COALESCE(sum(amount),0),COALESCE(sum(amount) FILTER(WHERE category='RENT'),0),
     COALESCE(sum(amount) FILTER(WHERE category='ELECTRICITY'),0),COALESCE(sum(amount) FILTER(WHERE category='WATER'),0),
     COALESCE(sum(amount) FILTER(WHERE category IN ('FIXED_SERVICE','FLEXIBLE_SERVICE','PARKING')),0)
     INTO v_total,v_rent,v_electric,v_water,v_service FROM invoice_items WHERE invoice_id=iid;
   IF NOT EXISTS (SELECT 1 FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='ELECTRICITY' AND snapshot_role='OPENING')
      OR NOT EXISTS (SELECT 1 FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='ELECTRICITY' AND snapshot_role='ENDING')
      OR NOT EXISTS (SELECT 1 FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='WATER' AND snapshot_role='OPENING')
      OR NOT EXISTS (SELECT 1 FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='WATER' AND snapshot_role='ENDING') THEN
     RAISE EXCEPTION 'ITEMIZED invoice requires OPENING and ENDING meter snapshots for both utilities' USING ERRCODE='23514';
   END IF;
   IF (SELECT electricity_previous_kwh FROM invoices WHERE invoice_id=iid) IS DISTINCT FROM
        (SELECT value FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='ELECTRICITY' AND snapshot_role='OPENING') OR
      (SELECT electricity_current_kwh FROM invoices WHERE invoice_id=iid) IS DISTINCT FROM
        (SELECT value FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='ELECTRICITY' AND snapshot_role='ENDING') OR
      (SELECT water_previous_m3 FROM invoices WHERE invoice_id=iid) IS DISTINCT FROM
        (SELECT value FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='WATER' AND snapshot_role='OPENING') OR
      (SELECT water_current_m3 FROM invoices WHERE invoice_id=iid) IS DISTINCT FROM
        (SELECT value FROM invoice_meter_reading_snapshots WHERE invoice_id=iid AND utility_type='WATER' AND snapshot_role='ENDING') THEN
     RAISE EXCEPTION 'Invoice meter compatibility fields must equal frozen opening/ending snapshots' USING ERRCODE='23514';
   END IF;
   IF (SELECT total_amount FROM invoices WHERE invoice_id=iid)<>v_total OR
      (SELECT rent_amount FROM invoices WHERE invoice_id=iid)<>v_rent OR
      (SELECT electricity_amount FROM invoices WHERE invoice_id=iid)<>v_electric OR
      (SELECT water_amount FROM invoices WHERE invoice_id=iid)<>v_water OR
      (SELECT service_amount FROM invoices WHERE invoice_id=iid)<>v_service THEN
     RAISE EXCEPTION 'ITEMIZED Invoice compatibility aggregates must reconcile to category item sums' USING ERRCODE='23514';
   END IF;
   FOR v_parent,v_parent_qty,v_parent_amount IN
     SELECT ii.invoice_item_id,ii.quantity,ii.amount FROM invoice_items ii
     WHERE ii.invoice_id=iid AND ii.category='ELECTRICITY'
   LOOP
     IF NOT EXISTS(SELECT 1 FROM invoice_item_electricity_tiers t WHERE t.invoice_item_id=v_parent)
       OR v_parent_qty<>(SELECT COALESCE(sum(quantity),0) FROM invoice_item_electricity_tiers WHERE invoice_item_id=v_parent)
       OR v_parent_amount<>(SELECT COALESCE(sum(amount),0) FROM invoice_item_electricity_tiers WHERE invoice_item_id=v_parent) THEN
       RAISE EXCEPTION 'Electricity tier snapshots must reconcile with parent item' USING ERRCODE='23514';
     END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM invoice_items ii WHERE ii.invoice_id=iid AND ii.category='ELECTRICITY'
       AND ii.utility_tariff_version_id IS NULL) THEN
     RAISE EXCEPTION 'Electricity item requires tariff version' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_items_reconcile AFTER INSERT OR UPDATE OR DELETE ON invoice_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_itemized_invoice();
CREATE CONSTRAINT TRIGGER invoice_tiers_reconcile AFTER INSERT OR UPDATE OR DELETE ON invoice_item_electricity_tiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_itemized_invoice();
CREATE CONSTRAINT TRIGGER invoice_final_reconcile AFTER UPDATE OF snapshot_kind,total_amount ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_itemized_invoice();
CREATE CONSTRAINT TRIGGER invoice_reading_reconcile AFTER INSERT ON invoice_meter_reading_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_itemized_invoice();
CREATE TRIGGER meter_readings_append_only BEFORE UPDATE OR DELETE ON meter_readings FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
CREATE TRIGGER invoice_meter_snapshots_append_only BEFORE UPDATE OR DELETE ON invoice_meter_reading_snapshots FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

COMMENT ON TABLE invoice_items IS 'V1.7 authoritative rounded financial snapshots for ITEMIZED invoices; legacy aggregate invoices have no synthetic items.';
COMMENT ON COLUMN invoices.snapshot_kind IS 'V1.7: NOT_FINALIZED, LEGACY_AGGREGATE, or ITEMIZED; V1.6 finalized rows are preserved as aggregates.';
COMMENT ON COLUMN parking_slot_assignments.entitlement_id IS 'Nullable only for preserved V1.6 legacy assignments; new assignment flows must explicitly select entitlement.';

CREATE TABLE auth_sessions (
  token_hash          char(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id          bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL,
  last_seen_at        timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  CONSTRAINT auth_sessions_time_order CHECK (
    created_at <= last_seen_at AND last_seen_at <= expires_at
    AND expires_at <= absolute_expires_at
  )
);
CREATE INDEX auth_sessions_by_account ON auth_sessions(account_id);
CREATE INDEX auth_sessions_by_expiry ON auth_sessions(expires_at);

CREATE TABLE resident_service_bookings (
  booking_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL,
  resident_id bigint NOT NULL,
  property_id bigint NOT NULL,
  room_id bigint NOT NULL,
  contract_id bigint NOT NULL,
  property_pricing_item_id bigint NOT NULL,
  kind varchar(24) NOT NULL DEFAULT 'FLEXIBLE_SERVICE' CHECK (kind = 'FLEXIBLE_SERVICE'),
  service_name_snapshot varchar(150) NOT NULL,
  quoted_price_version_id bigint NOT NULL,
  quoted_unit_price bigint NOT NULL CHECK (quoted_unit_price >= 0),
  unit_snapshot varchar(30) NOT NULL,
  service_date date NOT NULL,
  slot_start time NOT NULL,
  slot_end time NOT NULL,
  slot_duration_minutes integer NOT NULL CHECK (slot_duration_minutes > 0),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decision_by_account_id bigint,
  decision_at timestamptz,
  decision_note varchar(1000),
  cancelled_at timestamptz,
  flexible_service_charge_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_service_bookings_charge_scope_key UNIQUE (flexible_service_charge_id, owner_id, property_id),
  CONSTRAINT resident_service_bookings_slot_window_check CHECK (slot_start < slot_end),
  CONSTRAINT resident_service_bookings_decision_state_check CHECK (
    (status = 'PENDING' AND decision_by_account_id IS NULL AND decision_at IS NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NULL)
    OR (status = 'APPROVED' AND decision_by_account_id IS NOT NULL AND decision_at IS NOT NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NOT NULL)
    OR (status = 'REJECTED' AND decision_by_account_id IS NOT NULL AND decision_at IS NOT NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NULL)
    OR (status = 'CANCELLED' AND decision_by_account_id IS NULL AND decision_at IS NULL AND cancelled_at IS NOT NULL AND flexible_service_charge_id IS NULL)
  ),
  CONSTRAINT resident_service_bookings_resident_owner_fkey
    FOREIGN KEY (resident_id, owner_id)
    REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_property_scope_fkey
    FOREIGN KEY (property_id, owner_id)
    REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_room_scope_fkey
    FOREIGN KEY (room_id, property_id, owner_id)
    REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_contract_scope_fkey
    FOREIGN KEY (contract_id, room_id, property_id, owner_id)
    REFERENCES contracts(contract_id, room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_service_scope_fkey
    FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_pricing_items(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_booking_config_fkey
    FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_flexible_service_configurations(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_quoted_price_version_fkey
    FOREIGN KEY (quoted_price_version_id, owner_id, property_id, kind)
    REFERENCES property_price_versions(property_price_version_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_decision_actor_fkey
    FOREIGN KEY (decision_by_account_id, owner_id)
    REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_charge_fkey
    FOREIGN KEY (flexible_service_charge_id, owner_id, property_id)
    REFERENCES flexible_service_charges(flexible_service_charge_id, owner_id, property_id) ON DELETE RESTRICT
);

CREATE INDEX resident_service_bookings_by_resident_date
  ON resident_service_bookings(owner_id, resident_id, service_date, slot_start);
CREATE INDEX resident_service_bookings_by_property_status
  ON resident_service_bookings(owner_id, property_id, status, service_date, slot_start);
CREATE INDEX resident_service_bookings_by_service_slot
  ON resident_service_bookings(owner_id, property_pricing_item_id, service_date, slot_start, slot_end)
  WHERE status IN ('PENDING', 'APPROVED');
CREATE UNIQUE INDEX resident_service_bookings_resident_active_slot_key
  ON resident_service_bookings(property_pricing_item_id, resident_id, service_date, slot_start)
  WHERE status IN ('PENDING', 'APPROVED');

CREATE FUNCTION enforce_resident_service_booking_mode() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE configured_mode varchar(16);
BEGIN
  SELECT service_mode INTO configured_mode
  FROM property_flexible_service_configurations
  WHERE property_pricing_item_id = NEW.property_pricing_item_id
    AND owner_id = NEW.owner_id
    AND property_id = NEW.property_id
    AND kind = NEW.kind
  FOR KEY SHARE;
  IF configured_mode IS DISTINCT FROM 'BOOKING' THEN
    RAISE EXCEPTION 'Resident service bookings require a configured BOOKING service'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resident_service_bookings_booking_mode_guard
  BEFORE INSERT OR UPDATE ON resident_service_bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_resident_service_booking_mode();

COMMENT ON TABLE resident_service_bookings IS
  'V1.11 Resident requests for Admin-configured BOOKING Flexible Services; Admin approval creates a READY charge for the normal Contract invoice, not a payment.';
COMMENT ON COLUMN resident_service_bookings.service_date IS
  'Service calendar date in Asia/Ho_Chi_Minh; slot_start and slot_end are local wall-clock times.';
COMMENT ON COLUMN resident_service_bookings.slot_duration_minutes IS
  'Duration snapshot when the Resident submits the request; later schedule changes do not rewrite it.';
COMMENT ON COLUMN resident_service_bookings.quoted_price_version_id IS
  'Published Flexible Service price effective on the requested service date, captured when the Resident submits the request.';
COMMENT ON COLUMN resident_service_bookings.quoted_unit_price IS
  'VND quote captured when the Resident submits the request; only Admin approval creates the billable charge.';
COMMENT ON COLUMN resident_service_bookings.status IS
  'PENDING and APPROVED bookings count against capacity. Only Admin approval creates a READY Flexible Service charge; Resident cancellation is limited to PENDING.';


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
