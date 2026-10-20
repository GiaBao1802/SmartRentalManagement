-- V1.7-only synthetic fixture overlay. Run after Database V1.6/seed.sql and V1.7 migration.
-- All examples reuse the V1.6 synthetic Owner/Property/Room/Contract/Account records.
BEGIN;

INSERT INTO utility_tariffs(utility_tariff_id,owner_id,property_id,utility_type,code,name,provider_name,locality,source_metadata)
OVERRIDING SYSTEM VALUE VALUES
 (10001,1,11,'ELECTRICITY','ELEC-DEMO','Điện mẫu','Điện lực mẫu','TP. Hồ Chí Minh','{"fixture":"synthetic"}'),
 (10002,1,11,'WATER','WATER-DEMO','Nước mẫu','Đơn vị nước mẫu','TP. Hồ Chí Minh','{"fixture":"synthetic"}');

INSERT INTO utility_tariff_versions(utility_tariff_version_id,utility_tariff_id,owner_id,property_id,utility_type,version_no,effective_from,unit,calculation_mode,flat_unit_price,source_name,source_reference,source_snapshot,created_by_account_id)
OVERRIDING SYSTEM VALUE VALUES
 (10101,10001,1,11,'ELECTRICITY',1,DATE '2026-01-01','kWh','PROGRESSIVE',NULL,'Demo schedule','FIXTURE-E-1','{"synthetic":true}',1),
 (10102,10001,1,11,'ELECTRICITY',2,DATE '2026-12-01','kWh','PROGRESSIVE',NULL,'Demo schedule','FIXTURE-E-2','{"synthetic":true}',1),
 (10103,10002,1,11,'WATER',1,DATE '2026-01-01','m3','FLAT',15000,'Demo schedule','FIXTURE-W-1','{"synthetic":true}',1);
INSERT INTO electricity_tariff_tiers(utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,unit_price) VALUES
 (10101,1,0,50,1000),(10101,2,50,100,1500),(10101,3,100,NULL,2000),
 (10102,1,0,50,1100),(10102,2,50,100,1600),(10102,3,100,NULL,2100);
UPDATE utility_tariff_versions SET published_at=TIMESTAMPTZ '2026-01-01 00:00:00+07',published_by_account_id=1
 WHERE utility_tariff_version_id IN (10101,10103);
UPDATE utility_tariff_versions SET published_at=TIMESTAMPTZ '2026-11-01 00:00:00+07',published_by_account_id=1
 WHERE utility_tariff_version_id=10102;

INSERT INTO property_facilities(property_facility_id,owner_id,property_id,name,description,location,legacy_amenity_id)
OVERRIDING SYSTEM VALUE VALUES
 (10201,1,11,'Hồ bơi','Tiện ích tham khảo, không tự phát sinh phí.','Tầng thượng',7001),
 (10202,1,11,'Phòng gym','Tiện ích tham khảo, không tự phát sinh phí.','Tầng 3',7002);

INSERT INTO property_pricing_items(property_pricing_item_id,owner_id,property_id,kind,code,name,unit)
OVERRIDING SYSTEM VALUE VALUES
 (11001,1,11,'FIXED_SERVICE','WIFI','WiFi','phòng/kỳ'),
 (11002,1,11,'FIXED_SERVICE','MANAGEMENT','Phí quản lý','phòng/kỳ'),
 (11003,1,11,'FIXED_SERVICE','TRASH','Phí rác','phòng/kỳ'),
 (11004,1,11,'FLEXIBLE_SERVICE','SPA','Spa','lần'),
 (11005,1,11,'FLEXIBLE_SERVICE','PET-CARE','Chăm sóc thú cưng','lần'),
 (11006,1,11,'PARKING','PARKING-MONTH','Gửi xe máy','xe/kỳ');
INSERT INTO property_price_versions(property_pricing_item_id,owner_id,property_id,kind,version_no,effective_from,unit_price,published_at,published_by_account_id,reason,created_by_account_id)
VALUES
 (11001,1,11,'FIXED_SERVICE',1,DATE '2026-01-01',50000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1),
 (11002,1,11,'FIXED_SERVICE',1,DATE '2026-01-01',100000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1),
 (11003,1,11,'FIXED_SERVICE',1,DATE '2026-01-01',25000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1),
 (11004,1,11,'FLEXIBLE_SERVICE',1,DATE '2026-01-01',20000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1),
 (11005,1,11,'FLEXIBLE_SERVICE',1,DATE '2026-01-01',35000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1),
 (11006,1,11,'PARKING',1,DATE '2026-01-01',80000,TIMESTAMPTZ '2026-01-01 00:00:00+07',1,'Giá mẫu',1);

INSERT INTO parking_entitlements(parking_entitlement_id,owner_id,property_id,entitlement_type,billability,property_pricing_item_id,pricing_kind,code,name)
OVERRIDING SYSTEM VALUE VALUES
 (13001,1,11,'FREE_SLOT','FREE',NULL,NULL,'FREE-PARK','Chỗ gửi xe miễn phí'),
 (13002,1,11,'PAID_SLOT','PAID',11006,'PARKING','PAID-PARK','Chỗ gửi xe trả phí'),
 (13003,1,11,'MOTORCYCLE_VEHICLE_CARD','FREE',NULL,NULL,'MOTO-CARD-FREE','Thẻ xe máy miễn phí'),
 (13004,1,11,'APARTMENT_VEHICLE_CARD','PAID',11006,'PARKING','APT-CARD-PAID','Thẻ xe căn hộ trả phí'),
 (13005,1,11,'LEGACY_UNCLASSIFIED','UNCLASSIFIED',NULL,NULL,'LEGACY-UNKNOWN','Phân loại lịch sử chưa rõ');
INSERT INTO parking_slots(parking_slot_id,parking_area_id,property_id,owner_id,slot_code,status)
OVERRIDING SYSTEM VALUE VALUES (8103,8001,11,1,'P-03','active');
INSERT INTO vehicles(vehicle_id,resident_id,owner_id,vehicle_type,plate_number)
OVERRIDING SYSTEM VALUE VALUES (8304,1001,1,'motorcycle','DEMO-PLATE-004');
INSERT INTO parking_slot_assignments(assignment_id,parking_slot_id,property_id,owner_id,vehicle_id,resident_id,room_id,contract_id,started_at,status,entitlement_id)
OVERRIDING SYSTEM VALUE VALUES (8404,8103,11,1,8304,1001,101,3001,DATE '2026-09-15','active',13002);

INSERT INTO flexible_service_charges(flexible_service_charge_id,owner_id,property_id,room_id,contract_id,resident_id,property_pricing_item_id,kind,property_price_version_id,occurred_at,quantity,unit,unit_price_snapshot,amount,source_system,source_event_key,payload_fingerprint,status,actor_account_id)
OVERRIDING SYSTEM VALUE VALUES
 (13501,1,11,101,3001,1001,11004,'FLEXIBLE_SERVICE',4,TIMESTAMPTZ '2026-10-20 10:00:00+07',1,'lần',20000,20000,'seed','spa-demo-001',decode(repeat('ab',32),'hex'),'READY',1);

INSERT INTO meter_readings(meter_reading_id,owner_id,property_id,room_id,contract_id,utility_type,value,reading_at,actor_account_id,note)
OVERRIDING SYSTEM VALUE VALUES
 (14001,1,11,101,3001,'ELECTRICITY',1330,TIMESTAMPTZ '2026-10-14 20:00:00+07',1,'Fixture opening'),
 (14002,1,11,101,3001,'ELECTRICITY',1450,TIMESTAMPTZ '2026-11-14 20:00:00+07',1,'Fixture ending'),
 (14003,1,11,101,3001,'WATER',74,TIMESTAMPTZ '2026-10-14 20:00:00+07',1,'Fixture opening'),
 (14004,1,11,101,3001,'WATER',81,TIMESTAMPTZ '2026-11-14 20:00:00+07',1,'Fixture ending');

-- New invoice starts NOT_FINALIZED. Legacy V1.6 invoice rows remain untouched and un-itemized.
INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_previous_kwh,electricity_current_kwh,electricity_amount,water_previous_m3,water_current_m3,water_amount,service_amount,total_amount,status,revision,snapshot_kind)
OVERRIDING SYSTEM VALUE VALUES
 (5010,'V17-ITEMIZED-DEMO',3001,11,1,DATE '2026-10-15',DATE '2026-11-14',NULL,NULL,0,NULL,NULL,0,NULL,NULL,0,0,0,'draft',1,'NOT_FINALIZED');

INSERT INTO invoice_meter_reading_snapshots(invoice_id,owner_id,property_id,room_id,contract_id,utility_type,snapshot_role,value,reading_at,source_kind,source_meter_reading_id,source_invoice_id,source_contract_id)
VALUES
 (5010,1,11,101,3001,'ELECTRICITY','OPENING',1330,NULL,'FINALIZED_INVOICE',NULL,5001,NULL),
 (5010,1,11,101,3001,'ELECTRICITY','ENDING',1450,TIMESTAMPTZ '2026-11-14 20:00:00+07','MANUAL_READING',14002,NULL,NULL),
 (5010,1,11,101,3001,'WATER','OPENING',74,NULL,'FINALIZED_INVOICE',NULL,5001,NULL),
 (5010,1,11,101,3001,'WATER','ENDING',81,TIMESTAMPTZ '2026-11-14 20:00:00+07','MANUAL_READING',14004,NULL,NULL);

UPDATE flexible_service_charges SET status='INVOICED',invoice_id=5010 WHERE flexible_service_charge_id=13501;
INSERT INTO invoice_items(invoice_id,owner_id,property_id,contract_id,item_key,category,source_type,source_reference,utility_tariff_version_id,utility_type,property_price_version_id,pricing_kind,flexible_service_charge_id,parking_assignment_id,parking_entitlement_id,label_snapshot,quantity,unit,unit_price_snapshot,amount,calculation_rule_version,applicable_period_start,applicable_period_end)
VALUES
 (5010,1,11,3001,'rent','RENT','CONTRACT','3001',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Tiền thuê phòng',1,'kỳ',3500000,3500000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'electricity','ELECTRICITY','UTILITY_TARIFF','10101',10101,'ELECTRICITY',NULL,NULL,NULL,NULL,NULL,'Tiền điện',120,'kWh',NULL,165000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'water','WATER','UTILITY_TARIFF','10103',10103,'WATER',NULL,NULL,NULL,NULL,NULL,'Tiền nước',7,'m3',15000,105000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'wifi','FIXED_SERVICE','PROPERTY_PRICE','11001',NULL,NULL,1,'FIXED_SERVICE',NULL,NULL,NULL,'WiFi',1,'phòng/kỳ',50000,50000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'management','FIXED_SERVICE','PROPERTY_PRICE','11002',NULL,NULL,2,'FIXED_SERVICE',NULL,NULL,NULL,'Phí quản lý',1,'phòng/kỳ',100000,100000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'trash','FIXED_SERVICE','PROPERTY_PRICE','11003',NULL,NULL,3,'FIXED_SERVICE',NULL,NULL,NULL,'Phí rác',1,'phòng/kỳ',25000,25000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'spa','FLEXIBLE_SERVICE','FLEXIBLE_CHARGE','13501',NULL,NULL,4,'FLEXIBLE_SERVICE',13501,NULL,NULL,'Dịch vụ spa',1,'lần',20000,20000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14'),
 (5010,1,11,3001,'parking','PARKING','PARKING_ASSIGNMENT','8404',NULL,NULL,6,'PARKING',NULL,8404,13002,'Gửi xe máy',1,'xe/kỳ',80000,80000,'billing-v1.7',DATE '2026-10-15',DATE '2026-11-14');

INSERT INTO invoice_item_electricity_tiers(invoice_item_id,utility_tariff_version_id,tier_no,lower_kwh,upper_kwh,quantity,unit_price_snapshot,amount)
SELECT ii.invoice_item_id,10101,v.tier_no,v.lower_kwh,v.upper_kwh,v.qty,v.unit_price,v.amount
FROM invoice_items ii CROSS JOIN (VALUES
 (1,0::numeric,50::numeric,50::numeric,1000::bigint,50000::bigint),
 (2,50::numeric,100::numeric,50::numeric,1500::bigint,75000::bigint),
 (3,100::numeric,NULL::numeric,20::numeric,2000::bigint,40000::bigint)
) AS v(tier_no,lower_kwh,upper_kwh,qty,unit_price,amount)
WHERE ii.invoice_id=5010 AND ii.item_key='electricity';

UPDATE invoices SET rent_amount=3500000,electricity_previous_kwh=1330,electricity_current_kwh=1450,electricity_amount=165000,
 water_previous_m3=74,water_current_m3=81,water_amount=105000,service_amount=275000,total_amount=4045000,
 due_date=DATE '2026-11-19',finalized_at=TIMESTAMPTZ '2026-11-14 20:05:00+07',status='unpaid',snapshot_kind='ITEMIZED'
WHERE invoice_id=5010;

SELECT setval(pg_get_serial_sequence('vehicles','vehicle_id'),(SELECT max(vehicle_id) FROM vehicles),true);
SELECT setval(pg_get_serial_sequence('parking_slots','parking_slot_id'),(SELECT max(parking_slot_id) FROM parking_slots),true);
SELECT setval(pg_get_serial_sequence('parking_slot_assignments','assignment_id'),(SELECT max(assignment_id) FROM parking_slot_assignments),true);
SELECT setval(pg_get_serial_sequence('invoices','invoice_id'),(SELECT max(invoice_id) FROM invoices),true);
SELECT setval(pg_get_serial_sequence('utility_tariffs','utility_tariff_id'),(SELECT max(utility_tariff_id) FROM utility_tariffs),true);
SELECT setval(pg_get_serial_sequence('utility_tariff_versions','utility_tariff_version_id'),(SELECT max(utility_tariff_version_id) FROM utility_tariff_versions),true);
SELECT setval(pg_get_serial_sequence('electricity_tariff_tiers','electricity_tariff_tier_id'),(SELECT max(electricity_tariff_tier_id) FROM electricity_tariff_tiers),true);
SELECT setval(pg_get_serial_sequence('property_facilities','property_facility_id'),(SELECT max(property_facility_id) FROM property_facilities),true);
SELECT setval(pg_get_serial_sequence('property_pricing_items','property_pricing_item_id'),(SELECT max(property_pricing_item_id) FROM property_pricing_items),true);
SELECT setval(pg_get_serial_sequence('property_price_versions','property_price_version_id'),(SELECT max(property_price_version_id) FROM property_price_versions),true);
SELECT setval(pg_get_serial_sequence('flexible_service_charges','flexible_service_charge_id'),(SELECT max(flexible_service_charge_id) FROM flexible_service_charges),true);
SELECT setval(pg_get_serial_sequence('parking_entitlements','parking_entitlement_id'),(SELECT max(parking_entitlement_id) FROM parking_entitlements),true);
SELECT setval(pg_get_serial_sequence('meter_readings','meter_reading_id'),(SELECT max(meter_reading_id) FROM meter_readings),true);
SELECT setval(pg_get_serial_sequence('invoice_meter_reading_snapshots','invoice_meter_reading_snapshot_id'),(SELECT max(invoice_meter_reading_snapshot_id) FROM invoice_meter_reading_snapshots),true);
SELECT setval(pg_get_serial_sequence('invoice_items','invoice_item_id'),(SELECT max(invoice_item_id) FROM invoice_items),true);
SELECT setval(pg_get_serial_sequence('invoice_item_electricity_tiers','invoice_item_electricity_tier_id'),(SELECT max(invoice_item_electricity_tier_id) FROM invoice_item_electricity_tiers),true);

COMMIT;
