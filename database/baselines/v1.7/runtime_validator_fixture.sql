-- Góc Trọ V1.7 synthetic-fixture regression suite; not for populated targets.
-- Prerequisite: V1.6 schema + V1.6 seed + V1.7 migration + seed.v1_7.sql,
-- or V1.7 schema.sql + combined V1.7 seed.sql.
-- Retains the historical 171-check suite (97 V1.6 regression + 74 V1.7 checks).
-- It includes fixed baseline/demo IDs and must run only in synthetic rehearsal/clean-install DBs.
-- All validator probe rows and state transitions run in one transaction and are rolled back.

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

-- Historical V1.1 suite: 20 assertions including baseline seed expectations; V1.6 seed required.
SELECT pg_temp.assert_true(
    'V1.5-00 exactly 40 public tables (V1.7 additive Billing baseline)',
    (SELECT count(*) = 40 FROM information_schema.tables
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

-- Historical V1.2 invoice lifecycle suite: 12 assertions including baseline seed expectations.
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
    $sql$INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status,snapshot_kind)
         OVERRIDING SYSTEM VALUE
         VALUES (9909,'V12-DUPLICATE-PERIOD',3001,11,1,DATE '2026-09-15',DATE '2026-10-14',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,now(),3500000,280000,210000,50000,4040000,'unpaid','LEGACY_AGGREGATE')$sql$,
    ARRAY['23505']
);
SELECT pg_temp.assert_rejected(
    'V1.2-11 one successful payment per invoice still enforced',
    $sql$INSERT INTO payment_transactions(invoice_id,payment_session_id,provider,provider_transaction_id,provider_event_id,amount,currency,status,created_at,processed_at)
         VALUES (5002,'90000000-0000-4000-8000-000000000001','momo','VALIDATOR-DUPLICATE-SUCCESS','VALIDATOR-DUPLICATE-EVENT',4395000,'VND','success',now(),now())$sql$,
    ARRAY['23505']
);



-- Historical V1.3 Contract audit/revision suite: 32 assertions including baseline seed expectations.
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
-- V1.7 structural/synthetic fixture checks. These supplement rather than replace V1.6's 97 checks.
SELECT pg_temp.assert_true('V1.7-01 exactly 12 additive tables', (SELECT count(*)=12 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('utility_tariffs','utility_tariff_versions','electricity_tariff_tiers','property_facilities','property_pricing_items','property_price_versions','flexible_service_charges','parking_entitlements','meter_readings','invoice_meter_reading_snapshots','invoice_items','invoice_item_electricity_tiers')));
SELECT pg_temp.assert_true('V1.7-02 table inventory exactly 40', (SELECT count(*)=40 FROM pg_tables WHERE schemaname='public'));
SELECT pg_temp.assert_true('V1.7-03 legacy finalized invoices remain aggregate', (SELECT count(*)=3 FROM invoices WHERE invoice_id IN (5001,5002,5003) AND snapshot_kind='LEGACY_AGGREGATE' AND status IN ('unpaid','paid')));
SELECT pg_temp.assert_true('V1.7-04 no fake items for legacy aggregate invoices', NOT EXISTS(SELECT 1 FROM invoice_items ii JOIN invoices i USING(invoice_id) WHERE i.snapshot_kind='LEGACY_AGGREGATE'));
SELECT pg_temp.assert_true('V1.7-05 seeded itemized invoice aggregates reconcile', (SELECT total_amount=4045000 AND rent_amount=3500000 AND electricity_amount=165000 AND water_amount=105000 AND service_amount=275000 FROM invoices WHERE invoice_id=5010 AND snapshot_kind='ITEMIZED'));
SELECT pg_temp.assert_true('V1.7-06 electricity example preserves 120 kWh in 50/50/20 tiers', (SELECT sum(t.quantity)=120 AND array_agg(t.quantity ORDER BY t.tier_no)=ARRAY[50::numeric,50::numeric,20::numeric] AND sum(t.amount)=165000 FROM invoice_item_electricity_tiers t JOIN invoice_items i USING(invoice_item_id) WHERE i.invoice_id=5010 AND i.category='ELECTRICITY'));
SELECT pg_temp.assert_true('V1.7-07 fixed services seeded for Property 11', (SELECT count(*)=3 FROM property_pricing_items WHERE property_id=11 AND kind='FIXED_SERVICE'));
SELECT pg_temp.assert_true('V1.7-08 property facilities safely map Amenity history', (SELECT count(*)=2 FROM property_facilities WHERE property_id=11 AND legacy_amenity_id IS NOT NULL));
SELECT pg_temp.assert_true('V1.7-09 free and paid parking entitlements distinct', (SELECT count(*)=1 FROM parking_entitlements WHERE entitlement_type='FREE_SLOT' AND billability='FREE' AND property_pricing_item_id IS NULL) AND (SELECT count(*)=1 FROM parking_entitlements WHERE entitlement_type='PAID_SLOT' AND billability='PAID' AND pricing_kind='PARKING'));
SELECT pg_temp.assert_true('V1.7-10 vehicle card entitlements support both billability states', (SELECT count(DISTINCT billability)=2 FROM parking_entitlements WHERE entitlement_type IN ('MOTORCYCLE_VEHICLE_CARD','APARTMENT_VEHICLE_CARD')));
SELECT pg_temp.assert_true('V1.7-11 legacy V1.6 assignments remain unmapped', (SELECT count(*)=3 FROM parking_slot_assignments WHERE assignment_id IN (8401,8402,8403) AND entitlement_id IS NULL));
SELECT pg_temp.assert_true('V1.7-12 future tariff version retained', (SELECT count(*)=1 FROM utility_tariff_versions WHERE utility_tariff_id=10001 AND effective_from=DATE '2026-12-01' AND published_at IS NOT NULL));
SELECT pg_temp.assert_true('V1.7-13 meter value is NUMERIC(12,3)', (SELECT data_type='numeric' AND numeric_scale=3 FROM information_schema.columns WHERE table_schema='public' AND table_name='meter_readings' AND column_name='value'));
SELECT pg_temp.assert_true('V1.7-14 source event idempotency unique key exists', (SELECT count(*)>0 FROM pg_indexes WHERE schemaname='public' AND tablename='flexible_service_charges' AND indexdef ILIKE '%UNIQUE%owner_id, source_system, source_event_key%'));
SELECT pg_temp.assert_true('V1.7-15 open tier uniqueness index exists', (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public' AND indexname='electricity_tiers_one_open_final'));
SELECT pg_temp.assert_true('V1.7-16 Amenity price immutable trigger exists', (SELECT count(*)=1 FROM pg_trigger WHERE tgname='amenity_price_history_immutable' AND NOT tgisinternal));
SELECT pg_temp.assert_true('V1.7-17 no Room price applicability table added', NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%room%pricing%'));

-- V1.7 transactional behavior probes. Fixture rows are within this validator's outer transaction.
INSERT INTO utility_tariffs(utility_tariff_id,owner_id,property_id,utility_type,code,name)
OVERRIDING SYSTEM VALUE VALUES
 (18001,1,11,'ELECTRICITY','V17-VALID-E','Validator Electricity'),
 (18002,1,11,'WATER','V17-VALID-W','Validator Water'),
 (18003,1,11,'ELECTRICITY','V17-OVERLAP','Validator overlap'),
 (18004,1,11,'ELECTRICITY','V17-GAP','Validator gap'),
 (18005,1,11,'ELECTRICITY','V17-NONZERO','Validator nonzero'),
 (18006,1,11,'ELECTRICITY','V17-NO-OPEN','Validator no open'),
 (18007,1,11,'ELECTRICITY','V17-MULTI-OPEN','Validator multiple open');
INSERT INTO utility_tariff_versions(utility_tariff_version_id,utility_tariff_id,owner_id,property_id,utility_type,version_no,effective_from,unit,calculation_mode,flat_unit_price,created_by_account_id)
OVERRIDING SYSTEM VALUE VALUES
 (18101,18001,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1),
 (18102,18002,1,11,'WATER',1,DATE '2027-01-01','m3','FLAT',12000,1),
 (18103,18003,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1),
 (18104,18004,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1),
 (18105,18005,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1),
 (18106,18006,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1),
 (18107,18007,1,11,'ELECTRICITY',1,DATE '2027-01-01','kWh','PROGRESSIVE',NULL,1);
INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES
 (18101,1,0,50,1000),(18101,2,50,NULL,1500),(18103,1,0,60,1000),(18103,2,50,NULL,1500),
 (18104,1,0,50,1000),(18104,2,51,NULL,1500),(18105,1,1,50,1000),(18105,2,50,NULL,1500),
 (18106,1,0,50,1000),(18106,2,50,100,1500),(18107,1,0,NULL,1000);
UPDATE utility_tariff_versions SET published_at=TIMESTAMPTZ '2027-01-01 00:00:00+00',published_by_account_id=1 WHERE utility_tariff_version_id=18101;
UPDATE utility_tariff_versions SET published_at=TIMESTAMPTZ '2027-01-01 00:00:00+00',published_by_account_id=1 WHERE utility_tariff_version_id=18102;
SELECT pg_temp.assert_true('V1.7-18 valid contiguous Electricity tiers publish', (SELECT published_at IS NOT NULL FROM utility_tariff_versions WHERE utility_tariff_version_id=18101));
SELECT pg_temp.assert_true('V1.7-19 valid flat Water rate publishes', (SELECT calculation_mode='FLAT' AND flat_unit_price=12000 AND published_at IS NOT NULL FROM utility_tariff_versions WHERE utility_tariff_version_id=18102));
SELECT pg_temp.assert_rejected('V1.7-20 unsupported utility type rejected', $sql$INSERT INTO utility_tariffs(owner_id,property_id,utility_type,code,name) VALUES(1,11,'GAS','V17-BAD','Invalid')$sql$, ARRAY['23514']);
SELECT pg_temp.assert_true('V1.7-21 future tariff is not selected before effective date', (SELECT utility_tariff_version_id=10101 FROM utility_tariff_versions WHERE utility_tariff_id=10001 AND published_at IS NOT NULL AND effective_from<=DATE '2026-10-15' ORDER BY effective_from DESC,version_no DESC LIMIT 1));
SELECT pg_temp.assert_rejected('V1.7-73 negative flat Water price rejected', $sql$INSERT INTO utility_tariff_versions(utility_tariff_id,owner_id,property_id,utility_type,version_no,effective_from,unit,calculation_mode,flat_unit_price,created_by_account_id) VALUES(18002,1,11,'WATER',2,DATE '2027-02-01','m3','FLAT',-1,1)$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-22 negative tier lower bound rejected', $sql$INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES(18103,90,-1,1,1000)$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-23 tier upper bound not greater than lower rejected', $sql$INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES(18103,90,5,5,1000)$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-24 duplicate tier number rejected', $sql$INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES(18103,1,200,250,1000)$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-25 duplicate tier lower bound rejected', $sql$INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES(18103,90,0,1,1000)$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-26 overlapping ranges cannot publish', $sql$UPDATE utility_tariff_versions SET published_at=now(),published_by_account_id=1 WHERE utility_tariff_version_id=18103$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-27 tier gap cannot publish', $sql$UPDATE utility_tariff_versions SET published_at=now(),published_by_account_id=1 WHERE utility_tariff_version_id=18104$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-28 first tier must start at zero', $sql$UPDATE utility_tariff_versions SET published_at=now(),published_by_account_id=1 WHERE utility_tariff_version_id=18105$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-29 published tariff requires open-ended final tier', $sql$UPDATE utility_tariff_versions SET published_at=now(),published_by_account_id=1 WHERE utility_tariff_version_id=18106$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-30 only one open-ended tier allowed', $sql$INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES(18107,2,50,NULL,1500)$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-31 published utility version UPDATE rejected', $sql$UPDATE utility_tariff_versions SET source_name='mutated' WHERE utility_tariff_version_id=10101$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-32 published utility version DELETE rejected', $sql$DELETE FROM utility_tariff_versions WHERE utility_tariff_version_id=18102$sql$, ARRAY['55000']);
INSERT INTO utility_tariff_versions(utility_tariff_version_id,utility_tariff_id,owner_id,property_id,utility_type,version_no,effective_from,unit,calculation_mode,flat_unit_price,supersedes_version_id,correction_reason,created_by_account_id)
OVERRIDING SYSTEM VALUE VALUES(18108,10001,1,11,'ELECTRICITY',3,DATE '2026-12-01','kWh','PROGRESSIVE',NULL,10102,'Validator correction',1);
SELECT pg_temp.assert_true('V1.7-33 new tariff correction version accepted', EXISTS(SELECT 1 FROM utility_tariff_versions WHERE utility_tariff_version_id=18108 AND supersedes_version_id=10102 AND correction_reason='Validator correction'));
SELECT pg_temp.assert_rejected('V1.7-34 amenity price history UPDATE rejected', $sql$UPDATE amenity_price_history SET price_amount=price_amount WHERE amenity_price_id=(SELECT min(amenity_price_id) FROM amenity_price_history)$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-35 amenity price history DELETE rejected', $sql$DELETE FROM amenity_price_history WHERE amenity_price_id=(SELECT min(amenity_price_id) FROM amenity_price_history)$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-36 published property price UPDATE rejected', $sql$UPDATE property_price_versions SET unit_price=unit_price+1 WHERE property_price_version_id=(SELECT min(property_price_version_id) FROM property_price_versions WHERE property_pricing_item_id=11001)$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-37 published property price DELETE rejected', $sql$DELETE FROM property_price_versions WHERE property_price_version_id=(SELECT min(property_price_version_id) FROM property_price_versions WHERE property_pricing_item_id=11001)$sql$, ARRAY['55000']);
INSERT INTO property_price_versions(property_pricing_item_id,owner_id,property_id,kind,version_no,effective_from,unit_price,published_at,published_by_account_id,reason,supersedes_version_id,created_by_account_id)
SELECT 11001,1,11,'FIXED_SERVICE',2,DATE '2027-01-01',60000,TIMESTAMPTZ '2027-01-01 00:00:00+00',1,'Validator correction',min(property_price_version_id),1 FROM property_price_versions WHERE property_pricing_item_id=11001;
SELECT pg_temp.assert_true('V1.7-38 new property price correction accepted', EXISTS(SELECT 1 FROM property_price_versions WHERE property_pricing_item_id=11001 AND version_no=2 AND reason='Validator correction'));

INSERT INTO meter_readings(meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type,value,reading_at,actor_account_id,note)
OVERRIDING SYSTEM VALUE VALUES(17001,1,11,101,3001,'ELECTRICITY',1451.125,TIMESTAMPTZ '2026-11-15 00:00:00+00',1,'validator precision');
SELECT pg_temp.assert_true('V1.7-39 valid three-decimal meter reading accepted', EXISTS(SELECT 1 FROM meter_readings WHERE meter_reading_id=17001 AND value=1451.125));
SELECT pg_temp.assert_rejected('V1.7-40 negative meter reading rejected', $sql$INSERT INTO meter_readings(owner_id,property_id,room_id,contract_id,utility_type,value,reading_at,actor_account_id) VALUES(1,11,101,3001,'ELECTRICITY',-1,now(),1)$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-41 invalid meter tenant/context rejected', $sql$INSERT INTO meter_readings(owner_id,property_id,room_id,contract_id,utility_type,value,reading_at,actor_account_id) VALUES(2,21,201,3001,'ELECTRICITY',1,now(),1)$sql$, ARRAY['23503']);
SELECT pg_temp.assert_rejected('V1.7-42 meter reading UPDATE rejected', $sql$UPDATE meter_readings SET value=value WHERE meter_reading_id=17001$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-43 meter reading DELETE rejected', $sql$DELETE FROM meter_readings WHERE meter_reading_id=17001$sql$, ARRAY['55000']);

INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_previous_kwh,electricity_current_kwh,electricity_amount,water_previous_m3,water_current_m3,water_amount,service_amount,total_amount,status,snapshot_kind)
OVERRIDING SYSTEM VALUE VALUES(5021,'V17-VALIDATOR-ITEMIZED',3001,11,1,DATE '2026-12-15',DATE '2027-01-14',NULL,NULL,3500000,1330,1450,165000,74,81,105000,0,3770000,'draft','NOT_FINALIZED');
INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,reading_at,source_kind,source_meter_reading_id)
VALUES (5021,1,11,101,3001,'ELECTRICITY','OPENING',1330,NULL,'MANUAL_READING',14001),(5021,1,11,101,3001,'ELECTRICITY','ENDING',1450,NULL,'MANUAL_READING',14002),(5021,1,11,101,3001,'WATER','OPENING',74,NULL,'MANUAL_READING',14003),(5021,1,11,101,3001,'WATER','ENDING',81,NULL,'MANUAL_READING',14004);
INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version)
OVERRIDING SYSTEM VALUE VALUES(15021,5021,1,11,3001,'rent','RENT','CONTRACT','3001','Rent',1,'period',3500000,3500000,'validator-v1.7');
INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version)
OVERRIDING SYSTEM VALUE VALUES(15022,5021,1,11,3001,'electricity','ELECTRICITY','UTILITY_TARIFF','10101',10101,'ELECTRICITY','Electricity',120,'kWh',NULL,165000,'validator-v1.7'),(15023,5021,1,11,3001,'water','WATER','UTILITY_TARIFF','10103',10103,'WATER','Water',7,'m3',15000,105000,'validator-v1.7');
INSERT INTO invoice_item_electricity_tiers(invoice_item_electricity_tier_id,invoice_item_id,utility_tariff_version_id,electricity_tariff_tier_id,tier_no,lower_kwh,upper_kwh,quantity,unit_price_snapshot,amount)
OVERRIDING SYSTEM VALUE VALUES
 (16021,15022,10101,(SELECT electricity_tariff_tier_id FROM electricity_tariff_tiers WHERE utility_tariff_version_id=10101 AND tier_no=1),1,0,50,50,1000,50000),
 (16022,15022,10101,(SELECT electricity_tariff_tier_id FROM electricity_tariff_tiers WHERE utility_tariff_version_id=10101 AND tier_no=2),2,50,100,50,1500,75000),
 (16023,15022,10101,(SELECT electricity_tariff_tier_id FROM electricity_tariff_tiers WHERE utility_tariff_version_id=10101 AND tier_no=3),3,100,NULL,20,2000,40000);
UPDATE invoices SET status='unpaid',snapshot_kind='ITEMIZED',due_date=DATE '2026-12-20',finalized_at=TIMESTAMPTZ '2026-12-15 00:05:00+00' WHERE invoice_id=5021;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert_true('V1.7-44 valid tier quantity and amount sums accepted', (SELECT count(*)=3 AND sum(quantity)=120 AND sum(amount)=165000 FROM invoice_item_electricity_tiers WHERE invoice_item_id=15022));
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.assert_rejected('V1.7-71 deferred quantity mismatch rejects finalization', $sql$DO $probe$ BEGIN
 INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,rent_amount,electricity_previous_kwh,electricity_current_kwh,electricity_amount,water_previous_m3,water_current_m3,water_amount,service_amount,total_amount,status,snapshot_kind) OVERRIDING SYSTEM VALUE VALUES(5022,'V17-QTY-MISMATCH',3001,11,1,DATE '2027-02-15',DATE '2027-03-14',10,1330,1450,100,74,74,0,0,110,'draft','NOT_FINALIZED');
 INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_meter_reading_id) VALUES(5022,1,11,101,3001,'ELECTRICITY','OPENING',1330,'MANUAL_READING',14001),(5022,1,11,101,3001,'ELECTRICITY','ENDING',1450,'MANUAL_READING',14002),(5022,1,11,101,3001,'WATER','OPENING',74,'MANUAL_READING',14003),(5022,1,11,101,3001,'WATER','ENDING',74,'MANUAL_READING',14003);
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15024,5022,1,11,3001,'rent','RENT','CONTRACT','3001','Rent',1,'period',10,10,'validator');
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15025,5022,1,11,3001,'electric','ELECTRICITY','UTILITY_TARIFF','10101',10101,'ELECTRICITY','Electricity',10,'kWh',NULL,100,'validator');
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15026,5022,1,11,3001,'water','WATER','UTILITY_TARIFF','10103',10103,'WATER','Water',0,'m3',15000,0,'validator');
 INSERT INTO invoice_item_electricity_tiers(invoice_item_electricity_tier_id,invoice_item_id,utility_tariff_version_id,electricity_tariff_tier_id,tier_no,lower_kwh,upper_kwh,quantity,unit_price_snapshot,amount) OVERRIDING SYSTEM VALUE VALUES(16024,15025,10101,(SELECT electricity_tariff_tier_id FROM electricity_tariff_tiers WHERE utility_tariff_version_id=10101 AND tier_no=1),1,0,50,9,1000,100);
 UPDATE invoices SET status='unpaid',snapshot_kind='ITEMIZED',due_date=DATE '2027-02-20',finalized_at=now() WHERE invoice_id=5022;
 SET CONSTRAINTS ALL IMMEDIATE;
END $probe$;$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-72 deferred amount mismatch rejects finalization', $sql$DO $probe$ BEGIN
 INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,rent_amount,electricity_previous_kwh,electricity_current_kwh,electricity_amount,water_previous_m3,water_current_m3,water_amount,service_amount,total_amount,status,snapshot_kind) OVERRIDING SYSTEM VALUE VALUES(5023,'V17-AMOUNT-MISMATCH',3001,11,1,DATE '2027-03-15',DATE '2027-04-14',10,1330,1450,100,74,74,0,0,110,'draft','NOT_FINALIZED');
 INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_meter_reading_id) VALUES(5023,1,11,101,3001,'ELECTRICITY','OPENING',1330,'MANUAL_READING',14001),(5023,1,11,101,3001,'ELECTRICITY','ENDING',1450,'MANUAL_READING',14002),(5023,1,11,101,3001,'WATER','OPENING',74,'MANUAL_READING',14003),(5023,1,11,101,3001,'WATER','ENDING',74,'MANUAL_READING',14003);
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15027,5023,1,11,3001,'rent','RENT','CONTRACT','3001','Rent',1,'period',10,10,'validator');
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15028,5023,1,11,3001,'electric','ELECTRICITY','UTILITY_TARIFF','10101',10101,'ELECTRICITY','Electricity',10,'kWh',NULL,100,'validator');
 INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) OVERRIDING SYSTEM VALUE VALUES(15029,5023,1,11,3001,'water','WATER','UTILITY_TARIFF','10103',10103,'WATER','Water',0,'m3',15000,0,'validator');
 INSERT INTO invoice_item_electricity_tiers(invoice_item_electricity_tier_id,invoice_item_id,utility_tariff_version_id,electricity_tariff_tier_id,tier_no,lower_kwh,upper_kwh,quantity,unit_price_snapshot,amount) OVERRIDING SYSTEM VALUE VALUES(16025,15028,10101,(SELECT electricity_tariff_tier_id FROM electricity_tariff_tiers WHERE utility_tariff_version_id=10101 AND tier_no=1),1,0,50,10,1000,90);
 UPDATE invoices SET status='unpaid',snapshot_kind='ITEMIZED',due_date=DATE '2027-03-20',finalized_at=now() WHERE invoice_id=5023;
 SET CONSTRAINTS ALL IMMEDIATE;
END $probe$;$sql$, ARRAY['23514']);
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,rent_amount,electricity_amount,water_amount,service_amount,total_amount,status,snapshot_kind)
OVERRIDING SYSTEM VALUE VALUES(5024,'V17-VALIDATOR-DRAFT',3001,11,1,DATE '2027-01-15',DATE '2027-02-14',0,0,0,0,0,'draft','NOT_FINALIZED');
INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_meter_reading_id)
VALUES(5024,1,11,101,3001,'ELECTRICITY','OPENING',1330,'MANUAL_READING',14001);
SELECT pg_temp.assert_true('V1.7-45 one opening reading snapshot allowed', (SELECT count(*)=1 FROM invoice_meter_reading_snapshots WHERE invoice_id=5024 AND utility_type='ELECTRICITY' AND snapshot_role='OPENING'));
INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_meter_reading_id)
VALUES(5024,1,11,101,3001,'ELECTRICITY','ENDING',1450,'MANUAL_READING',14002);
SELECT pg_temp.assert_true('V1.7-74 one ending reading snapshot allowed', (SELECT count(*)=1 FROM invoice_meter_reading_snapshots WHERE invoice_id=5024 AND utility_type='ELECTRICITY' AND snapshot_role='ENDING'));
SELECT pg_temp.assert_rejected('V1.7-46 duplicate opening/ending snapshot role rejected', $sql$INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_meter_reading_id) VALUES(5024,1,11,101,3001,'ELECTRICITY','OPENING',1331,'MANUAL_READING',14002)$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-47 cross-context invoice snapshot source rejected', $sql$INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,source_kind,source_contract_id) VALUES(5024,1,11,101,3001,'WATER','ENDING',1400,'CONTRACT_INITIAL',3002)$sql$, ARRAY['23503']);
SELECT pg_temp.assert_rejected('V1.7-48 invoice reading snapshot UPDATE rejected', $sql$UPDATE invoice_meter_reading_snapshots SET value=value WHERE invoice_id=5010 AND utility_type='ELECTRICITY' AND snapshot_role='OPENING'$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-49 invoice reading snapshot DELETE rejected', $sql$DELETE FROM invoice_meter_reading_snapshots WHERE invoice_id=5010 AND utility_type='ELECTRICITY' AND snapshot_role='OPENING'$sql$, ARRAY['55000']);
SELECT pg_temp.assert_true('V1.7-50 seed itemized Invoice has all six supported categories', (SELECT count(DISTINCT category)=6 FROM invoice_items WHERE invoice_id=5010));
SELECT pg_temp.assert_rejected('V1.7-51 invalid invoice item category rejected', $sql$INSERT INTO invoice_items(invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,label_snapshot,quantity,unit,amount,calculation_rule_version) VALUES(5024,1,11,3001,'bad-category','INVALID','TEST','Bad',1,'unit',1,'validator')$sql$, ARRAY['23514']);
INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version)
OVERRIDING SYSTEM VALUE VALUES(15031,5024,1,11,3001,'duplicate-key','RENT','CONTRACT','3001','Rent',1,'period',100,100,'validator-v1.7');
SELECT pg_temp.assert_rejected('V1.7-52 duplicate invoice item_key rejected', $sql$INSERT INTO invoice_items(invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) VALUES(5024,1,11,3001,'duplicate-key','RENT','CONTRACT','3001','Rent duplicate',1,'period',100,100,'validator-v1.7')$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-53 cross-owner invoice/source relation rejected', $sql$INSERT INTO invoice_items(invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) VALUES(5024,2,11,3001,'wrong-owner','RENT','CONTRACT','3001','Wrong owner',1,'period',100,100,'validator-v1.7')$sql$, ARRAY['23503']);
SELECT pg_temp.assert_rejected('V1.7-54 electricity tier snapshot must link to Electricity parent', $sql$INSERT INTO invoice_item_electricity_tiers(invoice_item_id,utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,quantity,unit_price_snapshot,amount) VALUES(15031,10101,99,0,1,1,1000,1000)$sql$, ARRAY['23514']);
INSERT INTO flexible_service_charges(flexible_service_charge_id,owner_id,property_id,room_id,contract_id,resident_id,property_pricing_item_id,kind,property_price_version_id,occurred_at,quantity,unit,unit_price_snapshot,amount,source_system,source_event_key,payload_fingerprint,status,actor_account_id)
OVERRIDING SYSTEM VALUE SELECT 13502,1,11,101,3001,1001,11004,'FLEXIBLE_SERVICE',property_price_version_id,now(),2,'lần',20000,40000,'validator','v17-valid-event',decode(repeat('cd',32),'hex'),'READY',1 FROM property_price_versions WHERE property_pricing_item_id=11004 ORDER BY version_no DESC LIMIT 1;
SELECT pg_temp.assert_true('V1.7-55 valid flexible charge accepted', EXISTS(SELECT 1 FROM flexible_service_charges WHERE flexible_service_charge_id=13502 AND amount=40000 AND status='READY'));
SELECT pg_temp.assert_rejected('V1.7-56 duplicate flexible source event rejected', $sql$INSERT INTO flexible_service_charges(flexible_service_charge_id,owner_id,property_id,room_id,contract_id,resident_id,property_pricing_item_id,kind,property_price_version_id,occurred_at,quantity,unit,unit_price_snapshot,amount,source_system,source_event_key,payload_fingerprint,status,actor_account_id) OVERRIDING SYSTEM VALUE VALUES(13503,1,11,101,3001,1001,11004,'FLEXIBLE_SERVICE',(SELECT min(property_price_version_id) FROM property_price_versions WHERE property_pricing_item_id=11004),now(),1,'lần',20000,20000,'validator','v17-valid-event',decode(repeat('ef',32),'hex'),'READY',1)$sql$, ARRAY['23505']);
SELECT pg_temp.assert_rejected('V1.7-57 cross-tenant flexible relation rejected', $sql$INSERT INTO flexible_service_charges(flexible_service_charge_id,owner_id,property_id,room_id,contract_id,property_pricing_item_id,kind,property_price_version_id,occurred_at,quantity,unit,unit_price_snapshot,amount,source_system,source_event_key,payload_fingerprint,actor_account_id) OVERRIDING SYSTEM VALUE VALUES(13504,2,11,101,3001,11004,'FLEXIBLE_SERVICE',1,now(),1,'lần',1,1,'validator','cross-tenant',decode(repeat('12',32),'hex'),1)$sql$, ARRAY['23503']);
UPDATE flexible_service_charges SET invoice_id=5024,status='INVOICED' WHERE flexible_service_charge_id=13502;
INSERT INTO invoice_items(invoice_item_id,invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,property_price_version_id,pricing_kind,flexible_service_charge_id,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version)
OVERRIDING SYSTEM VALUE SELECT 15032,5024,1,11,3001,'flexible-valid','FLEXIBLE_SERVICE','FLEXIBLE_CHARGE','13502',property_price_version_id,'FLEXIBLE_SERVICE',13502,'Flexible',2,'lần',20000,40000,'validator-v1.7' FROM property_price_versions WHERE property_pricing_item_id=11004 ORDER BY version_no DESC LIMIT 1;
SELECT pg_temp.assert_true('V1.7-58 valid Flexible Service invoice item accepted', EXISTS(SELECT 1 FROM invoice_items WHERE invoice_item_id=15032 AND category='FLEXIBLE_SERVICE'));
SELECT pg_temp.assert_rejected('V1.7-59 free Parking cannot reference paid price', $sql$INSERT INTO parking_entitlements(parking_entitlement_id,owner_id,property_id,entitlement_type,billability,property_pricing_item_id,pricing_kind,code,name) OVERRIDING SYSTEM VALUE VALUES(19001,1,11,'FREE_SLOT','FREE',11006,'PARKING','V17-FREE-WITH-PRICE','Invalid')$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-60 paid Parking must reference PARKING price', $sql$INSERT INTO parking_entitlements(parking_entitlement_id,owner_id,property_id,entitlement_type,billability,property_pricing_item_id,pricing_kind,code,name) OVERRIDING SYSTEM VALUE VALUES(19002,1,11,'PAID_SLOT','PAID',11001,'FIXED_SERVICE','V17-PAID-FIXED','Invalid')$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-61 invalid entitlement/billability pair rejected', $sql$INSERT INTO parking_entitlements(parking_entitlement_id,owner_id,property_id,entitlement_type,billability,code,name) OVERRIDING SYSTEM VALUE VALUES(19003,1,11,'FREE_SLOT','PAID','V17-BAD-PAIR','Invalid')$sql$, ARRAY['23514']);
INSERT INTO property_facilities(property_facility_id,owner_id,property_id,name,description) OVERRIDING SYSTEM VALUE VALUES(19004,1,11,'V17 Facility Without Price','Facility exists without pricing');
SELECT pg_temp.assert_true('V1.7-62 facility exists independently of price', EXISTS(SELECT 1 FROM property_facilities WHERE property_facility_id=19004 AND NOT EXISTS(SELECT 1 FROM property_pricing_items WHERE property_id=11 AND name='V17 Facility Without Price')));
SELECT pg_temp.assert_rejected('V1.7-63 LEGACY_UNCLASSIFIED parking is never inferred billable', $sql$INSERT INTO invoice_items(invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,property_price_version_id,pricing_kind,parking_entitlement_id,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version) VALUES(5024,1,11,3001,'legacy-parking','PARKING','PARKING_ASSIGNMENT',(SELECT min(property_price_version_id) FROM property_price_versions WHERE property_pricing_item_id=11006),'PARKING',13005,'Legacy unknown',1,'xe',80000,80000,'validator')$sql$, ARRAY['23514']);
SELECT pg_temp.assert_rejected('V1.7-64 finalized invoice item UPDATE rejected', $sql$UPDATE invoice_items SET amount=amount WHERE invoice_id=5010 AND item_key='rent'$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-65 finalized invoice item DELETE rejected', $sql$DELETE FROM invoice_items WHERE invoice_id=5010 AND item_key='rent'$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-66 finalized electricity tier UPDATE rejected', $sql$UPDATE invoice_item_electricity_tiers SET amount=amount WHERE invoice_item_id=(SELECT invoice_item_id FROM invoice_items WHERE invoice_id=5010 AND item_key='electricity') AND tier_no=1$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-67 finalized electricity tier DELETE rejected', $sql$DELETE FROM invoice_item_electricity_tiers WHERE invoice_item_id=(SELECT invoice_item_id FROM invoice_items WHERE invoice_id=5010 AND item_key='electricity') AND tier_no=1$sql$, ARRAY['55000']);
SELECT pg_temp.assert_rejected('V1.7-68 finalized invoice financial mutation rejected', $sql$UPDATE invoices SET rent_amount=rent_amount+1 WHERE invoice_id=5010$sql$, ARRAY['55000']);
UPDATE invoices SET status='paid' WHERE invoice_id=5010 AND status='unpaid';
SELECT pg_temp.assert_true('V1.7-69 unpaid to paid allowed without financial changes', (SELECT status='paid' AND rent_amount=3500000 AND electricity_amount=165000 AND water_amount=105000 AND service_amount=275000 AND total_amount=4045000 FROM invoices WHERE invoice_id=5010));
SELECT pg_temp.assert_true('V1.7-70 legacy invoices preserve exact statuses and totals', (SELECT count(*)=3 FROM invoices WHERE (invoice_id,status,total_amount) IN ((5001,'unpaid',4040000),(5002,'paid',4395000),(5003,'unpaid',3550000)) AND snapshot_kind='LEGACY_AGGREGATE'));
DO $$
DECLARE
    v_total integer;
    v_passed integer;
    v_failed integer;
BEGIN
    SELECT count(*),count(*) FILTER (WHERE passed),count(*) FILTER (WHERE NOT passed)
      INTO v_total,v_passed,v_failed FROM validator_results;
    IF v_total <> 171 OR v_passed <> v_total OR v_failed <> 0 THEN
        RAISE EXCEPTION 'VALIDATION FAIL: TOTAL=% PASS=% FAIL=% (expected 171 total)', v_total,v_passed,v_failed;
    END IF;
    RAISE NOTICE 'DATABASE V1.7 VALIDATION = PASS; TOTAL=% PASS=% FAIL=% (97 V1.6 checks + 74 V1.7 behavioral/structural checks)', v_total,v_passed,v_failed;
END
$$;

-- These are application/service behaviors, not database-enforced checks:
-- BACKEND TEST REQUIRED: due_date = finalized local calendar date (Asia/Ho_Chi_Minh) + 5 days.
-- BACKEND TEST REQUIRED: draft/paid/unfinalized invoices cannot start payment; only finalized unpaid can.
-- BACKEND TEST REQUIRED: Zalo only sends finalized unpaid invoices, after finalize commit.
-- BACKEND TEST REQUIRED: reminder on period_end, draft ensure on next calendar day, both scheduler retries idempotent.
-- BACKEND TEST REQUIRED: bill period anchor/clamp/no-drift and final-period amount calculations.

ROLLBACK;


