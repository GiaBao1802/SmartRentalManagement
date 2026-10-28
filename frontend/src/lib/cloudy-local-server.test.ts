import assert from "node:assert/strict";
import { test } from "node:test";
import { handleCloudyChat } from "./cloudy-local-server";

function request(body: unknown = { message: "Phòng dưới 3 triệu" }, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/cloudy/chat", { method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
const reply = { text: "PHÒNG GIẢ LẬP", synthetic: true as const, model: "qwen3:1.7b" as const, status: "preview" };
test("Cloudy local route rejects production and foreign origins before calling AI", async () => {
  const never = async () => { throw new Error("must not run"); };
  assert.equal((await handleCloudyChat(request(), never, "production")).status,404);
  assert.equal((await handleCloudyChat(request({}, "https://foreign.example"), never, "development")).status,403);
});
test("Cloudy local route validates shape, size and message", async () => {
  let calls=0; const run=async()=>{calls++;return reply;};
  for(const body of [[],null,{message:1},{message:" "},{message:"x".repeat(501)},{message:"test",history:[]},{message:"test",model:"other"}]) assert.equal((await handleCloudyChat(request(body),run,"development")).status,400);
  assert.equal((await handleCloudyChat(request({message:"x".repeat(5000)}),run,"development")).status,413);
  assert.equal(calls,0);
});
test("Cloudy forwards only trimmed message and cancellation signal; no cache", async () => {
  const response=await handleCloudyChat(request({message:"  tìm phòng  "}),async(message,signal)=>{assert.equal(message,"tìm phòng");assert.ok(signal instanceof AbortSignal);return reply;},"development");
  assert.deepEqual(await response.json(),reply);assert.equal(response.headers.get("cache-control"),"no-store");
});
test("Cloudy limits concurrent inference and releases busy flag after failure", async () => {
  let release!:()=>void;let started!:()=>void;
  const entered=new Promise<void>(r=>{started=r;});const gate=new Promise<void>(r=>{release=r;});
  const first=handleCloudyChat(request(),async()=>{started();await gate;throw new Error("private path");},"development");
  await entered;assert.equal((await handleCloudyChat(request(),async()=>reply,"development")).status,429);
  release();const response=await first;assert.equal(response.status,503);assert.ok(!(await response.text()).includes("private path"));
  assert.equal((await handleCloudyChat(request(),async()=>reply,"development")).status,200);
});

test("continue requires validated context; new rejects old context", async () => {
 const context={price:[{op:"lt",value:4000000}],area:[],location:"Bến Nắng",occupants:null,amenities:[]};
 for(const body of [{message:"thêm máy lạnh",mode:"continue"},{message:"phòng",mode:"new",context},{message:"phòng",mode:"invalid"},{message:"phòng",mode:"continue",context:{...context,occupants:-1}}]) assert.equal((await handleCloudyChat(request(body),async()=>reply,"development")).status,400);
 const response=await handleCloudyChat(request({message:"thêm máy lạnh",mode:"continue",context}),async(_message,_signal,options)=>{assert.deepEqual(options,{mode:"continue",context});return reply;},"development");
 assert.equal(response.status,200);
});

test("confirmation validates exact body and forwards only explicit filters", async()=>{
 const context={price:[],area:[],location:null,occupants:null,amenities:[]};let calls=0;
 for(const body of [{action:"confirm"},{action:"confirm",context:{}},{action:"confirm",context,message:"extra"},{message:"phòng",action:"execute"}]) assert.equal((await handleCloudyChat(request(body),async()=>{calls++;return reply;},"development")).status,400);
 assert.equal(calls,0);
 const response=await handleCloudyChat(request({action:"confirm",context}),async(message,_signal,options)=>{assert.equal(message,"");assert.deepEqual(options,{action:"confirm",context});return reply;},"development");assert.equal(response.status,200);
});
