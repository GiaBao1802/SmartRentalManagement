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
 const empty=await client.answer({task:'unpaid',period:'2026-11',room:''});assert.equal(empty.cards.length,0);assert.match(empty.summary,/trong tháng 11\/2026/);assert.match(empty.summary,/xem tháng 10\/2026/);
 const paid=await client.answer({task:'paid',period:'2026-10',room:''});assert.equal(paid.cards.length,1);assert.equal(paid.cards[0].id,'4');assert.match(paid.summary,/1 hóa đơn đã thanh toán trong tháng 10\/2026/);
 const transaction=await client.answer({task:'transaction_lookup',period:'',room:'',transactionCode:'DEMO-1793206220292-3A988AA3'});assert.equal(transaction.cards.length,1);assert.equal(transaction.cards[0].href,'/admin/invoices/4');assert.match(transaction.cards[0].details.join(' '),/DEMO-1793206220292-3A988AA3/);assert.match(transaction.summary,/giao dịch mô phỏng/);
 const utilities=await client.answer({task:'utilities',period:'2026-10',room:''});assert.match(utilities.cards[0].details.join(' '),/không dựng thêm bậc giá/);assert.equal(utilities.cards[1].total,null);
});
test('missing and requests use canonical read endpoints, unknown room fails closed',async()=>{
 const {client}=fixture();assert.equal((await client.answer({task:'missing',period:'2026-10',room:''})).cards.length,1);
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
test('live room-code duplicates require explicit clarification',()=>{
 const base={tasks:{unpaid:'Chưa đóng'},periods:['2026-10'],asOf:'2026-10-28',rooms:['Khu A / P101 [11]']};
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',base).room,base.rooms[0]);
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',{...base,rooms:[...base.rooms,'Khu B / P101 [22]']}).room,null);
});
