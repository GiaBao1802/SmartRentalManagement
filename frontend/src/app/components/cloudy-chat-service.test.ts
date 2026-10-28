import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOUDY_CHAT_MAX_LENGTH, createLocalCloudyChatService, createMockCloudyChatService, normalizeCloudyChatInput } from "./cloudy-chat-service";

test("Cloudy rejects blank and overlong text, but trims valid input", () => {
  assert.equal(normalizeCloudyChatInput("  \n  "), null);
  assert.equal(normalizeCloudyChatInput(`x`.repeat(CLOUDY_CHAT_MAX_LENGTH + 1)), null);
  assert.equal(normalizeCloudyChatInput("  Xin chào  "), "Xin chào");
});

test("mock reply is explicitly labeled and never claims room data", async () => {
  const reply = await createMockCloudyChatService(0).send("Xin chào", [], new AbortController().signal);
  assert.match(reply, /^MÔ PHỎNG:/);
  assert.match(reply, /chưa kết nối với dữ liệu nhà trọ hoặc AI/);
});

test("mock failure can be retried without duplicating the request", async () => {
  const service = createMockCloudyChatService(0);
  await assert.rejects(service.send("/mock-error", [], new AbortController().signal));
  assert.match(await service.send("/mock-error", [], new AbortController().signal), /^MÔ PHỎNG:/);
});

test("local chat displays the server failure reason instead of blaming Ollama", async () => {
  const service = createLocalCloudyChatService((async () => Response.json({ error: "PUBLIC_API_UNAVAILABLE", message: "Không kết nối được API phòng công khai hoặc database." }, { status: 503 })) as typeof fetch);
  await assert.rejects(service.send("tìm phòng", [], signal()), /API phòng công khai hoặc database/);
});

test("aborting a pending mock response prevents a late reply", async () => {
  const service = createMockCloudyChatService(1000);
  const controller = new AbortController();
  const response = service.send("Xin chào", [], controller.signal);
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
});

const context={price:[{op:"lt",value:4000000}],area:[],location:"Bến Nắng",occupants:null,amenities:[]};
const response=(status="awaiting_confirmation", filters: unknown=context)=>Response.json({text:"Tin phòng",source:"public_database",status,context:filters});
const signal=()=>new AbortController().signal;

test("prepare sends only current request and does not commit context before confirmation", async()=>{
 const bodies: unknown[]=[];
 const service=createLocalCloudyChatService((async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return response();}) as typeof fetch);
 await service.send(" phòng ",[{id:"old",role:"user",text:"private history",createdAt:""}],signal());
 assert.deepEqual(bodies,[{message:"phòng",mode:"new"}]);
 assert.equal(service.hasProposal?.(),true);assert.equal(service.hasContext?.(),false);
});

test("only explicit confirmation commits exact proposed filters and enables continuation",async()=>{
 const bodies: any[]=[];
 const service=createLocalCloudyChatService((async(_url,options)=>{const body=JSON.parse(String(options?.body));bodies.push(body);return response(body.action==="confirm"?"preview":"awaiting_confirmation");}) as typeof fetch);
 await assert.rejects(service.confirm!(signal()));
 await service.send("phòng",[],signal());await service.confirm!(signal());
 assert.deepEqual(bodies[1],{action:"confirm",context});assert.equal(service.hasContext?.(),true);assert.equal(service.hasProposal?.(),false);
 await service.send("thêm máy lạnh",[],signal(),"continue");assert.deepEqual(bodies[2],{message:"thêm máy lạnh",mode:"continue",context});
});

test("editing invalidates proposal; late preparation cannot restore it",async()=>{
 let release!:(r:Response)=>void;
 const service=createLocalCloudyChatService((()=>new Promise<Response>(r=>{release=r;})) as typeof fetch);
 const pending=service.send("phòng",[],signal());const rejected=assert.rejects(pending,{name:"AbortError"});
 service.discardProposal!();release(response());await rejected;
 assert.equal(service.hasProposal?.(),false);await assert.rejects(service.confirm!(signal()));
});

test("new request invalidates previous proposal even when new request fails",async()=>{
 let count=0;const service=createLocalCloudyChatService((async()=>++count===1?response():Response.json({}, {status:503})) as typeof fetch);
 await service.send("phòng",[],signal());await assert.rejects(service.send("sửa",[],signal()));
 assert.equal(service.hasProposal?.(),false);await assert.rejects(service.confirm!(signal()));
});

test("clarification and unexpected direct results cannot become confirmable",async()=>{
 for(const r of [response("needs_clarification",null),response("preview"),Response.json({text:"unlabelled",source:"public_database"})]) {
  const service=createLocalCloudyChatService((async()=>r) as typeof fetch);
  await service.send("phòng",[],signal()).catch(()=>{});
  assert.equal(service.hasProposal?.(),false);assert.equal(service.hasContext?.(),false);
 }
});

test("cancelled confirmation cannot commit; retry uses the same proposal",async()=>{
 let count=0;let release!:(r:Response)=>void;const bodies:any[]=[];
 const service=createLocalCloudyChatService((async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));count++;return count===2?new Promise<Response>(r=>{release=r;}):response(count===1?"awaiting_confirmation":"preview");}) as typeof fetch);
 await service.send("phòng",[],signal());const controller=new AbortController();
 const pending=service.confirm!(controller.signal);const rejected=assert.rejects(pending,{name:"AbortError"});controller.abort();release(response("preview"));await rejected;
 assert.equal(service.hasContext?.(),false);assert.equal(service.hasProposal?.(),true);
 await service.confirm!(signal());assert.deepEqual(bodies[1],bodies[2]);assert.equal(service.hasContext?.(),true);
});

test("sessions isolate proposals and filters; changed confirmation filters are rejected",async()=>{
 let count=0;const first=createLocalCloudyChatService((async()=>++count===1?response():response("preview",{...context,location:"khác"})) as typeof fetch);
 const second=createLocalCloudyChatService();await first.send("phòng",[],signal());
 assert.equal(second.hasProposal?.(),false);await assert.rejects(second.confirm!(signal()));await assert.rejects(first.confirm!(signal()));assert.equal(first.hasContext?.(),false);
});
