-- Góc Trọ Database V1.6 runtime validator (for clean/populated V1.5 -> V1.6 PostgreSQL 18 databases).
-- Schema/business checks and all probe rows run in one transaction and are rolled back.
-- Seed-fixture expectations are separate: seed_validator.sql (run only on a clean schema + seed database).
-- Retains 90 V1.5 checks; replaces migration-only empty-table assertion with a populated-safe structural check; adds 7 V1.6 checks.
-- Seed-fixture expectations are classified separately and retained in seed_validator.sql (18 checks).

BEGIN;
SET LOCAL TIME ZONE 'UTC';

CREATE TEMP TABLE validator_results (
    test_name text PRIMARY KEY,
    passed boolean NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.assert_true(p_name text, p_condition boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_condition IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'VALIDATION FAIL: %', p_name;
    END IF;
    INSERT INTO validator_results(test_name, passed) VALUES (p_name, true);
    RAISE NOTICE 'PASS: %', p_name;
END;
$$;

CREATE FUNCTION pg_temp.assert_rejected(p_name text, p_statement text, p_expected_states text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_state text;
BEGIN
    BEGIN
        EXECUTE p_statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
        IF v_state = ANY (p_expected_states) THEN
            INSERT INTO validator_results(test_name, passed) VALUES (p_name, true);
            RAISE NOTICE 'PASS: % (rejected with SQLSTATE %)', p_name, v_state;
            RETURN;
        END IF;
        RAISE EXCEPTION 'VALIDATION FAIL: %, expected SQLSTATE %, received %',
            p_name, p_expected_states, v_state;
    END;
    RAISE EXCEPTION 'VALIDATION FAIL: % was accepted, expected rejection', p_name;
END;
$$;

-- V1.1 database invariant/probe checks (11 retained; 9 seed expectations are in seed_validator.sql).
SELECT pg_temp.assert_true(
    'V1.5-00 exactly 28 public tables (V1.4 baseline plus Contract idempotency)',
    (SELECT count(*) = 28 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
);
SELECT pg_temp.assert_rejected(
    'V1.1-03 duplicate national_id in one Owner rejected',
    $sql$INSERT INTO residents(owner_id,national_id,full_name) VALUES (1,'079000000001','Validator duplicate')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.1-09 amenity cycle cannot link a cross-owner invoice',
    $sql$INSERT INTO amenity_subscription_cycles(subscription_cycle_id,subscription_id,contract_id,property_id,owner_id,cycle_start,cycle_end,price_snapshot,status,invoice_id) OVERRIDING SYSTEM VALUE
         VALUES (7399,7201,3001,11,1,now()+interval '720 hours',now()+interval '1440 hours',60000,'planned',5002)$sql$,
    ARRAY['23503']
);
INSERT INTO vehicles(vehicle_id,resident_id,owner_id,vehicle_type) OVERRIDING SYSTEM VALUE
VALUES (8390,1003,1,'test'),
       (8391,2002,2,'test');
INSERT INTO parking_slots(parking_slot_id,parking_area_id,property_id,owner_id,slot_code,status) OVERRIDING SYSTEM VALUE
VALUES (8199,8001,11,1,'VALIDATOR-FREE','active'),
       (8198,8001,11,1,'VALIDATOR-CROSS','active');
SELECT pg_temp.assert_rejected(
    'V1.1-10 a physical slot cannot have two active assignments',
    $sql$INSERT INTO parking_slot_assignments(assignment_id,parking_slot_id,property_id,owner_id,vehicle_id,resident_id,room_id,contract_id,started_at,status) OVERRIDING SYSTEM VALUE
         VALUES (8490,8101,11,1,8390,1003,102,3002,CURRENT_DATE,'active')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.1-11 a vehicle cannot have two active slot assignments',
    $sql$INSERT INTO parking_slot_assignments(assignment_id,parking_slot_id,property_id,owner_id,vehicle_id,resident_id,room_id,contract_id,started_at,status) OVERRIDING SYSTEM VALUE
         VALUES (8491,8199,11,1,8301,1001,101,3001,CURRENT_DATE,'active')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.1-12 cross-owner parking assignment rejected',
    $sql$INSERT INTO parking_slot_assignments(assignment_id,parking_slot_id,property_id,owner_id,vehicle_id,resident_id,room_id,contract_id,started_at,status) OVERRIDING SYSTEM VALUE
         VALUES (8492,8198,11,1,8391,2002,101,3001,CURRENT_DATE,'active')$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.1-14 cross-owner invitation rejected',
    $sql$INSERT INTO account_invitations(invitation_id,owner_id,resident_id,created_by_account_id,token_hash,status,expires_at) OVERRIDING SYSTEM VALUE
         VALUES (9001,1,2001,1,repeat('c',64),'pending',now()+interval '1 day')$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.1-15 duplicate invitation token hash rejected',
    $sql$INSERT INTO account_invitations(invitation_id,owner_id,resident_id,created_by_account_id,token_hash,status,expires_at) OVERRIDING SYSTEM VALUE
         VALUES (9002,1,1002,1,repeat('a',64),'pending',now()+interval '1 day')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.1-17 contract self-reference rejected',
    $sql$INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,previous_contract_id,start_date,end_date,status,rent_amount,deposit_amount,resident_capacity) OVERRIDING SYSTEM VALUE
         VALUES (4901,'VALIDATOR-SELF',202,21,2,2002,4901,CURRENT_DATE+100,CURRENT_DATE+200,'draft',100,0,1)$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.1-18 renewal predecessor from a different room rejected',
    $sql$INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,previous_contract_id,start_date,end_date,status,rent_amount,deposit_amount,resident_capacity) OVERRIDING SYSTEM VALUE
         VALUES (4902,'VALIDATOR-WRONG-PREV',202,21,2,2002,4001,CURRENT_DATE+400,CURRENT_DATE+500,'draft',100,0,1)$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.1-20 duplicate contract document version rejected',
    $sql$INSERT INTO contract_documents(contract_id,property_id,owner_id,file_name,storage_key,mime_type,file_size,document_type,version,status,uploaded_by_account_id)
         VALUES (3001,11,1,'validator-duplicate.pdf','validator/duplicate-v2.pdf','application/pdf',1,'contract',2,'generated',1)$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.1-21 cross-owner contract document uploader rejected',
    $sql$INSERT INTO contract_documents(contract_id,property_id,owner_id,file_name,storage_key,mime_type,file_size,document_type,version,status,uploaded_by_account_id)
         VALUES (4001,21,2,'validator-cross-owner.pdf','validator/cross-owner.pdf','application/pdf',1,'attachment',1,'generated',1)$sql$,
    ARRAY['23503']
);

-- V1.2 invoice lifecycle invariant/probe checks (10 retained; 2 seed expectations are in seed_validator.sql).
SELECT pg_temp.assert_rejected(
    'V1.2-02 draft with due_date rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9901,'V12-INVALID-DRAFT-DUE',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',CURRENT_DATE,NULL,1,0,0,0,1,'draft')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-03 draft with finalized_at rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9902,'V12-INVALID-DRAFT-FINAL',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',NULL,now(),1,0,0,0,1,'draft')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-04 unpaid without due_date rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9903,'V12-INVALID-UNPAID-DUE',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',NULL,now(),1,0,0,0,1,'unpaid')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-05 unpaid without finalized_at rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9904,'V12-INVALID-UNPAID-FINAL',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',CURRENT_DATE+5,NULL,1,0,0,0,1,'unpaid')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-06 paid without due_date rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9905,'V12-INVALID-PAID-DUE',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',NULL,now(),1,0,0,0,1,'paid')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-07 paid without finalized_at rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9906,'V12-INVALID-PAID-FINAL',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',CURRENT_DATE+5,NULL,1,0,0,0,1,'paid')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-08 invalid persisted status rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9907,'V12-INVALID-STATUS',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',NULL,NULL,1,0,0,0,1,'overdue')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-09 invoice total mismatch rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status) OVERRIDING SYSTEM VALUE
         VALUES (9908,'V12-INVALID-TOTAL',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,now(),100,0,0,0,99,'unpaid')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.2-10 duplicate contract-period invoice rejected',
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status)
         OVERRIDING SYSTEM VALUE
         VALUES (9909,'V12-DUPLICATE-PERIOD',3001,11,1,DATE '2026-09-15',DATE '2026-10-14',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,now(),3500000,280000,210000,50000,4040000,'unpaid')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.2-11 one successful payment per invoice still enforced',
    $sql$INSERT INTO payment_transactions(invoice_id,payment_session_id,provider,provider_transaction_id,provider_event_id,amount,currency,status,created_at,processed_at)
         VALUES (5002,'90000000-0000-4000-8000-000000000001','momo','VALIDATOR-DUPLICATE-SUCCESS','VALIDATOR-DUPLICATE-EVENT',4395000,'VND','success',now(),now())$sql$,
    ARRAY['23505']
);



-- V1.3 Contract audit/revision checks (25 retained; 7 baseline seed expectations are in seed_validator.sql).
INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,rent_amount,deposit_amount,resident_capacity)
OVERRIDING SYSTEM VALUE VALUES
 (4909,'V13-DRAFT-DEFAULT',202,21,2,2002,CURRENT_DATE+900,CURRENT_DATE+999,'draft',100,0,1);
SELECT pg_temp.assert_true(
    'V1.3-02 draft defaults to revision zero',
    (SELECT revision = 0 FROM contracts WHERE contract_id = 4909)
);
INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity)
OVERRIDING SYSTEM VALUE VALUES
 (4910,'V13-ACTIVE-OK',202,21,2,2002,CURRENT_DATE+1000,CURRENT_DATE+1100,'active',1,100,0,1),
 (4911,'V13-EXPIRED-OK',202,21,2,2002,CURRENT_DATE+1101,CURRENT_DATE+1201,'expired',1,100,0,1),
 (4912,'V13-TERMINATED-OK',202,21,2,2002,CURRENT_DATE+1202,CURRENT_DATE+1302,'terminated',1,100,0,1)
;
SELECT pg_temp.assert_true(
    'V1.3-03 official statuses accept revision one or greater',
    (SELECT count(*) = 3 FROM contracts WHERE contract_id IN (4910,4911,4912) AND revision = 1)
);
SELECT pg_temp.assert_rejected(
    'V1.3-04 draft revision one rejected',
    $sql$INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity) OVERRIDING SYSTEM VALUE VALUES (4913,'V13-DRAFT-REV1',202,21,2,2002,CURRENT_DATE+1303,CURRENT_DATE+1403,'draft',1,100,0,1)$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.3-05 negative draft revision rejected',
    $sql$INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity) OVERRIDING SYSTEM VALUE VALUES (4914,'V13-DRAFT-NEG',202,21,2,2002,CURRENT_DATE+1404,CURRENT_DATE+1504,'draft',-1,100,0,1)$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.3-06 active revision zero rejected',
    $sql$INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity) OVERRIDING SYSTEM VALUE VALUES (4915,'V13-ACTIVE-REV0',202,21,2,2002,CURRENT_DATE+1505,CURRENT_DATE+1605,'active',0,100,0,1)$sql$,
    ARRAY['23514']
);
INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data)
VALUES (3001,1,1,2,'material_update','Gia hạn giá thuê','{"rent_amount":"3500000"}'::jsonb,'{"rent_amount":"3600000"}'::jsonb);
SELECT pg_temp.assert_true(
    'V1.3-07 valid same-owner material history with object snapshots accepted',
    (SELECT jsonb_typeof(before_data)='object' AND jsonb_typeof(after_data)='object'
       AND revision=2 AND change_type='material_update'
     FROM contract_change_history WHERE contract_id=3001 AND revision=2)
);
SELECT pg_temp.assert_rejected(
    'V1.3-08 history revision zero rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,before_data,after_data) VALUES (3001,1,1,0,'activation','{}','{}')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.3-09 duplicate contract revision rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,2,'material_update','another','{}','{}')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.3-10 unsupported event type rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,before_data,after_data) VALUES (3001,1,1,3,'renewal_created','{}','{}')$sql$,
    ARRAY['23514']
);
INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data)
VALUES (3001,1,1,3,'material_update','Điều chỉnh tiền thuê','{"rent_amount":"3500000"}','{"rent_amount":"3700000"}');
SELECT pg_temp.assert_true(
    'V1.3-11 material update with nonblank reason accepted',
    (SELECT count(*)=1 FROM contract_change_history WHERE contract_id=3001 AND revision=3)
);
SELECT pg_temp.assert_rejected(
    'V1.3-12 blank material reason rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,4,'material_update','   ','{}','{}')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.3-13 null material reason rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,4,'material_update',NULL,'{}','{}')$sql$,
    ARRAY['23514']
);
INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data)
VALUES (3002,1,1,2,'activation',NULL,'{"status":"draft"}','{"status":"active","rent_amount":"3300000"}'),
       (3002,1,1,3,'status_transition',NULL,'{"status":"active"}','{"status":"terminated"}');
SELECT pg_temp.assert_true(
    'V1.3-14 activation and status transition accept null reason',
    (SELECT count(*)=2 FROM contract_change_history WHERE contract_id=3002 AND revision IN (2,3) AND change_reason IS NULL)
);
SELECT pg_temp.assert_rejected(
    'V1.3-15 array JSON snapshot rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,5,'material_update','json test','[]','{}')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.3-16 scalar JSON snapshot rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,6,'material_update','json test','7','{}')$sql$,
    ARRAY['23514']
);
INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data)
VALUES (3001,1,1,7,'material_update',repeat('x',1000),'{}','{}');
SELECT pg_temp.assert_true(
    'V1.3-17 exactly 1000-character material reason accepted',
    (SELECT length(change_reason)=1000 FROM contract_change_history WHERE contract_id=3001 AND revision=7)
);
SELECT pg_temp.assert_rejected(
    'V1.3-18 over-limit material reason rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,change_reason,before_data,after_data) VALUES (3001,1,1,8,'material_update',repeat('x',1001),'{}','{}')$sql$,
    ARRAY['22001']
);
SELECT pg_temp.assert_rejected(
    'V1.3-19 cross-owner Contract history reference rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,before_data,after_data) VALUES (3001,2,4,1,'activation','{}','{}')$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.3-20 cross-owner actor Account rejected',
    $sql$INSERT INTO contract_change_history(contract_id,owner_id,changed_by_account_id,revision,change_type,before_data,after_data) VALUES (3001,1,4,6,'activation','{}','{}')$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.3-21 history UPDATE is blocked',
    $sql$UPDATE contract_change_history SET change_reason='tampered' WHERE contract_id=3001 AND revision=2$sql$,
    ARRAY['23001']
);
SELECT pg_temp.assert_rejected(
    'V1.3-22 history DELETE is blocked',
    $sql$DELETE FROM contract_change_history WHERE contract_id=3001 AND revision=2$sql$,
    ARRAY['23001']
);
SELECT pg_temp.assert_true(
    'V1.3-28 activation event can store official baseline object',
    (SELECT jsonb_typeof(after_data)='object' AND after_data ? 'status'
     FROM contract_change_history WHERE contract_id=3002 AND revision=2)
);
SELECT pg_temp.assert_true(
    'V1.3-29 direct Owner history FK exists',
    (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='contract_change_history'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (owner_id) REFERENCES owners(owner_id)%')
);
SELECT pg_temp.assert_true(
    'V1.3-30 exact Contract/Owner key exists for tenant-safe reference',
    (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='contracts'::regclass AND contype='u'
       AND pg_get_constraintdef(oid)='UNIQUE (contract_id, owner_id)')
);
SELECT pg_temp.assert_true(
    'V1.3-31 history Owner-contract-revision index exists',
    (SELECT to_regclass('public.contract_change_history_by_owner_contract_revision') IS NOT NULL)
);

-- V1.4 Room Images schema invariants (8 checks), plus table inventory above.
SELECT pg_temp.assert_true(
    'V1.4-01 room_images has the required columns, types and identity',
    (SELECT count(*) = 6
     FROM (VALUES
        ('room_image_id','bigint'),
        ('room_id','bigint'),
        ('storage_key','character varying'),
        ('is_cover','boolean'),
        ('sort_order','integer'),
        ('created_at','timestamp with time zone')
     ) AS expected(column_name,data_type)
     JOIN information_schema.columns c
       ON c.table_schema='public' AND c.table_name='room_images'
      AND c.column_name=expected.column_name AND c.data_type=expected.data_type
     WHERE c.is_nullable='NO')
     AND (SELECT is_identity='YES' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='room_images' AND column_name='room_image_id')
     AND (SELECT character_maximum_length=512 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='room_images' AND column_name='storage_key')
);
SELECT pg_temp.assert_true(
    'V1.4-02 Room FK uses ON DELETE RESTRICT',
    (SELECT count(*)=1 FROM pg_constraint
     WHERE conrelid='public.room_images'::regclass AND contype='f'
       AND conname='room_images_room_id_fkey'
       AND pg_get_constraintdef(oid) LIKE '%ON DELETE RESTRICT%')
);
SELECT pg_temp.assert_true(
    'V1.4-03 composite room/storage key uniqueness exists',
    (SELECT count(*)=1 FROM pg_constraint
     WHERE conrelid='public.room_images'::regclass AND contype='u'
       AND conname='room_images_room_storage_key_key'
       AND pg_get_constraintdef(oid)='UNIQUE (room_id, storage_key)')
);
SELECT pg_temp.assert_true(
    'V1.4-04 ordered gallery index exists',
    to_regclass('public.room_images_by_room_order') IS NOT NULL
);
SELECT pg_temp.assert_true(
    'V1.4-05 storage reference lookup index exists',
    to_regclass('public.room_images_by_storage_key') IS NOT NULL
);
SELECT pg_temp.assert_true(
    'V1.4-06 partial unique cover index applies only to covers',
    (SELECT indisunique AND indpred IS NOT NULL
            AND pg_get_expr(indpred,indrelid) LIKE '%is_cover%'
     FROM pg_index WHERE indexrelid='public.room_images_one_cover_per_room'::regclass)
);
SELECT pg_temp.assert_true(
    'V1.4-07 advisory parent serialization, immutability and statement max-five guards exist',
    (SELECT count(*)=3 FROM pg_trigger
     WHERE tgrelid='public.room_images'::regclass AND NOT tgisinternal
       AND tgname IN ('room_images_lock_parent_before_insert',
                      'room_images_identity_immutable',
                      'room_images_max_5_after_insert'))
     AND to_regprocedure('public.room_images_lock_parent_before_insert_fn()') IS NOT NULL
     AND to_regprocedure('public.room_images_identity_immutable_fn()') IS NOT NULL
     AND to_regprocedure('public.room_images_enforce_max_five_after_insert_fn()') IS NOT NULL
     AND position('pg_try_advisory_xact_lock' IN pg_get_functiondef(
         'public.room_images_lock_parent_before_insert_fn()'::regprocedure)) > 0
     AND position('updated_at = clock_timestamp()' IN pg_get_functiondef(
         'public.room_images_lock_parent_before_insert_fn()'::regprocedure)) > 0
);
SELECT pg_temp.assert_true(
    'V1.4-08 nonblank-key and positive-sort checks exist',
    (SELECT count(*)=2 FROM pg_constraint
     WHERE conrelid='public.room_images'::regclass AND contype='c'
       AND conname IN ('room_images_storage_key_not_blank','room_images_sort_order_check'))
);
DO $$
DECLARE
    v_empty_rooms bigint[];
    v_room_a bigint;
    v_room_b bigint;
    v_room_capacity bigint;
    v_room_independent bigint;
    v_key text := 'room-images/validator/' || txid_current()::text;
BEGIN
    SELECT r.room_id INTO v_room_capacity
      FROM rooms r
     WHERE NOT EXISTS (SELECT 1 FROM room_images ri WHERE ri.room_id = r.room_id)
       AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.room_id = r.room_id)
       AND NOT EXISTS (SELECT 1 FROM room_residents rr WHERE rr.room_id = r.room_id)
       AND NOT EXISTS (SELECT 1 FROM parking_slot_assignments p WHERE p.room_id = r.room_id)
       AND NOT EXISTS (SELECT 1 FROM complaints c WHERE c.room_id = r.room_id)
       AND NOT EXISTS (SELECT 1 FROM contact_requests c WHERE c.room_id = r.room_id)
     ORDER BY r.room_id LIMIT 1;
    IF v_room_capacity IS NULL THEN
        RAISE EXCEPTION 'VALIDATION FAIL: V1.4 probes require an image-free Room without other dependent rows';
    END IF;

    SELECT array_agg(room_id ORDER BY room_id)
      INTO v_empty_rooms
      FROM (
        SELECT r.room_id FROM rooms r
         WHERE r.room_id <> v_room_capacity
           AND NOT EXISTS (SELECT 1 FROM room_images ri WHERE ri.room_id = r.room_id)
         ORDER BY r.room_id LIMIT 3
      ) candidates;
    IF coalesce(cardinality(v_empty_rooms), 0) < 3 THEN
        RAISE EXCEPTION 'VALIDATION FAIL: V1.4 image probes require four image-free Room rows, including one without dependent rows';
    END IF;
    v_room_a := v_empty_rooms[1];
    v_room_b := v_empty_rooms[2];
    v_room_independent := v_empty_rooms[3];

    INSERT INTO room_images(room_id,storage_key,is_cover,sort_order)
    VALUES (v_room_a,v_key || '/shared.webp',true,1),
           (v_room_b,v_key || '/shared.webp',true,1);
    PERFORM pg_temp.assert_true(
        'V1.4-10 one physical key is allowed across Rooms and cover is per Room',
        (SELECT count(*)=2 AND count(DISTINCT room_id)=2 AND bool_and(is_cover)
           FROM room_images WHERE storage_key=v_key || '/shared.webp')
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-11 duplicate storage key within one Room rejected',
        format('INSERT INTO room_images(room_id,storage_key) VALUES (%s,%L)',v_room_a,v_key || '/shared.webp'),
        ARRAY['23505']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-12 second cover in one Room rejected',
        format('INSERT INTO room_images(room_id,storage_key,is_cover) VALUES (%s,%L,true)',v_room_a,v_key || '/second-cover.webp'),
        ARRAY['23505']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-13 empty storage key rejected',
        format('INSERT INTO room_images(room_id,storage_key) VALUES (%s,%L)',v_room_a,''),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-14 whitespace-only storage key rejected',
        format('INSERT INTO room_images(room_id,storage_key) VALUES (%s,%L)',v_room_a,'   '),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-15 zero sort order rejected',
        format('INSERT INTO room_images(room_id,storage_key,sort_order) VALUES (%s,%L,0)',v_room_a,v_key || '/zero.webp'),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-16 negative sort order rejected',
        format('INSERT INTO room_images(room_id,storage_key,sort_order) VALUES (%s,%L,-1)',v_room_a,v_key || '/negative.webp'),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-17 missing Room rejected by FK',
        format('INSERT INTO room_images(room_id,storage_key) VALUES (-1,%L)',v_key || '/missing.webp'),
        ARRAY['23503']
    );

    INSERT INTO room_images(room_id,storage_key,is_cover,sort_order)
    SELECT v_room_capacity,v_key || '/capacity/' || n || '.webp',false,n FROM generate_series(1,5) AS n;
    PERFORM pg_temp.assert_true(
        'V1.4-18 five associations in one Room accepted without requiring a cover',
        (SELECT count(*)=5 FROM room_images WHERE room_id=v_room_capacity)
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-19 sixth association in one Room rejected',
        format('INSERT INTO room_images(room_id,storage_key,sort_order) VALUES (%s,%L,6)',v_room_capacity,v_key || '/capacity/6.webp'),
        ARRAY['23514']
    );

    INSERT INTO room_images(room_id,storage_key,is_cover,sort_order)
    SELECT v_room_independent,v_key || '/independent/' || n || '.webp',false,n FROM generate_series(1,5) AS n;
    PERFORM pg_temp.assert_true(
        'V1.4-20 separate Room independently accepts five associations',
        (SELECT count(*)=5 FROM room_images WHERE room_id=v_room_independent)
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-21 RoomImage cannot be reparented',
        format('UPDATE room_images SET room_id=%s WHERE room_id=%s AND storage_key=%L',v_room_b,v_room_a,v_key || '/shared.webp'),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-22 RoomImage storage key cannot be changed',
        format('UPDATE room_images SET storage_key=%L WHERE room_id=%s AND storage_key=%L',v_key || '/changed.webp',v_room_a,v_key || '/shared.webp'),
        ARRAY['23514']
    );
    PERFORM pg_temp.assert_rejected(
        'V1.4-23 Room with images cannot be hard-deleted',
        format('DELETE FROM rooms WHERE room_id=%s',v_room_capacity),
        ARRAY['23001']
    );
END
$$;

DO $$
DECLARE
    v_passed integer;
BEGIN
    SELECT count(*) INTO v_passed FROM validator_results WHERE passed;
    IF v_passed <> 69 THEN
        RAISE EXCEPTION 'VALIDATION FAIL: expected 69 runtime checks, got %', v_passed;
    END IF;
    RAISE NOTICE 'DATABASE V1.4 regression set = PASS (%/69; inventory is the V1.5 28-table baseline)', v_passed;
END
$$;

-- V1.5 table structure, tenant constraints and rollback-only behavior probes.
SELECT pg_temp.assert_true(
    'V1.5-01 exact 15 columns, types, nullability and varchar lengths',
    (SELECT count(*)=15 AND bool_and(c.data_type=e.data_type
          AND c.is_nullable=e.is_nullable
          AND c.character_maximum_length IS NOT DISTINCT FROM e.max_length)
     FROM (VALUES
        ('request_id','bigint','NO',NULL::integer),
        ('owner_id','bigint','NO',NULL::integer),
        ('account_id','bigint','NO',NULL::integer),
        ('operation_scope','character varying','NO',200),
        ('idempotency_key_hash','bytea','NO',NULL::integer),
        ('request_fingerprint','bytea','NO',NULL::integer),
        ('fingerprint_version','smallint','NO',NULL::integer),
        ('state','character varying','NO',16),
        ('response_status','smallint','YES',NULL::integer),
        ('response_ciphertext','bytea','YES',NULL::integer),
        ('response_nonce','bytea','YES',NULL::integer),
        ('response_auth_tag','bytea','YES',NULL::integer),
        ('response_key_version','character varying','YES',64),
        ('created_at','timestamp with time zone','NO',NULL::integer),
        ('completed_at','timestamp with time zone','YES',NULL::integer)
     ) AS e(column_name,data_type,is_nullable,max_length)
     JOIN information_schema.columns c ON c.table_schema='public'
       AND c.table_name='contract_idempotency_requests' AND c.column_name=e.column_name)
    AND (SELECT count(*)=15 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='contract_idempotency_requests')
);
SELECT pg_temp.assert_true(
    'V1.5-02 identity-always request_id primary key and approved defaults',
    (SELECT is_identity='YES' AND identity_generation='ALWAYS' AND column_default IS NULL
     FROM information_schema.columns WHERE table_schema='public'
       AND table_name='contract_idempotency_requests' AND column_name='request_id')
    AND (SELECT count(*)=1 FROM pg_constraint
         WHERE conrelid='public.contract_idempotency_requests'::regclass AND contype='p'
           AND pg_get_constraintdef(oid)='PRIMARY KEY (request_id)')
    AND (SELECT count(*)=1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='contract_idempotency_requests'
           AND column_name='fingerprint_version' AND column_default='1')
    AND (SELECT count(*)=1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='contract_idempotency_requests'
           AND column_name='state' AND column_default LIKE '%in_progress%')
    AND (SELECT count(*)=1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='contract_idempotency_requests'
           AND column_name='created_at' AND column_default='now()')
);
SELECT pg_temp.assert_true(
    'V1.5-03 Owner FK is RESTRICT',
    (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='f' AND conname='contract_idempotency_requests_owner_fk'
       AND confdeltype='r' AND pg_get_constraintdef(oid)='FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE RESTRICT')
);
SELECT pg_temp.assert_true(
    'V1.5-04 composite Account/Owner FK is RESTRICT',
    (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='f' AND conname='contract_idempotency_requests_account_owner_fk'
       AND confdeltype='r'
       AND pg_get_constraintdef(oid)='FOREIGN KEY (account_id, owner_id) REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT')
);
SELECT pg_temp.assert_true(
    'V1.5-05 namespace unique constraint has exact approved columns',
    (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='u' AND conname='contract_idempotency_requests_scope_key_key'
       AND pg_get_constraintdef(oid)='UNIQUE (owner_id, account_id, operation_scope, idempotency_key_hash)')
);
SELECT pg_temp.assert_true(
    'V1.5-06 SHA-256 digest lengths and fingerprint version checks exist',
    (SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='c' AND conname IN ('contract_idempotency_requests_key_hash_check',
                                       'contract_idempotency_requests_fingerprint_check'))
    AND (SELECT position('octet_length(idempotency_key_hash)' IN pg_get_constraintdef(oid))>0
         FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
           AND conname='contract_idempotency_requests_key_hash_check')
    AND (SELECT position('fingerprint_version' IN pg_get_constraintdef(oid))>0
         FROM pg_constraint WHERE conrelid='public.contract_idempotency_requests'::regclass
           AND conname='contract_idempotency_requests_fingerprint_check')
);
SELECT pg_temp.assert_true(
    'V1.5-07 allowlisted Contract operation scope check exists',
    (SELECT EXISTS (SELECT 1
     FROM pg_constraint
     WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='c' AND conname='contract_idempotency_requests_scope_check'
       AND position('contracts' IN pg_get_constraintdef(oid))>0))
);
SELECT pg_temp.assert_true(
    'V1.5-08 state check allows only in_progress and completed',
    (SELECT EXISTS (SELECT 1
     FROM pg_constraint
     WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='c' AND conname='contract_idempotency_requests_state_check'
       AND position('in_progress' IN pg_get_constraintdef(oid))>0
       AND position('completed' IN pg_get_constraintdef(oid))>0
    ))
);
SELECT pg_temp.assert_true(
    'V1.5-09 response state consistency check exists',
    (SELECT EXISTS (SELECT 1
     FROM pg_constraint
     WHERE conrelid='public.contract_idempotency_requests'::regclass
       AND contype='c' AND conname='contract_idempotency_requests_response_state_check'
       AND position('response_status' IN pg_get_constraintdef(oid))>0
       AND position('response_nonce' IN pg_get_constraintdef(oid))>0
       AND position('response_auth_tag' IN pg_get_constraintdef(oid))>0
       AND position('completed_at' IN pg_get_constraintdef(oid))>0
    ))
);
SELECT pg_temp.assert_true(
    'V1.5-10 supporting Account/Owner index exists with exact order',
    (SELECT to_regclass('public.contract_idempotency_requests_account_owner_idx') IS NOT NULL
       AND position('(account_id, owner_id)' IN pg_get_indexdef('public.contract_idempotency_requests_account_owner_idx'::regclass))>0)
);
SELECT pg_temp.assert_true(
    'V1.5-11 idempotency table exists (populated-safe; not a migration/seed emptiness assertion)',
    (to_regclass('public.contract_idempotency_requests') IS NOT NULL)
);

INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
VALUES (1,1,'contracts.create',decode(repeat('a5',32),'hex'),decode(repeat('b5',32),'hex'));
SELECT pg_temp.assert_true(
    'V1.5-12 valid in_progress request accepted',
    (SELECT count(*)=1 FROM contract_idempotency_requests
     WHERE owner_id=1 AND account_id=1 AND operation_scope='contracts.create'
       AND idempotency_key_hash=decode(repeat('a5',32),'hex') AND state='in_progress'
       AND response_status IS NULL AND completed_at IS NULL)
);
INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint,
    state,response_status,response_ciphertext,response_nonce,response_auth_tag,response_key_version,completed_at)
VALUES (1,1,'contracts.activate:3001',decode(repeat('c5',32),'hex'),decode(repeat('d5',32),'hex'),
    'completed',201,decode('01','hex'),decode(repeat('e5',12),'hex'),decode(repeat('f5',16),'hex'),'validator-key-v1',now());
SELECT pg_temp.assert_true(
    'V1.5-13 valid completed encrypted response accepted',
    (SELECT count(*)=1 FROM contract_idempotency_requests
     WHERE owner_id=1 AND account_id=1 AND operation_scope='contracts.activate:3001'
       AND state='completed' AND response_status=201 AND octet_length(response_nonce)=12
       AND octet_length(response_auth_tag)=16 AND completed_at>=created_at)
);
SELECT pg_temp.assert_rejected(
    'V1.5-14 invalid key digest length rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
         VALUES (1,1,'contracts.create',decode('aa','hex'),decode(repeat('11',32),'hex'))$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-15 invalid request fingerprint length rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
         VALUES (1,1,'contracts.create',decode(repeat('12',32),'hex'),decode('bb','hex'))$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-16 unsupported operation scope rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
         VALUES (1,1,'contracts.upload:3001',decode(repeat('13',32),'hex'),decode(repeat('14',32),'hex'))$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-17 unsupported request state rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint,state)
         VALUES (1,1,'contracts.create',decode(repeat('15',32),'hex'),decode(repeat('16',32),'hex'),'failed')$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-18 completed row missing response fields rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint,state,response_status)
         VALUES (1,1,'contracts.create',decode(repeat('17',32),'hex'),decode(repeat('18',32),'hex'),'completed',201)$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-19 in_progress row with response fields rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint,response_status)
         VALUES (1,1,'contracts.create',decode(repeat('19',32),'hex'),decode(repeat('20',32),'hex'),201)$sql$,
    ARRAY['23514']
);
SELECT pg_temp.assert_rejected(
    'V1.5-20 Account/Owner mismatch rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
         VALUES (1,4,'contracts.create',decode(repeat('21',32),'hex'),decode(repeat('22',32),'hex'))$sql$,
    ARRAY['23503']
);
SELECT pg_temp.assert_rejected(
    'V1.5-21 duplicate owner/account/operation/key namespace rejected',
    $sql$INSERT INTO contract_idempotency_requests(owner_id,account_id,operation_scope,idempotency_key_hash,request_fingerprint)
         VALUES (1,1,'contracts.create',decode(repeat('a5',32),'hex'),decode(repeat('23',32),'hex'))$sql$,
    ARRAY['23505']
);

-- V1.6 Resident avatar + canonical Account phone checks (all probes roll back).
SELECT pg_temp.assert_true(
    'V1.6-01 avatar key is nullable PostgreSQL text',
    (SELECT count(*)=1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='residents' AND column_name='avatar_storage_key'
       AND data_type='text' AND is_nullable='YES')
);
SELECT pg_temp.assert_true(
    'V1.6-02 avatar key has exact non-null partial unique index',
    (SELECT count(*)=1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid
     WHERE x.relname='residents_avatar_storage_key_key' AND i.indisunique
       AND pg_get_expr(i.indpred,i.indrelid)='(avatar_storage_key IS NOT NULL)')
);
UPDATE residents SET avatar_storage_key=NULL
WHERE resident_id IN (SELECT resident_id FROM residents ORDER BY resident_id LIMIT 2);
SELECT pg_temp.assert_true(
    'V1.6-03 multiple NULL avatar keys are allowed',
    (SELECT count(*)=2 FROM residents
     WHERE resident_id IN (SELECT resident_id FROM residents ORDER BY resident_id LIMIT 2)
       AND avatar_storage_key IS NULL)
);
UPDATE residents SET avatar_storage_key='v16-validator/avatar.webp'
WHERE resident_id=(SELECT resident_id FROM residents ORDER BY resident_id LIMIT 1);
SELECT pg_temp.assert_rejected(
    'V1.6-04 duplicate non-null avatar key rejected',
    $sql$UPDATE residents SET avatar_storage_key='v16-validator/avatar.webp'
         WHERE resident_id=(SELECT resident_id FROM residents ORDER BY resident_id OFFSET 1 LIMIT 1)$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_true(
    'V1.6-05 phone has exact non-null partial unique index',
    (SELECT count(*)=1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid
     WHERE x.relname='accounts_phone_nonnull_key' AND i.indisunique
       AND pg_get_expr(i.indpred,i.indrelid)='(phone IS NOT NULL)')
);
UPDATE accounts SET phone=NULL
WHERE account_id IN (SELECT account_id FROM accounts ORDER BY account_id LIMIT 2);
SELECT pg_temp.assert_true(
    'V1.6-06 multiple NULL Account phones are allowed',
    (SELECT count(*)=2 FROM accounts
     WHERE account_id IN (SELECT account_id FROM accounts ORDER BY account_id LIMIT 2) AND phone IS NULL)
);
UPDATE accounts SET phone='+84900000001'
WHERE account_id=(SELECT account_id FROM accounts ORDER BY account_id LIMIT 1);
SELECT pg_temp.assert_rejected(
    'V1.6-07 duplicate non-null Account phone rejected',
    $sql$UPDATE accounts SET phone='+84900000001'
         WHERE account_id=(SELECT account_id FROM accounts ORDER BY account_id OFFSET 1 LIMIT 1)$sql$,
    ARRAY['23505']
);
DO $$
DECLARE
    v_passed integer;
BEGIN
    SELECT count(*) INTO v_passed FROM validator_results WHERE passed;
    IF v_passed <> 97 THEN
        RAISE EXCEPTION 'VALIDATION FAIL: expected 97 runtime checks, got %', v_passed;
    END IF;
    RAISE NOTICE 'DATABASE V1.6 RUNTIME VALIDATION = PASS (%/97; 90 V1.5 checks with populated-safe V1.5-11 + 7 V1.6 checks)', v_passed;
END
$$;

-- These are application/service behaviors, not database-enforced checks:
-- BACKEND TEST REQUIRED: due_date = finalized local calendar date (Asia/Ho_Chi_Minh) + 5 days.
-- BACKEND TEST REQUIRED: draft/paid/unfinalized invoices cannot start payment; only finalized unpaid can.
-- BACKEND TEST REQUIRED: Zalo only sends finalized unpaid invoices, after finalize commit.
-- BACKEND TEST REQUIRED: reminder on period_end, draft ensure on next calendar day, both scheduler retries idempotent.
-- BACKEND TEST REQUIRED: bill period anchor/clamp/no-drift and final-period amount calculations.

ROLLBACK;
