BEGIN;
SET LOCAL search_path = public, pg_catalog;

ALTER TABLE accounts
    DROP CONSTRAINT accounts_role_check,
    DROP CONSTRAINT accounts_check,
    ADD CONSTRAINT accounts_role_check CHECK (role IN ('admin','resident','superadmin')),
    ADD CONSTRAINT accounts_check CHECK (
        (role = 'admin' AND owner_id IS NOT NULL AND resident_id IS NULL)
        OR (role = 'resident' AND owner_id IS NULL AND resident_id IS NOT NULL)
        OR (role = 'superadmin' AND owner_id IS NULL AND resident_id IS NULL)
    ),
    ADD COLUMN cloudy_feedback_opt_in_at timestamptz;

COMMENT ON COLUMN accounts.cloudy_feedback_opt_in_at IS
    'Resident opt-in timestamp for sharing sanitized single-turn Cloudy help messages; NULL means disabled.';

CREATE TABLE cloudy_unresolved_feedback (
    feedback_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_digest varchar(64) NOT NULL UNIQUE
        CHECK (message_digest ~ '^[0-9a-f]{64}$'),
    sanitized_message varchar(500) NOT NULL
        CHECK (char_length(sanitized_message) BETWEEN 1 AND 500),
    source varchar(32) NOT NULL CHECK (source = 'resident_cloudy_chat'),
    predicted_intent varchar(16) NOT NULL CHECK (predicted_intent = 'help'),
    curated_intent varchar(24)
        CHECK (curated_intent IS NULL OR curated_intent IN ('services','meter','requests','invoice','other','ambiguous')),
    status varchar(24) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','reviewed','no_action','included_in_eval')),
    model_version varchar(64) NOT NULL,
    occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    latest_reviewed_by_account_id bigint REFERENCES accounts(account_id) ON DELETE RESTRICT,
    latest_reviewed_at timestamptz,
    evaluation_set_version varchar(64),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (first_seen_at <= last_seen_at),
    CHECK ((latest_reviewed_by_account_id IS NULL) = (latest_reviewed_at IS NULL)),
    CHECK ((status = 'included_in_eval') = (evaluation_set_version IS NOT NULL))
);

COMMENT ON TABLE cloudy_unresolved_feedback IS
    'Opt-in, sanitized, single-turn Resident Cloudy help messages for human curation; automatically deleted 30 days after first_seen_at.';

CREATE INDEX cloudy_unresolved_feedback_review_queue_idx
    ON cloudy_unresolved_feedback(status, last_seen_at DESC, feedback_id DESC);
CREATE INDEX cloudy_unresolved_feedback_retention_idx
    ON cloudy_unresolved_feedback(first_seen_at);

CREATE TABLE cloudy_unresolved_feedback_reviews (
    review_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feedback_id bigint NOT NULL REFERENCES cloudy_unresolved_feedback(feedback_id) ON DELETE CASCADE,
    reviewer_account_id bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
    action varchar(24) NOT NULL CHECK (action IN ('status_changed','intent_labeled','evaluation_set_changed')),
    previous_status varchar(24) CHECK (previous_status IS NULL OR previous_status IN ('new','reviewed','no_action','included_in_eval')),
    next_status varchar(24) CHECK (next_status IS NULL OR next_status IN ('new','reviewed','no_action','included_in_eval')),
    previous_intent varchar(24) CHECK (previous_intent IS NULL OR previous_intent IN ('services','meter','requests','invoice','other','ambiguous')),
    next_intent varchar(24) CHECK (next_intent IS NULL OR next_intent IN ('services','meter','requests','invoice','other','ambiguous')),
    previous_evaluation_set_version varchar(64),
    next_evaluation_set_version varchar(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (action = 'status_changed' AND previous_status IS NOT NULL AND next_status IS NOT NULL)
        OR (action = 'intent_labeled' AND previous_intent IS DISTINCT FROM next_intent)
        OR (action = 'evaluation_set_changed' AND previous_evaluation_set_version IS DISTINCT FROM next_evaluation_set_version)
    )
);

CREATE INDEX cloudy_unresolved_feedback_reviews_by_feedback_idx
    ON cloudy_unresolved_feedback_reviews(feedback_id, created_at, review_id);

CREATE FUNCTION prevent_cloudy_feedback_review_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE'
       AND current_setting('goctro.cloudy_feedback_retention_cleanup', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Cloudy feedback review history is append-only'
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER cloudy_feedback_reviews_append_only
BEFORE UPDATE OR DELETE ON cloudy_unresolved_feedback_reviews
FOR EACH ROW EXECUTE FUNCTION prevent_cloudy_feedback_review_mutation();

COMMIT;
