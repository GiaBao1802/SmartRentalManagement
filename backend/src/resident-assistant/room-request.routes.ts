import express from "express";
import {authenticateRequest,requireAdmin,requireResident,type AuthDependencies} from "../middleware/auth.js";
import {forbidden,validationError} from "../middleware/api-error.js";
import {parseBigIntId,sendJson} from "../utils/ids.js";
import {RoomRequestRepository,requestInput} from "./room-request.repository.js";
const id=(v:unknown)=>{try{return parseBigIntId(v);}catch{throw validationError("Mã không hợp lệ.");}};
export function createRoomRequestRouter(auth:AuthDependencies,repository:RoomRequestRepository){
  const r=express.Router(),resident=[authenticateRequest(auth),requireResident],admin=[authenticateRequest(auth),requireAdmin];
  r.get('/me/room-request-targets',...resident,async(req,res,next)=>{try{sendJson(res,200,{data:await repository.targets(req.auth!.ownerId!,req.auth!.residentId!)});}catch(e){next(e);}});
  r.post('/me/room-requests',...resident,async(req,res,next)=>{try{sendJson(res,201,{data:await repository.create(req.auth!.ownerId!,req.auth!.residentId!,req.auth!.accountId,requestInput(req.body))});}catch(e){next(e);}});
  r.get('/me/room-requests',...resident,async(req,res,next)=>{try{sendJson(res,200,{data:await repository.list(req.auth!.ownerId!,req.auth!.residentId!)});}catch(e){next(e);}});
  r.get('/room-requests',...admin,async(req,res,next)=>{try{sendJson(res,200,{data:await repository.list(req.auth!.ownerId!)});}catch(e){next(e);}});
  r.post('/room-requests/:id/decision',...admin,async(req,res,next)=>{try{
    const b=req.body;
    if(!b||Array.isArray(b)||Object.keys(b).some(k=>!['decision','reason'].includes(k))||!['APPROVE','REJECT','START'].includes(b.decision)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>1000)throw validationError("Chọn thao tác và nhập lý do từ 1 đến 1.000 ký tự.");
    sendJson(res,200,{data:await repository.decide(req.auth!.ownerId!,req.auth!.accountId,id(req.params.id),b.decision,b.reason.trim())});
  }catch(e){next(e);}});
  r.get('/rooms/:id/equipment',authenticateRequest(auth),async(req,res,next)=>{try{if(req.auth!.role==='superadmin')throw forbidden();sendJson(res,200,{data:await repository.equipment(req.auth!.ownerId!,id(req.params.id),req.auth!.role==='resident'?req.auth!.residentId:undefined)});}catch(e){next(e);}});
  return r;
}
