import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir=new URL('../../data/room-ai/v1/',import.meta.url);
const data=JSON.parse(await readFile(new URL('rooms.json',dir)));
const {rooms,properties}=data;
test('300 distinct synthetic rooms with valid property references',()=>{
 assert.equal(rooms.length,300);assert.equal(properties.length,60);
 assert.equal(new Set(rooms.map(r=>r.id)).size,300);
 for(const r of rooms){assert.equal(r.synthetic,true);assert.ok(properties.some(p=>p.id===r.property_id));assert.ok(r.area_m2>=12);assert.ok(r.capacity>=1&&r.capacity<=5);}
});
test('cost estimates match documented room-wide usage, with parking null handled',()=>{
 for(const r of rooms){const p=r.pricing,a=p.estimate_assumptions;
 assert.equal(p.estimated_expenses_vnd,a.electricity_kwh*p.electricity_per_kwh_vnd+a.water_m3*p.water_per_m3_vnd+p.internet_vnd+p.service_vnd+a.vehicles*(p.parking_per_vehicle_vnd??0));
 assert.equal(p.estimated_total_month_vnd,p.rent_per_room_month_vnd+p.estimated_expenses_vnd);assert.equal(p.estimate_is_quote,false);
 assert.equal(p.parking_per_vehicle_vnd!==null,r.features.includes('parking'));}
});
test('policies are consistent with amenities and preserve missing hours',()=>{
 for(const r of rooms){assert.equal(r.rules.cooking==='allowed',r.features.includes('cooking'));assert.equal(r.rules.pets.allowed,r.features.includes('pets'));assert.equal(r.environment.flood_history,null);
 if(r.access.mode==='curfew'){assert.match(r.access.gate_closes,/^\d{2}:\d{2}$/);assert.ok(r.access.gate_opens<r.access.gate_closes);}
 else {assert.equal(r.access.gate_closes,null);assert.equal(r.access.gate_opens,null);}
 if(r.features.includes('step_free'))assert.equal(r.floor,0);
 if(r.availability.status==='available_later')assert.ok(r.availability.available_from>r.availability.as_of);}
});
test('diversity covers themes, gate policies, rent bands and unavailable/unknown cases',()=>{
 assert.equal(new Set(rooms.map(r=>r.theme)).size,12);assert.equal(new Set(rooms.map(r=>r.access.mode)).size,4);
 assert.equal(new Set(rooms.map(r=>r.availability.status)).size,4);
 assert.ok(rooms.some(r=>r.pricing.rent_per_room_month_vnd<2000000));assert.ok(rooms.some(r=>r.pricing.rent_per_room_month_vnd>6000000));
 assert.ok(rooms.some(r=>r.travel_minutes.campus.motorbike===null));
 for(const f of Object.keys(data.feature_labels))assert.ok(rooms.some(r=>r.features.includes(f)),f);
});
test('1200 grounded chat examples split by property without train/evaluation overlap',async()=>{
 const seenRooms=new Set(),seenProperties=new Set();let count=0;
 for(const [split,expected]of [['train',720],['validation',240],['test',240]]){
 const rows=(await readFile(new URL(split+'.jsonl',dir),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.length,expected);count+=rows.length;
 const propIds=new Set(),roomIds=new Set();
 for(const x of rows){assert.equal(x.split,split);assert.equal(x.messages.length,3);const room=rooms.find(r=>r.id===x.room_id);assert.ok(room);assert.equal(room.split,split);assert.equal(room.property_id,x.property_id);assert.ok(x.messages[1].content.includes(JSON.stringify(room)));roomIds.add(x.room_id);propIds.add(x.property_id);}
 for(const id of roomIds){assert.ok(!seenRooms.has(id));seenRooms.add(id);}for(const id of propIds){assert.ok(!seenProperties.has(id));seenProperties.add(id);}
 assert.equal(new Set(rooms.filter(r=>r.split===split).map(r=>r.theme)).size,12);
 }assert.equal(count,1200);
});
test('all distributed files match manifest hashes',async()=>{
 const m=JSON.parse(await readFile(new URL('manifest.json',dir)));for(const [f,h]of Object.entries(m.sha256))assert.equal(createHash('sha256').update(await readFile(new URL(f,dir))).digest('hex'),h,f);
});
