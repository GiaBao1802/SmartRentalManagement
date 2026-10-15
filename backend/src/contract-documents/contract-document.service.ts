import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError, validationError } from "../middleware/api-error.js";
import type { ObjectStorage } from "./object-storage.js";

const publicSelect = { documentId: true, contractId: true, propertyId: true, ownerId: true, fileName: true, mimeType: true, fileSize: true, documentType: true, version: true, checksumSha256: true, status: true, uploadedByAccountId: true, signedAt: true, signatureProvider: true, signatureReference: true, createdAt: true, updatedAt: true } satisfies Prisma.ContractDocumentSelect;
const documentTypes = new Set(["contract", "renewal", "termination", "attachment"]);

/** Coordinates object staging with immutable metadata version creation. */
export class ContractDocumentService {
  constructor(private readonly prisma: PrismaClient, private readonly storage: ObjectStorage) {}

  async upload(input: { ownerId: bigint; accountId: bigint; contractId: bigint; documentType: string; fileName: string; mimeType: string; bytes: AsyncIterable<Uint8Array> }) {
    if (!documentTypes.has(input.documentType)) throw validationError("document_type không hợp lệ.");
    if (!input.fileName.trim() || input.fileName.length > 255 || !input.mimeType.trim() || input.mimeType.length > 150) throw validationError("Thông tin tệp không hợp lệ.");
    if (!this.storage.available) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Dịch vụ lưu trữ tệp chưa được cấu hình.");
    const contract = await this.prisma.contract.findFirst({ where: { ownerId: input.ownerId, contractId: input.contractId }, select: { contractId: true, propertyId: true } });
    if (!contract) return null;

    const staged = await this.storage.stage({ fileName: input.fileName, mimeType: input.mimeType, bytes: input.bytes });
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT contract_id FROM contracts WHERE owner_id = ${input.ownerId} AND contract_id = ${input.contractId} FOR UPDATE`;
        const latest = await tx.contractDocument.findFirst({ where: { ownerId: input.ownerId, contractId: input.contractId, documentType: input.documentType }, orderBy: { version: "desc" }, select: { version: true } });
        const row = await tx.contractDocument.create({ data: {
          contractId: input.contractId, propertyId: contract.propertyId, ownerId: input.ownerId,
          uploadedByAccountId: input.accountId, fileName: staged.fileName, storageKey: staged.storageKey,
          mimeType: staged.mimeType, fileSize: staged.fileSize, checksumSha256: staged.checksumSha256.toLowerCase(),
          documentType: input.documentType, version: (latest?.version ?? 0) + 1, status: "draft",
        }, select: publicSelect });
        return row;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      try { await staged.cleanup(); }
      catch { console.error(JSON.stringify({ event: "contract_document_staged_object_cleanup_failed", contract_id: input.contractId.toString() })); }
      throw error;
    }
  }

  async read(ownerId: bigint, documentId: bigint, residentId?: bigint) {
    const row = await this.prisma.contractDocument.findFirst({
      where: { ownerId, documentId, ...(residentId === undefined ? {} : { contract: { OR: [{ representativeResidentId: residentId }, { roomResidents: { some: { ownerId, residentId } } }] } }) },
      select: { ...publicSelect, storageKey: true },
    });
    if (!row) return null;
    const { storageKey, ...metadata } = row;
    const downloadUrl = this.storage.available ? await this.storage.createReadUrl(storageKey) : null;
    return { metadata, downloadUrl };
  }
}
