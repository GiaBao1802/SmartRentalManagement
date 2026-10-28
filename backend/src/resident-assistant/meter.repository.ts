import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError, validationError } from "../middleware/api-error.js";
import { resolveMeterContinuity } from "../invoices/meter-continuity.resolver.js";
import { PrismaMeterContinuityRepository } from "../invoices/meter-continuity.repository.js";

export type Utility = "ELECTRICITY" | "WATER";
export function meterInput(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["invoice_id","utility","reading","image"].includes(k))) throw validationError("Dữ liệu gửi không hợp lệ.");
  if (typeof body.invoice_id !== "string" || !/^[1-9]\d{0,17}$/.test(body.invoice_id)) throw validationError("Chọn kỳ hóa đơn.");
  if (!["ELECTRICITY","WATER"].includes(body.utility)) throw validationError("Chọn điện hoặc nước.");
  if (typeof body.reading !== "string" || !/^\d{1,9}(\.\d{1,3})?$/.test(body.reading)) throw validationError("Chỉ số không âm, tối đa 3 số thập phân.");
  return { invoiceId: BigInt(body.invoice_id), utility: body.utility as Utility, reading: body.reading };
}
const missing = () => new ApiError(404,"NOT_FOUND","Không tìm thấy yêu cầu hoặc kỳ hóa đơn hợp lệ.");
const conflict = (message: string) => new ApiError(409,"CONFLICT",message);
type Tx = Prisma.TransactionClient;
type Submission = { submission_id: bigint; invoice_id: bigint; resident_id: bigint; utility: Utility; reading: Prisma.Decimal; previous_draft_reading: Prisma.Decimal | null; status: string; image_sha256: string };
const today = Prisma.sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
async function eligible(tx: Tx | PrismaClient, ownerId: bigint, residentId: bigint, invoiceId?: bigint) {
  return tx.$queryRaw<Array<{ invoice_id: bigint; contract_id: bigint; room_id: bigint; property_id: bigint; room_code: string; property_name: string; period_start: Date; period_end: Date }>>(Prisma.sql`
    SELECT DISTINCT i.invoice_id,i.contract_id,c.room_id,i.property_id,r.room_code,p.name AS property_name,i.period_start,i.period_end
    FROM invoices i JOIN contracts c ON c.contract_id=i.contract_id AND c.owner_id=i.owner_id
    JOIN room_residents rr ON rr.contract_id=c.contract_id AND rr.room_id=c.room_id AND rr.owner_id=c.owner_id
    JOIN rooms r ON r.room_id=c.room_id JOIN properties p ON p.property_id=c.property_id
    WHERE i.owner_id=${ownerId} AND rr.resident_id=${residentId} AND rr.status='active'
      AND rr.started_at<=${today} AND (rr.ended_at IS NULL OR rr.ended_at>=${today})
      AND c.status='active' AND c.start_date<=${today} AND c.end_date>=${today}
      AND i.status='draft' AND i.finalized_at IS NULL
      ${invoiceId === undefined ? Prisma.empty : Prisma.sql`AND i.invoice_id=${invoiceId}`}
    ORDER BY i.period_end DESC,i.invoice_id DESC LIMIT 50`);
}
async function validateReading(tx: Tx, ownerId: bigint, invoice: any, utility: Utility, reading: string) {
  const result = await resolveMeterContinuity(new PrismaMeterContinuityRepository(tx), { ownerId, contractId: invoice.contractId, utilityType: utility, invoicePeriodStart: invoice.periodStart });
  if (result.status !== "RESOLVED") throw conflict("Thiếu chỉ số đầu kỳ hợp lệ. Chủ trọ cần kiểm tra hợp đồng.");
  if (new Prisma.Decimal(reading).lt(result.openingReading)) throw validationError("Chỉ số mới nhỏ hơn chỉ số đầu kỳ.");
}
export class MeterSubmissionRepository {
  constructor(private readonly db: PrismaClient) {}
  async assertReady() {
    const [row]=await this.db.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public.resident_meter_submissions') IS NOT NULL AND to_regclass('public.resident_service_bookings') IS NOT NULL AND to_regclass('public.auth_sessions') IS NOT NULL AS ready`;
    if(!row?.ready) throw new ApiError(503,"FEATURE_NOT_READY","Chức năng đang chờ hoàn tất nâng cấp dữ liệu. Vui lòng liên hệ chủ trọ.");
  }
  targets(ownerId: bigint, residentId: bigint) { return eligible(this.db, ownerId, residentId); }
  async submit(ownerId: bigint, residentId: bigint, input: ReturnType<typeof meterInput>, image: Buffer) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE invoice_id=${input.invoiceId} AND owner_id=${ownerId} FOR UPDATE`;
      const [target] = await eligible(tx,ownerId,residentId,input.invoiceId);
      if (!target) throw missing();
      const invoice = await tx.invoice.findFirstOrThrow({where:{invoiceId:input.invoiceId,ownerId}});
      await validateReading(tx,ownerId,invoice,input.utility,input.reading);
      const hash = createHash("sha256").update(image).digest("hex");
      const existing = await tx.$queryRaw<Submission[]>`SELECT submission_id,invoice_id,resident_id,utility,reading,previous_draft_reading,status,image_sha256 FROM resident_meter_submissions WHERE invoice_id=${input.invoiceId} AND utility=${input.utility} AND status='PENDING'`;
      if (existing[0]) {
        const row=existing[0];
        if (row.resident_id===residentId && row.image_sha256===hash && new Prisma.Decimal(row.reading).eq(input.reading)) return {submission_id:row.submission_id,status:row.status};
        throw conflict("Kỳ này đã có yêu cầu chỉ số đang chờ chủ trọ duyệt.");
      }
      const previous = input.utility==='ELECTRICITY' ? invoice.electricityCurrentKwh : invoice.waterCurrentM3;
      const [row] = await tx.$queryRaw<Array<{submission_id:bigint;status:string}>>`INSERT INTO resident_meter_submissions(owner_id,property_id,room_id,contract_id,resident_id,invoice_id,utility,reading,previous_draft_reading,image_bytes,image_sha256)
        VALUES(${ownerId},${target.property_id},${target.room_id},${target.contract_id},${residentId},${input.invoiceId},${input.utility},${new Prisma.Decimal(input.reading)},${previous},${image},${hash}) RETURNING submission_id,status`;
      return row;
    });
  }
  async list(ownerId: bigint,residentId?: bigint) {
    return this.db.$queryRaw(Prisma.sql`SELECT s.submission_id,s.invoice_id,s.utility,s.reading::text,s.status,s.decision_note,s.created_at,s.decision_at,r.room_code,p.name AS property_name,i.period_start,i.period_end
      FROM resident_meter_submissions s JOIN rooms r ON r.room_id=s.room_id JOIN properties p ON p.property_id=s.property_id JOIN invoices i ON i.invoice_id=s.invoice_id
      WHERE s.owner_id=${ownerId} ${residentId===undefined ? Prisma.empty : Prisma.sql`AND s.resident_id=${residentId}`}
      ORDER BY (s.status='PENDING') DESC,s.created_at DESC LIMIT 100`);
  }
  async image(ownerId: bigint,id: bigint,residentId?: bigint) {
    const rows=await this.db.$queryRaw<Array<{image_bytes:Buffer}>>(Prisma.sql`SELECT image_bytes FROM resident_meter_submissions WHERE owner_id=${ownerId} AND submission_id=${id} ${residentId===undefined ? Prisma.empty : Prisma.sql`AND resident_id=${residentId}`}`);
    if(!rows[0]) throw missing();
    return rows[0].image_bytes;
  }
  async decide(ownerId: bigint,accountId: bigint,id: bigint,decision: "APPROVE"|"REJECT",reason: string|null) {
    return this.db.$transaction(async tx=>{
      // All meter mutations lock Invoice first, in the same order as finalization.
      const [ref]=await tx.$queryRaw<Array<{invoice_id:bigint}>>`SELECT invoice_id FROM resident_meter_submissions WHERE owner_id=${ownerId} AND submission_id=${id}`;
      if(!ref) throw missing();
      await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE owner_id=${ownerId} AND invoice_id=${ref.invoice_id} FOR UPDATE`;
      const [row]=await tx.$queryRaw<Submission[]>`SELECT submission_id,invoice_id,resident_id,utility,reading,previous_draft_reading,status,image_sha256 FROM resident_meter_submissions WHERE owner_id=${ownerId} AND submission_id=${id} FOR UPDATE`;
      if(!row) throw missing();
      const status=decision==='APPROVE'?'APPROVED':'REJECTED';
      if(row.status===status) return {submission_id:id,status};
      if(row.status!=='PENDING') throw conflict("Yêu cầu đã được xử lý.");
      if(decision==='APPROVE') {
        if(!(await eligible(tx,ownerId,row.resident_id,row.invoice_id)).length) throw conflict("Hợp đồng/phòng hoặc hóa đơn nháp không còn hợp lệ.");
        const invoice=await tx.invoice.findFirstOrThrow({where:{ownerId,invoiceId:row.invoice_id}});
        const current=row.utility==='ELECTRICITY'?invoice.electricityCurrentKwh:invoice.waterCurrentM3;
        if(current?.toString()!==row.previous_draft_reading?.toString()) throw conflict("Chỉ số nháp đã thay đổi sau khi khách gửi. Hãy từ chối yêu cầu cũ và kiểm tra lại.");
        await validateReading(tx,ownerId,invoice,row.utility,row.reading.toString());
        await tx.invoice.update({where:{invoiceId:row.invoice_id},data:row.utility==='ELECTRICITY'?{electricityCurrentKwh:row.reading}:{waterCurrentM3:row.reading}});
      }
      await tx.$executeRaw`UPDATE resident_meter_submissions SET status=${status},decision_account_id=${accountId},decision_at=now(),decision_note=${reason} WHERE submission_id=${id}`;
      return {submission_id:id,status};
    });
  }
}
