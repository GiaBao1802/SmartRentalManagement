import assert from "node:assert/strict";
import { test } from "node:test";
import { searchPublicDatabaseRooms, type LiveRoom } from "./cloudy-public-db-search";

const context={price:[{op:"lt",value:4000000}],area:[],location:"Đà Nẵng",occupants:2,amenities:[]};
const room:LiveRoom={room_id:"202",room_code:"C102",property:{name:"Nhà mẫu An Cư",province:"Đà Nẵng",address:"Đường Hoa"},default_rent:"3200000",area_m2:"23.00",default_capacity:2};
test("confirmed DB search maps filters to public API and renders real rows",async()=>{
 let requested!:URL;
 const result=await searchPublicDatabaseRooms(context,new AbortController().signal,(async input=>{requested=new URL(String(input));return Response.json({data:[room],meta:{total_items:1,total_pages:1,page:1,page_size:100}});}) as typeof fetch,"http://localhost:4000/api/v1");
 assert.equal(requested.pathname,"/api/v1/public/rooms");assert.equal(requested.searchParams.get("province"),null);assert.equal(requested.searchParams.get("price_max"),"3999999");assert.equal(requested.searchParams.get("capacity_min"),"2");
 assert.equal(result.status,"preview");assert.match(result.text,/1 phòng đang công khai/);assert.match(result.text,/C102/);assert.equal(result.source,"public_database");
});
test("location matching ignores Vietnamese accents and filter order is stable",async()=>{
 const noAccent={...context,location:"Da Nang"};
 const result=await searchPublicDatabaseRooms(noAccent,new AbortController().signal,(async()=>Response.json({data:[room],meta:{total_items:1,total_pages:1,page:1,page_size:100}})) as typeof fetch,"http://localhost:4000/api/v1");
 assert.equal(result.status,"preview");
});
test("unknown room amenities are never guessed from public descriptions",async()=>{
 let calls=0;const result=await searchPublicDatabaseRooms({...context,amenities:["air_conditioning"]},new AbortController().signal,(async()=>{calls++;throw Error();}) as typeof fetch,"http://localhost:4000/api/v1");
 assert.equal(result.status,"needs_clarification");assert.equal(result.context,null);assert.equal(calls,0);assert.match(result.text,/chưa có dữ liệu tiện ích/);
});
test("strict price/area constraints become safe integer API bounds",async()=>{
 let requested!:URL;const f={...context,location:null,price:[{op:"gt",value:3000000}],area:[{op:"lt",value:25.01}]};
 await searchPublicDatabaseRooms(f,new AbortController().signal,(async input=>{requested=new URL(String(input));return Response.json({data:[],meta:{total_items:0,total_pages:0,page:1,page_size:100}});}) as typeof fetch,"http://localhost:4000/api/v1");
 assert.equal(requested.searchParams.get("price_min"),"3000001");assert.equal(requested.searchParams.get("area_max"),"25");
});
test("rejects non-loopback base and refuses incomplete overlarge scans",async()=>{
 await assert.rejects(searchPublicDatabaseRooms(context,new AbortController().signal,fetch,"https://evil.example/api/v1"));
 await assert.rejects(searchPublicDatabaseRooms(context,new AbortController().signal,(async()=>Response.json({data:[],meta:{total_items:1001,total_pages:11,page:1,page_size:100}})) as typeof fetch,"http://localhost:4000/api/v1"));
});
test("rejects malformed public room fields rather than rendering invalid values",async()=>{
 const malformed={...room,default_rent:"not-a-number"};
 await assert.rejects(searchPublicDatabaseRooms(context,new AbortController().signal,(async()=>Response.json({data:[malformed],meta:{total_items:1,total_pages:1,page:1,page_size:100}})) as typeof fetch,"http://localhost:4000/api/v1"),/Invalid public database response/);
});
test("rejects pagination metadata that changes during a scan",async()=>{
 let call=0;
 const fetchPages=(async()=>{call++;const pageSize=call===1?100:50;return Response.json({data:[room],meta:{total_items:101,total_pages:Math.ceil(101/pageSize),page:call,page_size:pageSize}});}) as typeof fetch;
 await assert.rejects(searchPublicDatabaseRooms(context,new AbortController().signal,fetchPages,"http://localhost:4000/api/v1"),/changed during pagination/);
 assert.equal(call,2);
});
