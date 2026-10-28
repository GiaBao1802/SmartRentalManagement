import test from 'node:test';import assert from 'node:assert/strict';
import {createLiveAdvisor} from './owner-advisor-live';
import {proposeOwnerScope} from './owner-chat-intent';
const invoice=(id:string,status='unpaid')=>({invoice_id:id,status,finalized_at:status==='draft'?null:'2026-10-20',period_start:'2026-09-21',period_end:'2026-10-20',due_date:'2026-10-25',is_overdue:true,total_amount:'1234567.89',contract:{room_code:'P101',property:{name:'Khu A'}}});
function fixture(){const calls:string[]=[];const fetchImpl:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));calls.push(url.pathname+url.search);assert.equal((init?.headers as Record<string,string>).Cookie,'gt_session=test');assert.equal(init?.method,undefined);assert.equal(init?.redirect,'error');
 const path=url.pathname.replace('/api/v1','');
 if(path==='/properties')return Response.json({data:[{property_id:'1',name:'Khu A'}],meta:{total_pages:1}});
 if(path==='/properties/1/rooms')return Response.json({data:[{room_id:'11',room_code:'P101'}],meta:{total_pages:1}});
 if(path==='/invoices')return Response.json({data:url.searchParams.get('page')==='1'?[invoice('1')]:[invoice('2','draft')],meta:{total_pages:2}});
 if(path==='/invoices/1')return Response.json({data:{...invoice('1'),electricity_previous_kwh:'10',electricity_current_kwh:'20',electricity_amount:'30000',water_previous_m3:'1',water_current_m3:'3',water_amount:'20000',itemization_available:false,invoice_items:[]}});
 if(path==='/billing/workspace')return Response.json({data:[{contract_id:'c1',period:{period_end:'2026-10-20'},room:{room_code:'P101'},property:{name:'Khu A'},state:{label:'Thiếu dữ liệu'},missing_or_invalid:[{message:'Thiếu chỉ số điện'}]}],meta:{total_pages:1}});
 if(path==='/room-requests')return Response.json({data:[{complaint_id:'c1',room_id:'11',room_code:'P101',property_name:'Khu A',created_at:'2026-10-25',status:'pending',category:'Sự cố',content:'Rò nước'}]});
 if(path==='/properties/1/service-bookings')return Response.json({data:[{booking_id:'b1',room_code:'P101',service_name:'Máy giặt',service_date:'2026-10-29',start_time:'09:00',end_time:'10:00'}]});
 throw new Error('Unexpected endpoint '+path);
 };return {calls,client:createLiveAdvisor('gt_session=test; private=do-not-forward',fetchImpl)};}
test('live adapter follows all invoice pages, excludes drafts from debt and uses backend snapshot totals',async()=>{
 const {client,calls}=fixture();const catalog=await client.catalog();assert.equal(catalog.synthetic,false);assert.equal(catalog.rooms.length,1);
 const response=await client.answer({task:'unpaid',period:'2026-10',room:''});assert.equal(response.cards.length,1);assert.equal(response.cards[0].total,1234567.89);assert.ok(calls.some(p=>p.includes('page=2')));
 const utilities=await client.answer({task:'utilities',period:'2026-10',room:''});assert.match(utilities.cards[0].details.join(' '),/không dựng thêm bậc giá/);assert.equal(utilities.cards[1].total,null);
});
test('missing and requests use canonical read endpoints, unknown room fails closed',async()=>{
 const {client}=fixture();assert.equal((await client.answer({task:'missing',period:'2026-10',room:''})).cards.length,1);
 const r=await client.answer({task:'requests',period:'2026-10',room:'Khu A / P101 [11]'});assert.equal(r.cards.length,2);assert.deepEqual(r.cards.map(c=>c.href),['/admin/requests','/admin/services/flexible']);
 await assert.rejects(client.answer({task:'unpaid',period:'2026-10',room:'foreign'}),{status:404});
 const broken=createLiveAdvisor('gt_session=test',async()=>new Response('',{status:403}));await assert.rejects(broken.catalog(),{status:403});
});
test('live room-code duplicates require explicit clarification',()=>{
 const base={tasks:{unpaid:'Chưa đóng'},periods:['2026-10'],asOf:'2026-10-28',rooms:['Khu A / P101 [11]']};
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',base).room,base.rooms[0]);
 assert.equal(proposeOwnerScope('P101 tháng 10','unpaid',{...base,rooms:[...base.rooms,'Khu B / P101 [22]']}).room,null);
});
