-- Góc Trọ V1.4 development/test seed. Run after schema.sql on a disposable database.
-- Intentionally contains no room_images rows: no real binary storage fixtures exist.
-- All identity values and personal-looking data below are synthetic; there is no production PII.
-- password_hash values are scrypt encodings of discarded random secrets. They are intentionally
-- unusable as demo login credentials; provision credentials through the backend auth flow.
BEGIN;

INSERT INTO owners(owner_id,display_name,contact_phone,contact_email) OVERRIDING SYSTEM VALUE VALUES
 (1,'Chủ trọ mẫu 1','0000000001','admin.one@example.test'),
 (2,'Chủ trọ mẫu 2','0000000002','admin.two@example.test')
ON CONFLICT (owner_id) DO NOTHING;

INSERT INTO properties(property_id,owner_id,property_code,name,province,address,manager_name,status)
OVERRIDING SYSTEM VALUE VALUES
 (11,1,'OWN1-P01','Nhà mẫu Bình An','TP. Hồ Chí Minh','Địa chỉ kiểm thử 01','Chủ trọ mẫu 1','active'),
 (12,1,'OWN1-P02','Nhà mẫu Phú Lộc','Đồng Nai','Địa chỉ kiểm thử 02','Chủ trọ mẫu 1','active'),
 (21,2,'OWN2-P01','Nhà mẫu An Cư','Đà Nẵng','Địa chỉ kiểm thử 03','Chủ trọ mẫu 2','active'),
 (22,2,'OWN2-P02','Nhà mẫu Hòa Bình','Cần Thơ','Địa chỉ kiểm thử 04','Chủ trọ mẫu 2','active')
ON CONFLICT (property_id) DO NOTHING;

INSERT INTO rooms(room_id,property_id,owner_id,room_code,status,area_m2,default_rent,default_capacity,is_active,is_public,public_description)
OVERRIDING SYSTEM VALUE VALUES
 (101,11,1,'A101','occupied',25,3500000,3,true,false,NULL),
 (102,11,1,'A102','occupied',24,3300000,2,true,false,NULL),
 (111,12,1,'B101','available',28,3900000,2,true,true,'Phòng mẫu tại khu thứ hai của Chủ trọ 1.'),
 (112,12,1,'B102','inactive',22,3000000,1,false,false,NULL),
 (201,21,2,'C101','occupied',27,4100000,2,true,false,NULL),
 (202,21,2,'C102','available',23,3200000,2,true,true,'Phòng mẫu của Chủ trọ 2.'),
 (211,22,2,'D101','available',30,4500000,3,true,false,NULL),
 (212,22,2,'D102','available',26,3700000,2,true,false,NULL)
ON CONFLICT (room_id) DO NOTHING;

INSERT INTO residents(resident_id,owner_id,national_id,full_name,phone,email,birth_date,gender,residence_status,residence_registration_status)
OVERRIDING SYSTEM VALUE VALUES
 (1001,1,'079000000001','Cư dân mẫu An','0000000101','resident.one@example.test',DATE '1995-01-01','unspecified','living','temporary_resident'),
 (1002,1,'079000000002','Cư dân mẫu Bình','0000000102','resident.two@example.test',DATE '1997-02-02','unspecified','living','temporary_absence'),
 (1003,1,'079000000003','Cư dân mẫu Chi','0000000103','resident.chi@example.test',DATE '1998-03-03','unspecified','living','not_completed'),
 (2001,2,'048000000001','Cư dân mẫu Dũng','0000000201','resident.three@example.test',DATE '1994-04-04','unspecified','living','not_completed'),
 (2002,2,'048000000002','Cư dân mẫu Hà','0000000202','resident.ha@example.test',DATE '1992-05-05','unspecified','left','temporary_resident'),
 (2003,2,'079000000001','Hồ sơ tenant riêng mẫu','0000000203','resident.same-id@example.test',DATE '1995-01-01','unspecified','left','not_completed')
ON CONFLICT (resident_id) DO NOTHING;

INSERT INTO accounts(account_id,owner_id,resident_id,role,email,phone,password_hash,status)
OVERRIDING SYSTEM VALUE VALUES
 (1,1,NULL,'admin','admin.one@example.test','0000000001','scrypt$N=16384$r=8$p=1$vbqzDRGeNiIYaTXgW8Zg4Q==$IQm+osD293xYw79sgs8Nx8epjd4GIrHVlp1i1YlMr82+Rn8qhr1CfmFbAAL2J/MxBpQSC4ADFLNaoPEd+jgX2A==','active'),
 (2,NULL,1001,'resident','resident.one@example.test','0000000101','scrypt$N=16384$r=8$p=1$f6mFrUhUtpVPj5bxVgHbAg==$8lFuOGX290i7IY97AND+86vrtTfmqo3ViHQPfs3+0jvf2jMqXeXjiN6Dt43idrJMqAHIzsODbj0R8oO6TChGtQ==','active'),
 (3,NULL,1002,'resident','resident.two@example.test','0000000102','scrypt$N=16384$r=8$p=1$ciy/ko9VxabDizZih62bfw==$nc8slU91v7qJKm2URr7pUlHsAy/quQRTxZJ33Qn3fkf8VslPQuRlGFj1xnyK51KODajxXWuiQu1jn0Y7P5xUlg==','locked'),
 (4,2,NULL,'admin','admin.two@example.test','0000000002','scrypt$N=16384$r=8$p=1$b3aewLx1uRkboe4G3oByjw==$Q9X3luSaKOQuv4Zznt0TIcpD7hltTsCMEF6gB7k8uv8qY1EPQ4A65yBi3rZrWkd1PIzrO2ANMVA5YaLovbnclg==','active'),
 (5,NULL,2001,'resident','resident.three@example.test','0000000201','scrypt$N=16384$r=8$p=1$GUPVjzrnlnASF+38rVYFuA==$11lQN/e71ULkkSQj5uxhh6ZQ1N3QgaJG2S6K4XgJhUqBC5SrpPTuU7BfqKmayJC80x0v4Kzh11AURi+gOctHJg==','active'),
 (6,NULL,2002,'resident','resident.four@example.test','0000000202','scrypt$N=16384$r=8$p=1$GUPVjzrnlnASF+38rVYFuA==$11lQN/e71ULkkSQj5uxhh6ZQ1N3QgaJG2S6K4XgJhUqBC5SrpPTuU7BfqKmayJC80x0v4Kzh11AURi+gOctHJg==','active')
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO account_invitations(invitation_id,owner_id,resident_id,created_by_account_id,token_hash,status,expires_at,accepted_at,created_at,updated_at)
OVERRIDING SYSTEM VALUE VALUES
 (1,1,1003,1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','pending',now()+interval '7 days',NULL,now(),now()),
 (2,2,2002,4,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','accepted',now()-interval '2 days',now()-interval '3 days',now()-interval '10 days',now()-interval '3 days')
ON CONFLICT (invitation_id) DO NOTHING;

INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3)
OVERRIDING SYSTEM VALUE VALUES
 (3001,'DEMO-HD-001',101,11,1,1001,DATE '2026-09-15',DATE '2027-09-14','active',1,3500000,3500000,3,1250,60),
 (3002,'DEMO-HD-002',102,11,1,1003,CURRENT_DATE-20,CURRENT_DATE+345,'active',1,3300000,3300000,2,900,40),
 (4001,'DEMO-HD-003',201,21,2,2001,CURRENT_DATE-45,CURRENT_DATE+320,'active',1,4100000,4100000,2,500,30)
ON CONFLICT (contract_id) DO NOTHING;

-- One completed contract followed by a distinct draft successor; no active date overlap.
INSERT INTO contracts(contract_id,contract_no,room_id,property_id,owner_id,representative_resident_id,previous_contract_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity)
OVERRIDING SYSTEM VALUE VALUES
 (4002,'DEMO-HD-004',202,21,2,2002,NULL,DATE '2025-01-15',DATE '2025-11-04','expired',1,3200000,3200000,2),
 (4003,'DEMO-HD-005',202,21,2,2002,4002,CURRENT_DATE+30,CURRENT_DATE+395,'draft',0,3300000,3300000,2)
ON CONFLICT (contract_id) DO NOTHING;

INSERT INTO contract_documents(document_id,contract_id,property_id,owner_id,file_name,storage_key,mime_type,file_size,document_type,version,checksum_sha256,status,uploaded_by_account_id,signed_at,created_at,updated_at)
OVERRIDING SYSTEM VALUE VALUES
 (1,3001,11,1,'hop-dong-v1.pdf','contracts/owner-1/contract-3001/v1.pdf','application/pdf',1024,'contract',1,'1111111111111111111111111111111111111111111111111111111111111111','generated',1,NULL,now()-interval '2 days',now()-interval '2 days'),
 (2,3001,11,1,'hop-dong-v2-da-ky.pdf','contracts/owner-1/contract-3001/v2-signed.pdf','application/pdf',2048,'contract',2,'2222222222222222222222222222222222222222222222222222222222222222','signed',1,now()-interval '1 day',now()-interval '1 day',now()-interval '1 day')
ON CONFLICT (document_id) DO NOTHING;

-- Two current residents share one room; only resident 1001 represents contract DEMO-HD-001.
INSERT INTO room_residents(occupancy_id,room_id,property_id,owner_id,resident_id,contract_id,started_at,ended_at,status)
OVERRIDING SYSTEM VALUE VALUES
 (1,101,11,1,1001,3001,DATE '2026-09-15',NULL,'active'),
 (2,101,11,1,1002,3001,DATE '2026-09-20',NULL,'active'),
 (3,102,11,1,1003,3002,CURRENT_DATE-20,NULL,'active'),
 (4,201,21,2,2001,4001,CURRENT_DATE-45,NULL,'active'),
 (5,202,21,2,2002,4002,DATE '2025-01-15',DATE '2025-11-04','ended')
ON CONFLICT (occupancy_id) DO NOTHING;

INSERT INTO invoices(invoice_id,invoice_no,contract_id,property_id,owner_id,period_start,period_end,due_date,finalized_at,rent_amount,electricity_previous_kwh,electricity_current_kwh,electricity_amount,water_previous_m3,water_current_m3,water_amount,service_amount,total_amount,status,revision)
OVERRIDING SYSTEM VALUE VALUES
 (5001,'DEMO-INV-001',3001,11,1,DATE '2026-09-15',DATE '2026-10-14',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,CURRENT_TIMESTAMP,3500000,1250,1330,280000,60,74,210000,50000,4040000,'unpaid',2),
 (5002,'DEMO-INV-002',4001,21,2,CURRENT_DATE-45,CURRENT_DATE-16,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,CURRENT_TIMESTAMP,4100000,500,550,175000,30,36,90000,30000,4395000,'paid',1),
 (5003,'DEMO-INV-003',3002,11,1,CURRENT_DATE-20,CURRENT_DATE+9,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date+5,CURRENT_TIMESTAMP,3300000,850,900,175000,35,40,75000,0,3550000,'unpaid',1),
 (5004,'DEMO-INV-DRAFT-001',4002,21,2,DATE '2025-10-15',DATE '2025-11-04',NULL,NULL,3200000,NULL,NULL,0,NULL,NULL,0,0,3200000,'draft',1)
ON CONFLICT (invoice_id) DO NOTHING;

INSERT INTO payment_transactions(payment_transaction_id,invoice_id,payment_session_id,provider,provider_transaction_id,provider_event_id,provider_reference,amount,currency,status,error_code,error_message,created_at,processed_at)
OVERRIDING SYSTEM VALUE VALUES
 (6001,5001,'10000000-0000-4000-8000-000000000001','momo','DEMO-MOMO-FAIL-001','DEMO-MOMO-EVENT-001','DEMO-REF-001',4040000,'VND','failed','DEMO_DECLINED','Synthetic failed attempt 1',now()-interval '3 hours',now()-interval '3 hours'),
 (6002,5002,'20000000-0000-4000-8000-000000000002','zalopay','DEMO-ZLP-SUCCESS-001','DEMO-ZLP-EVENT-001','DEMO-REF-002',4395000,'VND','success',NULL,NULL,now()-interval '1 hour',now()-interval '1 hour'),
 (6003,5003,'30000000-0000-4000-8000-000000000003','momo',NULL,NULL,'DEMO-REF-003',3550000,'VND','pending',NULL,NULL,now(),NULL),
 (6004,5001,'10000000-0000-4000-8000-000000000001','momo','DEMO-MOMO-FAIL-002','DEMO-MOMO-EVENT-002','DEMO-REF-004',4040000,'VND','failed','DEMO_DECLINED','Synthetic failed attempt 2',now()-interval '2 hours',now()-interval '2 hours'),
 (6005,5001,'40000000-0000-4000-8000-000000000004','momo',NULL,NULL,'DEMO-REF-005',4040000,'VND','pending',NULL,NULL,now(),NULL)
ON CONFLICT (payment_transaction_id) DO NOTHING;

INSERT INTO invoice_zalo_oa_send_logs(send_log_id,invoice_id,contract_id,property_id,owner_id,recipient_resident_id,recipient_phone,invoice_revision,status,provider_message_id,provider_response,error_message,created_at,sent_at)
OVERRIDING SYSTEM VALUE VALUES
 (6101,5001,3001,11,1,1001,'0000000101',1,'sent','DEMO-ZALO-MSG-001','{"demo":true}'::jsonb,NULL,now()-interval '1 day',now()-interval '1 day'),
 (6102,5001,3001,11,1,1001,'0000000101',2,'failed',NULL,'{"demo":true}'::jsonb,'Synthetic send failure',now(),NULL),
 (6103,5002,4001,21,2,2001,'0000000201',1,'sent','DEMO-ZALO-MSG-002','{"demo":true}'::jsonb,NULL,now(),now())
ON CONFLICT (send_log_id) DO NOTHING;

INSERT INTO amenities(amenity_id,property_id,owner_id,amenity_type,name,description,location,opening_time,closing_time,operating_info,rules,registration_type,active)
OVERRIDING SYSTEM VALUE VALUES
 (7001,11,1,'pool','Hồ bơi','Tiện ích mẫu','Tầng thượng',TIME '06:00',TIME '20:00','Mở hằng ngày','Tuân thủ nội quy.','subscription',true),
 (7002,11,1,'gym','Gym','Tiện ích mẫu','Tầng 3',TIME '05:00',TIME '22:00','Mở hằng ngày','Giữ vệ sinh dụng cụ.','subscription',true),
 (7003,21,2,'pool','Hồ bơi','Tiện ích mẫu','Tầng 1',TIME '06:00',TIME '20:00','Mở hằng ngày','Tuân thủ nội quy.','subscription',true),
 (7004,21,2,'gym','Gym','Tiện ích mẫu','Tầng 2',TIME '05:00',TIME '22:00','Mở hằng ngày','Giữ vệ sinh dụng cụ.','subscription',true)
ON CONFLICT (amenity_id) DO NOTHING;

INSERT INTO amenity_price_history(amenity_price_id,amenity_id,effective_at,price_amount)
OVERRIDING SYSTEM VALUE VALUES
 (7101,7001,now()-interval '1440 hours',50000),(7102,7001,now()-interval '720 hours',60000),
 (7103,7002,now()-interval '60 days',25000),(7104,7002,now()-interval '30 days',30000),
 (7105,7003,now()-interval '30 days',45000),(7106,7004,now()-interval '30 days',28000)
ON CONFLICT (amenity_price_id) DO NOTHING;

INSERT INTO amenity_subscriptions(subscription_id,amenity_id,property_id,owner_id,resident_id,contract_id,started_at,status,cancellation_requested_at,effective_end_at)
OVERRIDING SYSTEM VALUE VALUES
 (7201,7001,11,1,1001,3001,now()-interval '1440 hours','active',NULL,NULL),
 (7202,7004,21,2,2001,4001,now()-interval '15 days','cancellation_requested',now()-interval '1 day',now()-interval '15 days'+interval '720 hours')
ON CONFLICT (subscription_id) DO NOTHING;

INSERT INTO amenity_subscription_cycles(subscription_cycle_id,subscription_id,contract_id,property_id,owner_id,cycle_start,cycle_end,price_snapshot,status,invoice_id)
OVERRIDING SYSTEM VALUE VALUES
 (7301,7201,3001,11,1,now()-interval '1440 hours',now()-interval '720 hours',50000,'completed',5001),
 (7303,7201,3001,11,1,now()-interval '720 hours',now(),60000,'active',NULL),
 (7302,7202,4001,21,2,now()-interval '15 days',now()-interval '15 days'+interval '720 hours',28000,'active',NULL)
ON CONFLICT (subscription_cycle_id) DO NOTHING;

INSERT INTO parking_areas(parking_area_id,property_id,owner_id,name,location,active)
OVERRIDING SYSTEM VALUE VALUES
 (8001,11,1,'Bãi xe mẫu','Tầng hầm',true),
 (8002,21,2,'Bãi xe mẫu','Tầng trệt',true)
ON CONFLICT (parking_area_id) DO NOTHING;

INSERT INTO parking_slots(parking_slot_id,parking_area_id,property_id,owner_id,slot_code,status)
OVERRIDING SYSTEM VALUE VALUES
 (8101,8001,11,1,'P-01','active'),(8102,8001,11,1,'P-02','active'),(8201,8002,21,2,'P-01','active')
ON CONFLICT (parking_slot_id) DO NOTHING;

INSERT INTO vehicles(vehicle_id,resident_id,owner_id,vehicle_type,plate_number)
OVERRIDING SYSTEM VALUE VALUES
 (8301,1001,1,'motorcycle','DEMO-PLATE-001'),
 (8302,1002,1,'bicycle','DEMO-PLATE-002'),
 (8303,2001,2,'motorcycle','DEMO-PLATE-003')
ON CONFLICT (vehicle_id) DO NOTHING;

INSERT INTO parking_slot_assignments(assignment_id,parking_slot_id,property_id,owner_id,vehicle_id,resident_id,room_id,contract_id,started_at,status)
OVERRIDING SYSTEM VALUE VALUES
 (8401,8101,11,1,8301,1001,101,3001,CURRENT_DATE-20,'active'),
 (8402,8102,11,1,8302,1002,101,3001,CURRENT_DATE-10,'active'),
 (8403,8201,21,2,8303,2001,201,4001,CURRENT_DATE-12,'active')
ON CONFLICT (assignment_id) DO NOTHING;

INSERT INTO complaints(complaint_id,resident_id,property_id,owner_id,room_id,category,content,priority,status,created_at,updated_at,resolved_at)
OVERRIDING SYSTEM VALUE VALUES
 (9001,1001,11,1,101,'Báo cáo nhà trọ','Báo cáo mẫu cần kiểm tra.','normal','in_progress',now()-interval '2 days',now()-interval '1 hour',NULL),
 (9002,2001,21,2,201,'Thiết bị','Phản ánh mẫu đã xử lý.','high','resolved',now()-interval '3 days',now()-interval '1 day',now()-interval '1 day')
ON CONFLICT (complaint_id) DO NOTHING;

INSERT INTO complaint_history(complaint_history_id,complaint_id,actor_account_id,action,from_status,to_status,note)
OVERRIDING SYSTEM VALUE VALUES
 (9101,9001,2,'created',NULL,'pending','Synthetic seed history'),
 (9102,9001,1,'status_changed','pending','in_progress','Admin đang xử lý'),
 (9103,9002,5,'created',NULL,'pending','Synthetic seed history'),
 (9104,9002,4,'status_changed','pending','resolved','Đã giải quyết')
ON CONFLICT (complaint_history_id) DO NOTHING;

INSERT INTO contact_requests(contact_request_id,property_id,room_id,requester_name,phone,email,message,status)
OVERRIDING SYSTEM VALUE VALUES
 (9201,12,111,'Khách mẫu','0000000991','visitor.one@example.test','Quan tâm phòng mẫu.','new'),
 (9202,21,NULL,'Khách mẫu 2','0000000992','visitor.two@example.test','Muốn được liên hệ về khu trọ.','contacted')
ON CONFLICT (contact_request_id) DO NOTHING;

INSERT INTO notifications(notification_id,account_id,notification_type,title,body,read_at)
OVERRIDING SYSTEM VALUE VALUES
 (9301,2,'invoice','Hóa đơn mẫu','Có hóa đơn cần thanh toán.',NULL),
 (9302,5,'complaint','Cập nhật khiếu nại','Khiếu nại mẫu đã được xử lý.',now()-interval '1 hour')
ON CONFLICT (notification_id) DO NOTHING;

INSERT INTO notification_preferences(account_id,new_invoice,overdue_invoice,expiring_contract,complaint_updates)
VALUES (1,true,true,true,true),(2,true,true,true,true),(5,true,true,true,true)
ON CONFLICT (account_id) DO NOTHING;

-- Advance identity sequences after deterministic IDs, so later generated IDs do not collide.
SELECT setval(pg_get_serial_sequence('owners','owner_id'), (SELECT MAX(owner_id) FROM owners), true);
SELECT setval(pg_get_serial_sequence('accounts','account_id'), (SELECT MAX(account_id) FROM accounts), true);
SELECT setval(pg_get_serial_sequence('account_invitations','invitation_id'), (SELECT MAX(invitation_id) FROM account_invitations), true);
SELECT setval(pg_get_serial_sequence('properties','property_id'), (SELECT MAX(property_id) FROM properties), true);
SELECT setval(pg_get_serial_sequence('rooms','room_id'), (SELECT MAX(room_id) FROM rooms), true);
SELECT setval(pg_get_serial_sequence('residents','resident_id'), (SELECT MAX(resident_id) FROM residents), true);
SELECT setval(pg_get_serial_sequence('contracts','contract_id'), (SELECT MAX(contract_id) FROM contracts), true);
SELECT setval(pg_get_serial_sequence('contract_documents','document_id'), (SELECT MAX(document_id) FROM contract_documents), true);
SELECT setval(pg_get_serial_sequence('room_residents','occupancy_id'), (SELECT MAX(occupancy_id) FROM room_residents), true);
SELECT setval(pg_get_serial_sequence('invoices','invoice_id'), (SELECT MAX(invoice_id) FROM invoices), true);
SELECT setval(pg_get_serial_sequence('payment_transactions','payment_transaction_id'), (SELECT MAX(payment_transaction_id) FROM payment_transactions), true);
SELECT setval(pg_get_serial_sequence('invoice_zalo_oa_send_logs','send_log_id'), (SELECT MAX(send_log_id) FROM invoice_zalo_oa_send_logs), true);
SELECT setval(pg_get_serial_sequence('amenities','amenity_id'), (SELECT MAX(amenity_id) FROM amenities), true);
SELECT setval(pg_get_serial_sequence('amenity_price_history','amenity_price_id'), (SELECT MAX(amenity_price_id) FROM amenity_price_history), true);
SELECT setval(pg_get_serial_sequence('amenity_subscriptions','subscription_id'), (SELECT MAX(subscription_id) FROM amenity_subscriptions), true);
SELECT setval(pg_get_serial_sequence('amenity_subscription_cycles','subscription_cycle_id'), (SELECT MAX(subscription_cycle_id) FROM amenity_subscription_cycles), true);
SELECT setval(pg_get_serial_sequence('parking_areas','parking_area_id'), (SELECT MAX(parking_area_id) FROM parking_areas), true);
SELECT setval(pg_get_serial_sequence('parking_slots','parking_slot_id'), (SELECT MAX(parking_slot_id) FROM parking_slots), true);
SELECT setval(pg_get_serial_sequence('vehicles','vehicle_id'), (SELECT MAX(vehicle_id) FROM vehicles), true);
SELECT setval(pg_get_serial_sequence('parking_slot_assignments','assignment_id'), (SELECT MAX(assignment_id) FROM parking_slot_assignments), true);
SELECT setval(pg_get_serial_sequence('complaints','complaint_id'), (SELECT MAX(complaint_id) FROM complaints), true);
SELECT setval(pg_get_serial_sequence('complaint_history','complaint_history_id'), (SELECT MAX(complaint_history_id) FROM complaint_history), true);
SELECT setval(pg_get_serial_sequence('contact_requests','contact_request_id'), (SELECT MAX(contact_request_id) FROM contact_requests), true);
SELECT setval(pg_get_serial_sequence('notifications','notification_id'), (SELECT MAX(notification_id) FROM notifications), true);

COMMIT;
