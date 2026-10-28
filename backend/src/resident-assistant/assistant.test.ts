import assert from "node:assert/strict";
import {test} from "node:test";
import express from "express";
import sharp from "sharp";
import {createServer} from "node:http";
import {loadEnv} from "../config/env.js";
import {InMemorySessionStore,createOpaqueSessionToken,hashSessionToken} from "../auth/session-store.js";
import {createSessionRecord} from "../middleware/auth.js";
import {makeCsrfToken} from "../middleware/csrf.js";
import {errorHandler} from "../middleware/error-handler.js";
import {createV1Router} from "../auth/v1.router.js";
import {meterInput} from "./meter.repository.js";
import {classifyResidentMessage,contextualResidentFollowup,isExplicitEquipmentRequest,isExplicitResidentComplaint,isInvoiceLocationQuestion,isInvoiceQuestion,isMeterSubmissionQuestion,isServiceBookingQuestion,isServiceCatalogQuestion,needsAmenityChoice,normalizeMeterImage,ocrCandidate,parseResidentContext,residentAssistantReply,residentContextualReply} from "./assistant.routes.js";

test("Cloudy recognizes invoice location questions in Vietnamese",()=>{
  for(const message of ["hóa đơn ở địa điểm nào","hóa đơn này thuộc phòng nào","hóa đơn ở đâu"]){assert.equal(isInvoiceLocationQuestion(message),true,message);}
  assert.equal(isInvoiceLocationQuestion("Tôi muốn gửi chỉ số điện nước"),false);
});
test("Cloudy routes rent and invoice amount questions to read-only invoice lookup",()=>{
  for(const message of ["Tiền phòng tháng này của tôi bao nhiêu?","Tôi cần trả bao nhiêu tiền thuê?","Hóa đơn kỳ này đã thanh toán chưa?","Tiền điện tháng này là bao nhiêu?","Tôi muốn xem điện nước","Cho tôi xem tiền điện nước tháng này"]){assert.equal(isInvoiceQuestion(message),true,message);}
  for(const message of ["Tôi muốn gửi chỉ số điện nước","Chụp ảnh đồng hồ nước để gửi chủ trọ","Gửi chỉ số cho hóa đơn tháng này"]){assert.equal(isInvoiceQuestion(message),false,message);}
  assert.match(residentAssistantReply("invoice"),/chỉ là tra cứu/i);
  assert.match(residentAssistantReply("invoice"),/không gửi chỉ số/i);
});
test("Cloudy clarifies broad amenity requests and routes amenity browsing",()=>{
  assert.equal(needsAmenityChoice("Tôi muốn thêm tiện ích"),true);
  assert.equal(needsAmenityChoice("Tôi muốn bổ sung thêm dịch vụ"),true);
  assert.equal(needsAmenityChoice("Tôi muốn thêm tủ lạnh"),false);
  assert.equal(isServiceCatalogQuestion("Tôi muốn xem tiện ích"),true);
  assert.equal(isServiceCatalogQuestion("Nhà trọ của tôi có dịch vụ tiện ích nào?"),true);
  assert.equal(isServiceCatalogQuestion("Khu trọ đang có những dịch vụ gì?"),true);
  assert.match(residentAssistantReply("amenity_choice"),/xem\/đặt tiện ích/i);
  assert.match(residentAssistantReply("amenity_choice"),/bổ sung thiết bị/i);
  assert.equal(isExplicitEquipmentRequest("Tôi muốn đề nghị chủ trọ bổ sung thiết bị cho phòng"),true);
  assert.equal(isExplicitEquipmentRequest("Tôi muốn thêm tủ lạnh cho phòng"),true);
  assert.equal(isExplicitEquipmentRequest("Tôi muốn xem tiện ích đang có"),false);
});
test("Resident can answer the amenity clarification naturally in chat",async()=>{
  assert.equal(await classifyResidentMessage("Tôi muốn xem tiện ích đang có"),"services");
  assert.equal(await classifyResidentMessage("Tôi muốn đề nghị chủ trọ bổ sung thiết bị cho phòng"),"requests");
});
test("Cloudy routes clear service booking and registration phrases away from complaints",()=>{
  for(const message of ["Đặt lịch giặt đồ","Tôi muốn đăng ký dịch vụ wifi","Book tiện ích hồ bơi","Tối nay mình đặt giờ dùng hồ bơi được không?"]){assert.equal(isServiceBookingQuestion(message),true,message);}
  assert.equal(isServiceBookingQuestion("Tủ lạnh hỏng, báo chủ trọ"),false);
});
test("Resident help asks the user to clarify in chat",()=>{
  assert.doesNotMatch(residentAssistantReply("help"),/chọn mục hỗ trợ bên dưới/i);
});
test("Cloudy carries only a bounded topic into clear resident follow-ups",async()=>{
  assert.equal(contextualResidentFollowup("còn cái nào nữa?","services"),"services");
  assert.equal(contextualResidentFollowup("vậy phòng đó thì sao?","requests"),"requests");
  assert.equal(contextualResidentFollowup("tháng này thì sao?","invoice"),"invoice");
  assert.equal(contextualResidentFollowup("còn cái nào nữa?",null),null);
  assert.equal(contextualResidentFollowup("Tôi cần vay tiền", "invoice"),null);
  assert.equal(await classifyResidentMessage("còn cái nào nữa?","services"),"services");
  assert.equal(await classifyResidentMessage("Tôi muốn xem hóa đơn ở đâu","services"),"invoice");
  assert.equal(parseResidentContext({last_intent:"meter"}),"meter");
  assert.throws(()=>parseResidentContext({last_intent:"invoice",room_id:"123"}));
  assert.throws(()=>parseResidentContext({last_intent:"write_invoice"}));
  assert.match(residentContextualReply("requests"),/chưa tạo yêu cầu mới/i);
  assert.match(residentContextualReply("services"),/chưa gửi yêu cầu đặt lịch/i);
  assert.match(residentContextualReply("invoice"),/chưa thanh toán/i);
});
test("explicit meter submissions route to review UI without implying submission",()=>{
  for(const message of ["Gửi chỉ số điện nước","Chụp ảnh đồng hồ nước để gửi chủ trọ","Cách gửi chỉ số điện"]){assert.equal(isMeterSubmissionQuestion(message),true,message);}
  assert.equal(isMeterSubmissionQuestion("Hóa đơn tiền điện tháng này bao nhiêu?"),false);
  assert.match(residentAssistantReply("meter"),/kiểm tra chỉ số trước khi gửi/i);
});
test("Cloudy deterministically routes an explicit room complaint to the resident request flow",()=>{
  for(const message of ["Tôi muốn khiếu nại phòng 302 không đổ rác","Phòng 201 bị rò nước, tôi muốn báo sự cố","Báo hỏng máy giặt ở phòng tôi"]){assert.equal(isExplicitResidentComplaint(message),true,message);}
  assert.equal(isExplicitResidentComplaint("Tôi muốn xem hóa đơn phòng 302"),false);
  assert.match(residentAssistantReply("requests"),/xác nhận gửi/i);
});
test("Cloudy clearly asks for clarification instead of guessing when it does not understand",()=>{
  assert.match(residentAssistantReply("help"),/chưa hiểu/i);
  assert.match(residentAssistantReply("help"),/nói rõ hơn/i);
});

test("meter input rejects client scope, negative/excess precision and arbitrary image URLs",async()=>{
  const input={invoice_id:"1",utility:"WATER",reading:"10.125",image:""};
  assert.equal(meterInput(input).reading,"10.125");
  for(const reading of ["-1","1.1234","1e3","NaN","1000000000"]){assert.throws(()=>meterInput({...input,reading}));}
  assert.throws(()=>meterInput({...input,owner_id:"2"}));
  await assert.rejects(normalizeMeterImage("https://example.com/a.jpg"));
  await assert.rejects(normalizeMeterImage("data:image/jpeg;base64,YmFk"));
});
test("OCR only suggests one unambiguous numeric candidate; normalized image is JPEG",async()=>{
  assert.equal(ocrCandidate("12345.678 kWh"),"12345.678");
  assert.equal(ocrCandidate("meter 2026 12345.678"),null);
  assert.equal(ocrCandidate("unreadable"),null);
  const png=await sharp({create:{width:30,height:30,channels:3,background:"white"}}).png().toBuffer();
  const normalized=await normalizeMeterImage(`data:image/png;base64,${png.toString("base64")}`);
  assert.equal((await sharp(normalized).metadata()).format,"jpeg");
});
test("HTTP auth, CSRF, role, session revocation and server-derived scope",async()=>{
  const config=loadEnv({NODE_ENV:"test",DATABASE_URL:"postgresql://unused/unused",FRONTEND_ORIGIN:"http://localhost:3000",SESSION_SECRET:"resident-assistant-test-secret-long-enough"});
  const sessions=new InMemorySessionStore();
  const records:any[]=[{accountId:1n,role:"admin",status:"active",ownerId:10n,residentId:null,owner:{ownerId:10n,displayName:"A"},resident:null,email:"a@test.invalid",phone:null},{accountId:2n,role:"resident",status:"active",ownerId:null,residentId:20n,owner:null,resident:{residentId:20n,ownerId:10n,fullName:"R"},email:"r@test.invalid",phone:null}];
  const calls:any[]=[];
  const repository:any={assertReady:async()=>{},targets:async(...args:any[])=>{calls.push(args);return[];},list:async(...args:any[])=>{calls.push(args);return[];}};
  const authRepository={findCandidates:async()=>[],findCurrentAccount:async(id:bigint)=>records.find(r=>r.accountId===id)??null};
  const app=express();app.use(express.json());app.use("/api/v1",createV1Router({config,sessions,repository:authRepository,meterSubmissionRepository:repository}));app.use(errorHandler);
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  async function headers(accountId:bigint){const token=createOpaqueSessionToken(),csrf=makeCsrfToken(config.sessionSecret);const hash=hashSessionToken(token,config.sessionSecret);await sessions.set(createSessionRecord(accountId,hash,config));return{hash,headers:{Cookie:`gt_session=${token}; gt_csrf=${csrf}`,Origin:config.frontendOrigin,"X-CSRF-Token":csrf,"Content-Type":"application/json"}};}
  try{
    const a=await headers(1n),r=await headers(2n);
    assert.equal((await fetch(`${base}/me/meter-targets`)).status,401);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:a.headers})).status,403);
    assert.equal((await fetch(`${base}/meter-submissions`,{headers:r.headers})).status,403);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:r.headers})).status,200);
    assert.deepEqual(calls.pop(),[10n,20n]);
    const invoiceQuestion=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"hóa đơn ở địa điểm nào"})});
    assert.equal(invoiceQuestion.status,200);
    assert.equal((await invoiceQuestion.json() as any).data.intent,"invoice");
    const utilityLookup=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Tôi muốn xem điện nước"})});
    assert.equal(utilityLookup.status,200);
    assert.equal((await utilityLookup.json() as any).data.intent,"invoice");
    const roomComplaint=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Tôi muốn khiếu nại phòng 302 không đổ rác"})});
    assert.equal(roomComplaint.status,200);
    assert.equal((await roomComplaint.json() as any).data.intent,"requests");
    const amenityQuestion=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Tôi muốn thêm tiện ích"})});
    assert.equal(amenityQuestion.status,200);
    assert.equal((await amenityQuestion.json() as any).data.intent,"amenity_choice");
    const amenityList=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Tôi muốn xem tiện ích"})});
    assert.equal(amenityList.status,200);
    assert.equal((await amenityList.json() as any).data.intent,"services");
    const serviceBooking=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Đặt lịch giặt đồ"})});
    assert.equal(serviceBooking.status,200);
    assert.equal((await serviceBooking.json() as any).data.intent,"services");
    const contextualFollowup=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"còn cái nào nữa?",context:{last_intent:"services"}})});
    assert.equal(contextualFollowup.status,200);
    const contextualData=(await contextualFollowup.json() as any).data;
    assert.equal(contextualData.intent,"services");assert.equal(contextualData.contextual,true);assert.match(contextualData.text,/chưa gửi yêu cầu đặt lịch/i);
    const contextOverride=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"Tôi muốn xem hóa đơn ở đâu",context:{last_intent:"services"}})});
    assert.equal(contextOverride.status,200);
    const explicitData=(await contextOverride.json() as any).data;
    assert.equal(explicitData.intent,"invoice");assert.equal(explicitData.contextual,false);
    const requestFollowup=await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"vậy phòng đó sửa chưa?",context:{last_intent:"requests"}})});
    assert.equal(requestFollowup.status,200);
    const requestFollowupData=(await requestFollowup.json() as any).data;
    assert.equal(requestFollowupData.intent,"requests");assert.equal(requestFollowupData.contextual,true);assert.match(requestFollowupData.text,/chưa tạo yêu cầu mới/i);
    assert.equal((await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"còn cái nào nữa?",context:{last_intent:"services",room_id:"999"}})})).status,400);
    assert.equal((await fetch(`${base}/me/assistant/chat`,{method:"POST",headers:r.headers,body:JSON.stringify({message:"còn cái nào nữa?",history:["full chat"]})})).status,400);
    assert.equal((await fetch(`${base}/meter-submissions`,{headers:a.headers})).status,200);
    assert.deepEqual(calls.pop(),[10n]);
    assert.equal((await fetch(`${base}/me/meter-submissions`,{method:"POST",headers:{Cookie:r.headers.Cookie,"Content-Type":"application/json"},body:"{}"})).status,403);
    assert.equal((await fetch(`${base}/me/meter-submissions`,{method:"POST",headers:r.headers,body:JSON.stringify({owner_id:"999"})})).status,400);
    for(const path of ["/me/assistant/chat","/me/meter-ocr","/me/meter-submissions"]){assert.equal((await fetch(base+path,{method:"POST",headers:a.headers,body:"{}"})).status,403);}
    await sessions.revoke(r.hash);
    assert.equal((await fetch(`${base}/me/meter-targets`,{headers:r.headers})).status,401);
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
