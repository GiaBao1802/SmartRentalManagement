import test from 'node:test';import assert from 'node:assert/strict';
import {createLiveAdvisor} from './owner-advisor-live';
import {proposeOwnerScope} from './owner-chat-intent';
const invoice=(id:string,status='unpaid',periodEnd='2026-10-20')=>({invoice_id:id,invoice_no:`INV-${id}`,status,finalized_at:status==='draft'?null:periodEnd,due_date:'2026-10-25',period_start:'2026-09-21',period_end:periodEnd,is_overdue:true,total_amount:'1234567.89',contract:{room_id:'11',room_code:'P101',property:{name:'Khu A'}}});
function fixture(){const calls:string[]=[];const fetchImpl:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));calls.push(url.pathname+url.search);assert.equal((init?.headers as Record<string,string>).Cookie,'gt_session=test');assert.equal(init?.method,undefined);assert.equal(init?.redirect,'error');
 const path=url.pathname.replace('/api/v1','');
 if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
 if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'P101'}],meta:{total_pages:1}});
 if(path==='/invoices'&&url.searchParams.get('status')==='paid')return Response.json({data:[invoice('4','paid')],meta:{total_pages:1}});
 if(path==='/invoices')return Response.json({data:url.searchParams.get('page')==='1'?[invoice('1')]:[invoice('2','draft'),invoice('4','paid'),invoice('3','unpaid','2026-09-30')],meta:{total_pages:2}});
 if(path==='/notifications')return Response.json({data:url.searchParams.get('type')==='invoice_demo_payment'?[{title:'Hóa đơn được thanh toán (demo)',body:'INV-4 đã được đánh dấu Đã thanh toán. Mã giao dịch: DEMO-1793206220292-3A988AA3.',created_at:'2026-10-29T01:00:00.000Z'}]:[],meta:{total_pages:1}});
 if(path==='/invoices/1')return Response.json({data:{...invoice('1'),electricity_previous_kwh:'10',electricity_current_kwh:'20',electricity_amount:'30000',water_previous_m3:'1',water_current_m3:'3',water_amount:'20000',itemization_available:false,invoice_items:[]}});
 if(path==='/invoices/4')return Response.json({data:{...invoice('4','paid'),electricity_previous_kwh:'10',electricity_current_kwh:'20',electricity_amount:'30000',water_previous_m3:'1',water_current_m3:'3',water_amount:'20000',itemization_available:false,invoice_items:[]}});
 if(path==='/billing/workspace')return Response.json({data:[{contract_id:'c1',period:{period_end:'2026-10-20'},room:{room_code:'P101'},property:{name:'Khu A'},state:{label:'Thiếu dữ liệu'},missing_or_invalid:[{message:'Thiếu chỉ số điện'}]}],meta:{total_pages:1}});
 if(path==='/room-requests')return Response.json({data:[{complaint_id:'c1',room_id:'11',room_code:'P101',property_name:'Khu A',created_at:'2026-10-25',status:'pending',category:'Sự cố',content:'Rò nước'}]});
 if(path==='/properties/1/service-bookings')return Response.json({data:[{booking_id:'b1',room_code:'P101',service_name:'Máy giặt',service_date:'2026-10-29',start_time:'09:00',end_time:'10:00'}]});
 throw new Error('Unexpected endpoint '+path);
 };return {calls,client:createLiveAdvisor('gt_session=test; private=do-not-forward',fetchImpl)};}
test('live adapter follows all invoice pages, excludes drafts from debt and uses backend snapshot totals',async()=>{
 const {client,calls}=fixture();const catalog=await client.catalog();assert.equal(catalog.synthetic,false);assert.equal(catalog.rooms.length,1);
 const response=await client.answer({task:'unpaid',period:'2026-10',room:''});assert.equal(response.cards.length,1);assert.equal(response.cards[0].total,1234567.89);assert.ok(calls.some(p=>p.includes('page=2')));
 assert.equal(response.cards[0].status,'Chưa thanh toán · Quá hạn');assert.match(response.summary,/1 quá hạn, 0 đến hạn hôm nay, 0 còn hạn/);assert.match(response.summary,/Bản nháp và hóa đơn đã thanh toán không nằm trong danh sách/);assert.match(response.summary,/tháng 10\/2026/);
 const all=await client.answer({task:'invoices',period:'2026-10',room:''});assert.deepEqual(all.cards.map(card=>card.id),['1','2','4']);assert.match(all.summary,/3 hóa đơn trong tháng 10\/2026 theo ngày kết thúc kỳ/);assert.match(all.summary,/Bản nháp chưa phải khoản phải thu/);assert.ok(all.cards.some(card=>card.details.some(detail=>detail.includes('Bản nháp chưa phải khoản phải thu'))));assert.ok(all.cards.some(card=>card.status.includes('Đã thanh toán')));
 const empty=await client.answer({task:'unpaid',period:'2026-11',room:''});assert.equal(empty.cards.length,0);assert.match(empty.summary,/trong tháng 11\/2026/);assert.match(empty.summary,/xem tháng 10\/2026/);
 const paid=await client.answer({task:'paid',period:'2026-10',room:''});assert.equal(paid.cards.length,1);assert.equal(paid.cards[0].id,'4');assert.match(paid.summary,/1 hóa đơn đã thanh toán trong tháng 10\/2026/);
 const transaction=await client.answer({task:'transaction_lookup',period:'',room:'',transactionCode:'DEMO-1793206220292-3A988AA3'});assert.equal(transaction.cards.length,1);assert.equal(transaction.cards[0].href,'/admin/invoices/4');assert.match(transaction.cards[0].details.join(' '),/DEMO-1793206220292-3A988AA3/);assert.match(transaction.summary,/giao dịch mô phỏng/);
 const utilities=await client.answer({task:'utilities',period:'2026-10',room:''});assert.match(utilities.cards[0].details.join(' '),/không dựng thêm bậc giá/);assert.equal(utilities.cards[1].total,null);
});
test('missing and requests use canonical read endpoints, unknown room fails closed',async()=>{
 const {client,calls}=fixture();assert.equal((await client.answer({task:'missing',period:'2026-10',room:''})).cards.length,1);assert.ok(calls.some(path=>path.includes('/billing/workspace?')&&path.includes('page_size=20')));
 const r=await client.answer({task:'requests',period:'2026-10',room:'Khu A / P101 [11]'});assert.equal(r.cards.length,2);assert.deepEqual(r.cards.map(c=>c.href),['/admin/requests','/admin/services/flexible']);
 await assert.rejects(client.answer({task:'unpaid',period:'2026-10',room:'foreign'}),{status:404});
 const broken=createLiveAdvisor('gt_session=test',async()=>new Response('',{status:403}));await assert.rejects(broken.catalog(),{status:403});
});
test('resident statistics aggregate every resident page without returning personal details',async()=>{
 const calls:string[]=[];
 const fetchImpl:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));calls.push(url.pathname+url.search);const path=url.pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'P101'},{room_id:'12',room_code:'P102'}],meta:{total_pages:1}});
  if(path==='/residents'){
   const first=url.searchParams.get('page')==='1';
   return Response.json({data:first?[{resident_id:'1',full_name:'Private Name 1',residence_status:'living',residence_registration_status:'not_completed',room_residents:[{room_id:'11',status:'active'}]},{resident_id:'2',full_name:'Private Name 2',residence_status:'living',residence_registration_status:'temporary_resident',room_residents:[{room_id:'12',status:'active'}]}]:[{resident_id:'3',full_name:'Private Name 3',residence_status:'left',residence_registration_status:'temporary_absence',room_residents:[]}],meta:{total_pages:2}});
  }
  throw new Error('Unexpected endpoint '+path);
 };
 const client=createLiveAdvisor('gt_session=test',fetchImpl);
 const all=await client.answer({task:'residents',period:'2026-10',room:''});
 assert.match(all.summary,/2 cư dân đang ở, 1 hồ sơ đã rời đi/);assert.match(all.summary,/1 người chưa hoàn tất đăng ký/);assert.equal(JSON.stringify(all).includes('Private Name'),false);assert.ok(calls.some(path=>path.includes('page=2')));
 const room=await client.answer({task:'residents',period:'2026-10',room:'Khu A / P101 [11]'});assert.match(room.summary,/1 cư dân đang ở/);assert.match(room.summary,/1 người chưa hoàn tất/);
});
test('vacant-room list uses effective backend status and includes safe room details only',async()=>{
 const fetchImpl:typeof fetch=async(input)=>{
  const url=new URL(String(input));const path=url.pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A',province:'Đồng Nai'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[
   {room_id:'11',room_code:'A01',status:'available',area_m2:'22.00',default_rent:'2500000'},
   {room_id:'12',room_code:'A02',status:'occupied',area_m2:'24.00',default_rent:'2700000'},
   {room_id:'13',room_code:'A03',status:'inactive',area_m2:'20.00',default_rent:'2300000'},
  ],meta:{total_pages:1}});
  throw new Error('Unexpected endpoint '+path);
 };
 const client=createLiveAdvisor('gt_session=test',fetchImpl);
 const result=await client.answer({task:'available_rooms',period:'',room:''});
 assert.equal(result.cards.length,1);assert.equal(result.cards[0].room,'A01');assert.equal(result.cards[0].status,'Còn trống');
 assert.match(result.cards[0].details.join(' '),/22\.00 m²/);assert.match(result.cards[0].details.join(' '),/2\.500\.000 đ\/tháng/);
 assert.match(result.summary,/Có 1 phòng đang còn trống trên 1 khu trọ/);
});
test('live owner insights rank finalized electricity use and current parking assignments',async()=>{
 const calls:string[]=[];
 const fetchImpl:typeof fetch=async(input)=>{
  const url=new URL(String(input));const path=url.pathname.replace('/api/v1','');calls.push(path);
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A',province:'Đồng Nai'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied',area_m2:'22',default_rent:'2500000'},{room_id:'12',room_code:'A02',status:'occupied',area_m2:'24',default_rent:'2700000'}],meta:{total_pages:1}});
  if(path==='/properties/1/parking-assignments')return Response.json({data:[
   {assignment_id:'1',vehicle_id:'v1',room_id:'11',status:'active'}, {assignment_id:'2',vehicle_id:'v2',room_id:'11',status:'active'},
   {assignment_id:'3',vehicle_id:'v3',room_id:'12',status:'active'}, {assignment_id:'4',vehicle_id:'v4',room_id:'12',status:'ended'},
  ]});
  if(path==='/invoices')return Response.json({data:[
   {invoice_id:'i1',period_start:'2026-09-21',period_end:'2026-10-20',finalized_at:'2026-10-20',contract:{room_id:'11',room_code:'A01',property:{name:'Khu A'}}},
   {invoice_id:'i2',period_start:'2026-09-21',period_end:'2026-10-20',finalized_at:'2026-10-20',contract:{room_id:'12',room_code:'A02',property:{name:'Khu A'}}},
   {invoice_id:'i3',period_start:'2026-09-21',period_end:'2026-10-20',finalized_at:null,contract:{room_id:'12',room_code:'A02',property:{name:'Khu A'}}},
  ],meta:{total_pages:1}});
  if(path==='/invoices/i1')return Response.json({data:{electricity_previous_kwh:'100',electricity_current_kwh:'260'}});
  if(path==='/invoices/i2')return Response.json({data:{electricity_previous_kwh:'20',electricity_current_kwh:'80'}});
  throw new Error('Unexpected endpoint '+path);
 };
 const client=createLiveAdvisor('gt_session=test',fetchImpl);
 const vehicles=await client.answer({task:'vehicle_counts',period:'',room:''});
 assert.deepEqual(vehicles.cards.map(card=>[card.room,card.status]),[['A01','2 xe đang được phân công'],['A02','1 xe đang được phân công']]);
 const electricity=await client.answer({task:'electricity_ranking',period:'2026-10',room:''});
 assert.deepEqual(electricity.cards.map(card=>[card.room,card.status]),[['A01','160 kWh'],['A02','60 kWh']]);
 assert.match(electricity.summary,/hóa đơn đã chốt/);assert.equal(calls.includes('/invoices/i3'),false);
 const lowest=await client.answer({task:'electricity_lowest',period:'2026-10',room:''});
 assert.deepEqual(lowest.cards.map(card=>[card.room,card.status]),[['A02','60 kWh'],['A01','160 kWh']]);assert.match(lowest.summary,/lượng điện thấp nhất/);
});
test('owner insight tasks return water ranking, open-only requests, per-room resident aggregates, and a vehicle total',async()=>{
 const calls:string[]=[];
 const fetchImpl:typeof fetch=async(input)=>{
  const url=new URL(String(input));const path=url.pathname.replace('/api/v1','');calls.push(path);
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied'},{room_id:'12',room_code:'A02',status:'occupied'}],meta:{total_pages:1}});
  if(path==='/properties/1/parking-assignments')return Response.json({data:[
   {assignment_id:'1',vehicle_id:'v1',room_id:'11',status:'active'}, {assignment_id:'2',vehicle_id:'v2',room_id:'11',status:'active'},
   {assignment_id:'3',vehicle_id:'v3',room_id:'12',status:'active'}, {assignment_id:'4',vehicle_id:'v4',room_id:'12',status:'ended'},
  ]});
  if(path==='/invoices')return Response.json({data:[
   {invoice_id:'w1',period_end:'2026-09-30',finalized_at:'2026-09-30',contract:{room_id:'11'}},
   {invoice_id:'w2',period_end:'2026-09-30',finalized_at:'2026-09-30',contract:{room_id:'12'}},
   {invoice_id:'w3',period_end:'2026-09-30',finalized_at:null,contract:{room_id:'12'}},
  ],meta:{total_pages:1}});
  if(path==='/invoices/w1')return Response.json({data:{water_previous_m3:'1',water_current_m3:'9'}});
  if(path==='/invoices/w2')return Response.json({data:{water_previous_m3:'1',water_current_m3:'12.2'}});
  if(path==='/room-requests')return Response.json({data:[
   {complaint_id:'r1',room_id:'11',status:'pending',content:'Private phone 0900000001'},
   {complaint_id:'r2',room_id:'12',status:'in_progress',content:'Private phone 0900000002'},
   ...['resolved','resolved','resolved','rejected','resolved'].map((status,index)=>({complaint_id:`r${index+3}`,room_id:'11',status,content:'Closed request'})),
   ...Array.from({length:93},(_,index)=>({complaint_id:`cap-${index}`,room_id:'11',status:'resolved',content:'Closed request'})),
  ]});
  if(path==='/residents')return Response.json({data:[
   {resident_id:'private-1',full_name:'Private Name 1',residence_status:'living',residence_registration_status:'not_completed',room_residents:[{room_id:'11',status:'active'}]},
   {resident_id:'private-2',full_name:'Private Name 2',residence_status:'living',residence_registration_status:'not_completed',room_residents:[{room_id:'11',status:'active'}]},
   {resident_id:'private-3',full_name:'Private Name 3',residence_status:'living',residence_registration_status:'temporary_resident',room_residents:[{room_id:'12',status:'active'}]},
  ],meta:{total_pages:1}});
  throw new Error('Unexpected endpoint '+path);
 };
 const client=createLiveAdvisor('gt_session=test',fetchImpl);
 const water=await client.answer({task:'water_ranking',period:'2026-09',room:''});
 assert.deepEqual(water.cards.map(card=>[card.room,card.status]),[['A02','11,2 m³'],['A01','8 m³']]);assert.match(water.summary,/hóa đơn đã chốt/);assert.equal(calls.includes('/invoices/w3'),false);
 const open=await client.answer({task:'open_requests',period:'',room:''});
 assert.match(open.summary,/2 yêu cầu\/khiếu nại phòng đang mở: 1 chờ xử lý và 1 đang xử lý/);assert.match(open.summary,/Không tính các trạng thái đã giải quyết/);assert.match(open.summary,/giới hạn 100 yêu cầu gần nhất/);assert.equal(JSON.stringify(open).includes('Private phone'),false);
 const total=await client.answer({task:'vehicle_total',period:'',room:''});assert.match(total.summary,/Có 3 xe có phân công/);assert.match(total.summary,/không phải xếp hạng/);
 const residentRanking=await client.answer({task:'resident_ranking',period:'',room:''});assert.deepEqual(residentRanking.cards.map(card=>[card.room,card.status]),[['A01','2 cư dân đang ở'],['A02','1 cư dân đang ở']]);assert.equal(JSON.stringify(residentRanking).includes('Private Name'),false);
 const registration=await client.answer({task:'resident_registration_by_room',period:'',room:''});assert.deepEqual(registration.cards.map(card=>[card.room,card.status]),[['A01','2 cư dân chưa hoàn tất đăng ký']]);assert.equal(JSON.stringify(registration).includes('Private Name'),false);
});
test('frequent-request ranking discloses its backend list limit',async()=>{
 const fetchImpl:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied'}],meta:{total_pages:1}});
  if(path==='/room-requests')return Response.json({data:[{complaint_id:'1',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Hư hỏng',content:'Rò nước',created_at:'2026-10-20',status:'pending'}]});
  throw new Error('Unexpected endpoint '+path);
 };
 const result=await createLiveAdvisor('gt_session=test',fetchImpl).answer({task:'frequent_requests',period:'2026-10',room:''});
 assert.equal(result.cards.length,1);assert.match(result.summary,/tối đa 100 yêu cầu gần nhất/);
});
test('feedback count reports only Owner-scoped room requests in selected month and discloses coverage',async()=>{
 const fetchImpl:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied'}],meta:{total_pages:1}});
  if(path==='/room-requests')return Response.json({data:[
   {complaint_id:'1',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Góp ý',content:'Thêm máy giặt',created_at:'2026-10-20',status:'pending'},
   {complaint_id:'2',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Báo hỏng',content:'Rò nước',created_at:'2026-09-20',status:'resolved'},
  ]});
  throw new Error('Unexpected endpoint '+path);
 };
 const result=await createLiveAdvisor('gt_session=test',fetchImpl).answer({task:'feedback_messages',period:'2026-10',room:''});
 assert.match(result.summary,/Có 1 phản hồi từ khách trong tháng 10\/2026/);
 assert.equal(result.cards.length,1);assert.equal(result.cards[0]?.amountLabel,'Phản hồi từ khách');
});
test('Owner billing overview uses backend readiness states instead of unpaid invoice rows',async()=>{
 const calls:string[]=[];
 const fetchImpl:typeof fetch=async(input)=>{const url=new URL(String(input));const path=url.pathname.replace('/api/v1','');calls.push(url.pathname+url.search);
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied'},{room_id:'12',room_code:'A02',status:'occupied'},{room_id:'13',room_code:'A03',status:'occupied'}],meta:{total_pages:1}});
  if(path==='/billing/workspace')return Response.json({data:[
   {contract_id:'c1',period:{period_end:'2026-10-20'},room:{room_code:'A01'},property:{name:'Khu A'},state:{code:'MISSING_DATA',label:'Thiếu dữ liệu'},missing_or_invalid:[{message:'Chưa nhập chỉ số điện cuối kỳ.'}]},
   {contract_id:'c2',period:{period_end:'2026-10-25'},room:{room_code:'A02'},property:{name:'Khu A'},state:{code:'READY_TO_FINALIZE',label:'Sẵn sàng chốt'},missing_or_invalid:[]},
   {contract_id:'c3',period:{period_end:'2026-10-28'},room:{room_code:'A03'},property:{name:'Khu A'},state:{code:'FINALIZED_UNPAID',label:'Đã chốt · chưa thanh toán'},missing_or_invalid:[]},
   {contract_id:'c4',period:{period_end:'2026-09-30'},room:{room_code:'A04'},property:{name:'Khu A'},state:{code:'MISSING_DATA',label:'Thiếu dữ liệu'},missing_or_invalid:[{message:'Thiếu chỉ số nước.'}]},
  ],meta:{total_pages:1}});
  throw new Error('Unexpected endpoint '+path);
 };
 const response=await createLiveAdvisor('gt_session=test',fetchImpl).answer({task:'overview',period:'2026-10',room:''});
 assert.deepEqual(response.cards.map(card=>[card.room,card.status]),[['A01','Thiếu dữ liệu'],['A02','Sẵn sàng chốt']]);
 assert.match(response.cards[0]!.details.join(' '),/Chưa nhập chỉ số điện/);assert.match(response.summary,/2 kỳ hóa đơn cần kiểm tra trong tháng 10\/2026/);assert.equal(JSON.stringify(response).includes('FINALIZED_UNPAID'),false);assert.ok(calls.some(path=>path.includes('page_size=20')));
});
test('request questions filter open state, amenity content, common areas, and optional month',async()=>{
 const fetchImpl:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'A01',status:'occupied'}],meta:{total_pages:1}});
  if(path==='/room-requests')return Response.json({data:[
   {complaint_id:'1',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Yêu cầu bổ sung thiết bị',content:'Bổ sung máy giặt cho phòng.',created_at:'2026-10-20',status:'pending'},
   {complaint_id:'2',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Khiếu nại / yêu cầu',content:'Đèn hành lang hỏng, gọi 0912345678.',created_at:'2026-10-21',status:'in_progress'},
   {complaint_id:'3',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Khiếu nại / yêu cầu',content:'Cửa cổng khu trọ khép chưa kín.',created_at:'2026-09-20',status:'resolved'},
   {complaint_id:'4',room_id:'11',room_code:'A01',property_name:'Khu A',category:'Hóa đơn',content:'Hỏi tiền điện.',created_at:'2026-10-22',status:'pending'},
  ]});
  throw new Error('Unexpected endpoint '+path);
 };
 const client=createLiveAdvisor('gt_session=test',fetchImpl);
 const open=await client.answer({task:'open_requests',period:'2026-10',room:''});assert.match(open.summary,/3 yêu cầu\/khiếu nại phòng đang mở/);
 const actionable=await client.answer({task:'actionable_requests',period:'2026-10',room:''});assert.equal(actionable.cards.length,3);assert.equal(JSON.stringify(actionable).includes('0912345678'),false);
 const amenity=await client.answer({task:'amenity_requests',period:'',room:''});assert.equal(amenity.cards.length,1);assert.match(amenity.cards[0]!.details.join(' '),/máy giặt/);
 const common=await client.answer({task:'common_area_requests',period:'',room:''});assert.equal(common.cards.length,2);assert.ok(common.cards.every(card=>/hành lang|cổng khu trọ/i.test(card.details.join(' '))));assert.equal(JSON.stringify(common).includes('0912345678'),false);
});
test('property count is owner scoped and backend errors retain safe diagnostics',async()=>{
 const successful:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'},{property_id:'2',name:'Khu B'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms'||path==='/properties/2/rooms')return Response.json({data:[],meta:{total_pages:1}});
  throw new Error('Unexpected endpoint '+path);
 };
 const propertyTotal=await createLiveAdvisor('gt_session=test',successful).answer({task:'property_total',period:'',room:''});assert.match(propertyTotal.summary,/đang quản lý 2 khu trọ/);
 const failing:typeof fetch=async(input)=>{const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
  if(path==='/properties/1/rooms')return Response.json({data:[],meta:{total_pages:1}});
  if(path==='/billing/workspace')return Response.json({error:{message:'Backend chưa sẵn sàng',request_id:'req-123'}},{status:503});
  throw new Error('Unexpected endpoint '+path);
 };
 await assert.rejects(createLiveAdvisor('gt_session=test',failing).answer({task:'missing',period:'2026-10',room:''}),error=>error instanceof Error&&error.message.includes('/billing/workspace')&&error.message.includes('Backend chưa sẵn sàng')&&error.message.includes('req-123'));
});
test('live room-code duplicates require explicit clarification',()=>{
 const base={tasks:{unpaid:'Chưa đóng'},periods:['2026-10'],asOf:'2026-10-28',rooms:['Khu A / P101 [11]']};
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',base).room,base.rooms[0]);
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',{...base,rooms:[...base.rooms,'Khu B / P101 [22]']}).room,null);
});
