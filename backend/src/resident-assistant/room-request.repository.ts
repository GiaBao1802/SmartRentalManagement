import {Prisma,type PrismaClient} from "@prisma/client";
import {ApiError,validationError} from "../middleware/api-error.js";

export const EQUIPMENT = {FRIDGE:"Tủ lạnh",AIR_CONDITIONER:"Máy lạnh",WASHING_MACHINE:"Máy giặt",WATER_HEATER:"Máy nước nóng",BED:"Giường",WARDROBE:"Tủ quần áo",DESK:"Bàn học / làm việc"} as const;
export type EquipmentCode=keyof typeof EQUIPMENT;
export function requestInput(b:any){
  if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["occupancy_id","request_key","equipment_code","content"].includes(k)))throw validationError();
  if(typeof b.occupancy_id!=="string"||!/^[1-9]\d{0,17}$/.test(b.occupancy_id))throw validationError("Chọn phòng đang ở.");
  if(typeof b.request_key!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.request_key))throw validationError("Mã yêu cầu không hợp lệ.");
  if(b.equipment_code!==null && (typeof b.equipment_code!=="string"||!Object.hasOwn(EQUIPMENT,b.equipment_code)))throw validationError("Chọn thiết bị trong danh sách hoặc khiếu nại khác.");
  if(typeof b.content!=="string"||b.content.trim().length<5||b.content.trim().length>5000)throw validationError("Nội dung từ 5 đến 5.000 ký tự.");
  return {occupancyId:BigInt(b.occupancy_id),requestKey:b.request_key.toLowerCase(),equipmentCode:b.equipment_code as EquipmentCode|null,content:b.content.trim()};
}
const missing=()=>new ApiError(404,"NOT_FOUND","Không tìm thấy phòng hoặc yêu cầu trong phạm vi của bạn.");
const conflict=(text:string)=>new ApiError(409,"CONFLICT",text);
const today=Prisma.sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
const active=Prisma.sql`rr.status='active' AND rr.started_at<=${today} AND (rr.ended_at IS NULL OR rr.ended_at>=${today}) AND ct.status='active' AND ct.start_date<=${today} AND ct.end_date>=${today}`;
type Context={occupancy_id:bigint;room_id:bigint;property_id:bigint;contract_id:bigint;resident_id:bigint;room_code:string;property_name:string};
async function context(tx:Prisma.TransactionClient,ownerId:bigint,residentId:bigint,occupancyId:bigint){
  const rows=await tx.$queryRaw<Context[]>`SELECT rr.occupancy_id,rr.room_id,rr.property_id,rr.contract_id,rr.resident_id FROM room_residents rr JOIN contracts ct ON ct.contract_id=rr.contract_id AND ct.owner_id=rr.owner_id AND ct.room_id=rr.room_id WHERE rr.owner_id=${ownerId} AND rr.resident_id=${residentId} AND rr.occupancy_id=${occupancyId} AND ${active} FOR UPDATE OF rr,ct`;
  return rows[0];
}
export class RoomRequestRepository{
  constructor(private readonly db:PrismaClient){}
  async targets(ownerId:bigint,residentId:bigint){
    const rooms=await this.db.$queryRaw<Context[]>`SELECT rr.occupancy_id,rr.room_id,rr.property_id,rr.contract_id,rr.resident_id,r.room_code,p.name AS property_name FROM room_residents rr JOIN contracts ct ON ct.contract_id=rr.contract_id AND ct.owner_id=rr.owner_id AND ct.room_id=rr.room_id JOIN rooms r ON r.room_id=rr.room_id JOIN properties p ON p.property_id=rr.property_id WHERE rr.owner_id=${ownerId} AND rr.resident_id=${residentId} AND ${active} ORDER BY r.room_code,rr.occupancy_id LIMIT 100`;
    const equipment=await this.db.$queryRaw<Array<{room_id:bigint;equipment_code:EquipmentCode}>>`SELECT e.room_id,e.equipment_code FROM room_equipment e WHERE e.owner_id=${ownerId} AND EXISTS(SELECT 1 FROM room_residents rr WHERE rr.room_id=e.room_id AND rr.resident_id=${residentId} AND rr.owner_id=${ownerId} AND rr.status='active')`;
    return {rooms:rooms.map(r=>({...r,equipment:equipment.filter(e=>e.room_id===r.room_id).map(e=>({code:e.equipment_code,name:EQUIPMENT[e.equipment_code]}))})),equipment_options:Object.entries(EQUIPMENT).map(([code,name])=>({code,name}))};
  }
  async create(ownerId:bigint,residentId:bigint,accountId:bigint,input:ReturnType<typeof requestInput>){
    return this.db.$transaction(async tx=>{
      // A retry key serializes duplicate sends even if the client changes its selected room.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestKey},0))`;
      const prior=await tx.$queryRaw<Array<{complaint_id:bigint;owner_id:bigint;resident_id:bigint;occupancy_id:bigint;equipment_code:EquipmentCode|null;content:string;status:string}>>`SELECT c.complaint_id,c.owner_id,c.resident_id,x.occupancy_id,x.equipment_code,c.content,c.status FROM complaint_room_requests x JOIN complaints c ON c.complaint_id=x.complaint_id WHERE x.request_key=${input.requestKey}::uuid`;
      if(prior[0]){
        const r=prior[0];
        if(r.owner_id!==ownerId||r.resident_id!==residentId||r.occupancy_id!==input.occupancyId||r.equipment_code!==input.equipmentCode||r.content!==input.content)throw conflict("Mã gửi lại không khớp nội dung yêu cầu.");
        return {complaint_id:r.complaint_id,status:r.status};
      }
      const room=await context(tx,ownerId,residentId,input.occupancyId);if(!room)throw missing();
      await tx.$queryRaw`SELECT room_id FROM rooms WHERE room_id=${room.room_id} AND owner_id=${ownerId} FOR UPDATE`;
      if(input.equipmentCode){
        const existing=await tx.$queryRaw`SELECT 1 FROM room_equipment WHERE room_id=${room.room_id} AND equipment_code=${input.equipmentCode}`;
        if((existing as unknown[]).length)throw conflict("Phòng đã có thiết bị này trong danh sách được xác nhận.");
        const pending=await tx.$queryRaw`SELECT 1 FROM complaints c JOIN complaint_room_requests x ON x.complaint_id=c.complaint_id WHERE c.owner_id=${ownerId} AND c.room_id=${room.room_id} AND c.status IN ('pending','in_progress') AND x.equipment_code=${input.equipmentCode}`;
        if((pending as unknown[]).length)throw conflict("Phòng đã có yêu cầu bổ sung thiết bị này đang chờ xử lý.");
      }
      const c=await tx.complaint.create({data:{ownerId,residentId,roomId:room.room_id,propertyId:room.property_id,category:input.equipmentCode?"Yêu cầu bổ sung thiết bị":"Khiếu nại / yêu cầu",content:input.content,status:"pending"}});
      await tx.$executeRaw`INSERT INTO complaint_room_requests(complaint_id,occupancy_id,request_key,equipment_code) VALUES(${c.complaintId},${input.occupancyId},${input.requestKey}::uuid,${input.equipmentCode})`;
      await tx.complaintHistory.create({data:{complaintId:c.complaintId,actorAccountId:accountId,action:"created",toStatus:"pending",note:input.equipmentCode?`Yêu cầu bổ sung ${EQUIPMENT[input.equipmentCode]}. Chưa cập nhật phòng.`:"Khách gửi khiếu nại / yêu cầu."}});
      const admins=await tx.account.findMany({where:{ownerId,role:"admin",status:"active"},select:{accountId:true}});
      if(admins.length)await tx.notification.createMany({data:admins.map(a=>({accountId:a.accountId,notificationType:"resident_feedback",title:"Yêu cầu mới từ khách thuê",body:`${c.category}: ${input.content.slice(0,400)}`}))});
      return {complaint_id:c.complaintId,status:c.status};
    },{timeout:15000});
  }
  async list(ownerId:bigint,residentId?:bigint){
    const where={ownerId,...(residentId===undefined?{}:{residentId})};
    const rows=await this.db.complaint.findMany({where,include:{room:{select:{roomCode:true}},property:{select:{name:true}},history:{orderBy:[{createdAt:"asc"},{complaintHistoryId:"asc"}]}},orderBy:{createdAt:"desc"},take:100});
    const details=await this.db.$queryRaw<Array<{complaint_id:bigint;equipment_code:EquipmentCode|null}>>(Prisma.sql`SELECT x.complaint_id,x.equipment_code FROM complaint_room_requests x JOIN complaints c ON c.complaint_id=x.complaint_id WHERE c.owner_id=${ownerId} ${residentId===undefined?Prisma.empty:Prisma.sql`AND c.resident_id=${residentId}`}`);
    return rows.map(c=>{const x=details.find(x=>x.complaint_id===c.complaintId);return {complaint_id:c.complaintId,room_id:c.roomId,property_id:c.propertyId,room_code:c.room?.roomCode??null,property_name:c.property.name,category:c.category,content:c.content,status:c.status,created_at:c.createdAt,equipment_code:x?.equipment_code??null,equipment_name:x?.equipment_code?EQUIPMENT[x.equipment_code]:null,history:c.history.map(h=>({action:h.action,from_status:h.fromStatus,to_status:h.toStatus,note:h.note,created_at:h.createdAt}))};});
  }
  async decide(ownerId:bigint,accountId:bigint,id:bigint,decision:"APPROVE"|"REJECT"|"START",reason:string){
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT complaint_id FROM complaints WHERE complaint_id=${id} AND owner_id=${ownerId} FOR UPDATE`;
      const c=await tx.complaint.findFirst({where:{complaintId:id,ownerId}});if(!c)throw missing();
      const target=decision==="APPROVE"?"resolved":decision==="REJECT"?"rejected":"in_progress";
      if(c.status===target)return {complaint_id:id,status:target};
      if(!["pending","in_progress"].includes(c.status)||decision==="START"&&c.status!=="pending")throw conflict("Yêu cầu đã xử lý, không thể đổi quyết định.");
      const [detail]=await tx.$queryRaw<Array<{occupancy_id:bigint;equipment_code:EquipmentCode|null}>>`SELECT occupancy_id,equipment_code FROM complaint_room_requests WHERE complaint_id=${id}`;
      let note=reason;
      if(decision==="APPROVE"&&detail?.equipment_code){
        const room=await context(tx,ownerId,c.residentId,detail.occupancy_id);
        if(!room||room.room_id!==c.roomId||room.property_id!==c.propertyId)throw conflict("Khách không còn ở phòng theo yêu cầu này. Không tự cập nhật phòng.");
        await tx.$queryRaw`SELECT room_id FROM rooms WHERE room_id=${room.room_id} AND owner_id=${ownerId} FOR UPDATE`;
        await tx.$executeRaw`INSERT INTO room_equipment(room_id,property_id,owner_id,equipment_code,source_complaint_id,confirmed_by_account_id) VALUES(${room.room_id},${room.property_id},${ownerId},${detail.equipment_code},${id},${accountId}) ON CONFLICT(room_id,equipment_code) DO NOTHING`;
        note=`Đã xác nhận phòng có ${EQUIPMENT[detail.equipment_code]}. ${reason}`;
      }
      await tx.complaint.update({where:{complaintId:id},data:{status:target,resolvedAt:target==="resolved"?new Date():null,updatedAt:new Date()}});
      await tx.complaintHistory.create({data:{complaintId:id,actorAccountId:accountId,action:"status_changed",fromStatus:c.status,toStatus:target,note}});
      const accounts=await tx.account.findMany({where:{residentId:c.residentId,role:"resident",status:"active"},select:{accountId:true}});
      if(accounts.length)await tx.notification.createMany({data:accounts.map(a=>({accountId:a.accountId,notificationType:"resident_feedback",title:"Chủ trọ đã xử lý yêu cầu",body:`${c.category}: ${target==="resolved"?"Đã giải quyết":target==="rejected"?"Đã từ chối":"Đang xử lý"}. ${note.slice(0,400)}`}))});
      return {complaint_id:id,status:target};
    },{timeout:15000});
  }
  async equipment(ownerId:bigint,roomId:bigint,residentId?:bigint){
    const room=await this.db.room.findFirst({where:{ownerId,roomId,...(residentId===undefined?{}:{roomResidents:{some:{residentId,status:"active",endedAt:null}}})},select:{roomId:true}});if(!room)throw missing();
    const rows=await this.db.$queryRaw<Array<{equipment_code:EquipmentCode;confirmed_at:Date}>>`SELECT equipment_code,confirmed_at FROM room_equipment WHERE room_id=${roomId} AND owner_id=${ownerId} ORDER BY equipment_code`;
    return rows.map(r=>({code:r.equipment_code,name:EQUIPMENT[r.equipment_code],confirmed_at:r.confirmed_at}));
  }
}
