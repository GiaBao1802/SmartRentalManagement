-- Góc Trọ Database V1.6 — PostgreSQL clean-install schema.
-- V1.4 baseline plus exactly one approved additive Contract idempotency table.
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
    provider                varchar(16) NOT NULL CHECK (provider IN ('momo','zalopay')),
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


COMMIT;

