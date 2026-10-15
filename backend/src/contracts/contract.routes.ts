import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, getResidentContext, requireAdmin, requireResident } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { PrismaContractRepository } from "./contract.repository.js";
import { parseContractId, parseRevisionMatch, validateContractCreate, validateContractListQuery, validateContractPatch, validateEmptyObject, validateIdempotencyKey, validateRenewal, validateTermination } from "./contract.validation.js";
import type { ObjectStorage } from "../contract-documents/object-storage.js";
import type { ContractDocumentService } from "../contract-documents/contract-document.service.js";
import type { ContractIdempotencyService } from "./contract-idempotency.js";

type ContractRepository = Pick<PrismaContractRepository, "list" | "create" | "canCreateForOwner" | "findForOwner" | "findForResident" | "patch" | "activate" | "renew" | "terminate" | "history" | "listDocuments" | "findDocument" | "listMine">;
type Deps = AuthDependencies & { contractRepository: ContractRepository; contractIdempotency: Pick<ContractIdempotencyService, "execute">; objectStorage: ObjectStorage; contractDocumentService: ContractDocumentService };
const dateKeys = new Set(["startDate", "endDate", "terminationDate"]);
function jsonValue(value: unknown, key?: string): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return dateKeys.has(key ?? "") ? value.toISOString().slice(0, 10) : value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([field, item]) => [snake(field), jsonValue(item, field)]));
  return value;
}
function snake(field: string) { return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
function contractDto(contract: any, residentView = false) {
  const { room, representativeResident, successorContracts, ...fields } = contract;
  const dto = jsonValue(fields) as Record<string, unknown>;
  dto.room = room ? jsonValue({ roomId: room.roomId, roomCode: room.roomCode, property: room.property }) : undefined;
  if (!residentView && representativeResident) dto.representative_resident = jsonValue(representativeResident);
  if (fields.successorContracts) delete dto.successor_contracts;
  const successor = successorContracts?.[0];
  if (successor) dto.successor = jsonValue(successor);
  return Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
}
function page(response: express.Response, rows: unknown[], total: number, p: number, size: number) {
  sendJson(response, 200, { data: rows, meta: { page: p, page_size: size, total_items: total, total_pages: Math.ceil(total / size) } });
}
function revision(request: express.Request) { return parseRevisionMatch(request.header("If-Match")); }
function adminOwner(request: express.Request) { return getAdminOwnerId(request.auth!); }
function actor(request: express.Request) { return request.auth!.accountId; }
function id(value: unknown) { try { return parseBigIntId(value); } catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); } }
export function parseContractPageQuery(query: Record<string, unknown>) {
  const allowed = new Set(["page", "page_size"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) throw validationError("Query phân trang không hợp lệ.");
  const parse = (key: string, fallback: number, max: number) => {
    const value = query[key]; if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError(`${key} không hợp lệ.`);
    const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > max) throw validationError(`${key} không hợp lệ.`); return n;
  };
  return { page: parse("page", 1, 1_000_000), pageSize: parse("page_size", 20, 100) };
}
const paging = parseContractPageQuery;
function documentDto(document: any): Record<string, unknown> {
  return jsonValue({
    documentId: document.documentId, contractId: document.contractId, propertyId: document.propertyId, ownerId: document.ownerId,
    fileName: document.fileName, mimeType: document.mimeType, fileSize: document.fileSize, documentType: document.documentType,
    version: document.version, checksumSha256: document.checksumSha256, status: document.status,
    uploadedByAccountId: document.uploadedByAccountId, signedAt: document.signedAt,
    signatureProvider: document.signatureProvider, signatureReference: document.signatureReference,
    createdAt: document.createdAt, updatedAt: document.updatedAt,
  }) as Record<string, unknown>;
}
function historyDto(entry: any) {
  return jsonValue({ revision: entry.revision, changeType: entry.changeType, changeReason: entry.changeReason, beforeData: entry.beforeData, afterData: entry.afterData, changedByAccountId: entry.changedByAccountId, createdAt: entry.createdAt });
}
function handle(error: unknown, next: express.NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { next(conflict("Hợp đồng hoặc phiên bản tài liệu đã tồn tại.")); return; }
  next(error);
}
function resourceStorageUnavailable() { return new ApiError(503, "STORAGE_UNAVAILABLE", "Dịch vụ lưu trữ tệp chưa được cấu hình."); }

export function createContractRouter(deps: Deps): express.Router {
  const router = express.Router();
  const authenticated: RequestHandler = authenticateRequest(deps);
  const admin: RequestHandler[] = [authenticated, requireAdmin];
  const resident: RequestHandler[] = [authenticated, requireResident];

  router.get("/me/contracts", ...resident, async (request, response, next) => {
    try {
      const q = paging(request.query as Record<string, unknown>);
      const context = getResidentContext(request.auth!);
      const result = await deps.contractRepository.listMine(context.ownerId, context.residentId, q.page, q.pageSize, context.accountId);
      page(response, result.rows.map((item) => contractDto(item, true)), result.total, q.page, q.pageSize);
    } catch (error) { next(error); }
  });

  router.get("/contracts", ...admin, async (request, response, next) => {
    try {
      const query = validateContractListQuery(request.query as Record<string, unknown>);
      const result = await deps.contractRepository.list(adminOwner(request), query, actor(request));
      page(response, result.rows.map((item) => contractDto(item)), result.total, query.page, query.pageSize);
    } catch (error) { next(error); }
  });

  router.post("/contracts", ...admin, async (request, response, next) => {
    try {
      const key = validateIdempotencyKey(request.header("Idempotency-Key"));
      const ownerId = adminOwner(request); const input = validateContractCreate(request.body);
      if (!await deps.contractRepository.canCreateForOwner(ownerId, input)) foreignResourceNotFound();
      const result = await deps.contractIdempotency.execute({
        ownerId, accountId: actor(request), method: "POST", operationScope: "contracts.create", idempotencyKey: key,
        semanticInput: input,
        executeMutation: async (tx) => {
          const created = await deps.contractRepository.create(ownerId, input, tx);
          if (!created) foreignResourceNotFound();
          return { status: 201, body: { data: contractDto(created) } };
        },
      });
      response.status(result.status).type("application/json").send(result.body);
    } catch (error) { handle(error, next); }
  });

  router.get("/contracts/:contract_id", authenticated, async (request, response, next) => {
    try {
      const contractId = parseContractId(request.params.contract_id);
      let result: any;
      const context = request.auth!;
      if (context.role === "admin") result = await deps.contractRepository.findForOwner(context.ownerId, contractId, context.accountId);
      else result = await deps.contractRepository.findForResident(context.ownerId, context.residentId, contractId, context.accountId);
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: contractDto(result, context.role === "resident") });
    } catch (error) { next(error); }
  });

  router.patch("/contracts/:contract_id", ...admin, async (request, response, next) => {
    try {
      const contractId = parseContractId(request.params.contract_id);
      const current = await deps.contractRepository.findForOwner(adminOwner(request), contractId);
      if (!current) { foreignResourceNotFound(); }
      const status = (current as any).status as string;
      const patch = validateContractPatch(request.body, status);
      const expected = status === "active" ? revision(request) : undefined;
      const result = await deps.contractRepository.patch(adminOwner(request), contractId, patch, expected, actor(request));
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: contractDto((result as any).contract) });
    } catch (error) { handle(error, next); }
  });

  router.post("/contracts/:contract_id/activate", ...admin, async (request, response, next) => {
    try {
      const key = validateIdempotencyKey(request.header("Idempotency-Key")); validateEmptyObject(request.body);
      const ownerId = adminOwner(request); const accountId = actor(request); const contractId = parseContractId(request.params.contract_id);
      if (!await deps.contractRepository.findForOwner(ownerId, contractId)) foreignResourceNotFound();
      const result = await deps.contractIdempotency.execute({
        ownerId, accountId, method: "POST", operationScope: `contracts.activate:${contractId}`, idempotencyKey: key, semanticInput: {},
        executeMutation: async (tx) => {
          const activated = await deps.contractRepository.activate(ownerId, accountId, contractId, tx);
          if (!activated) foreignResourceNotFound();
          return { status: 200, body: { data: contractDto(activated) } };
        },
      });
      response.status(result.status).type("application/json").send(result.body);
    } catch (error) { handle(error, next); }
  });

  router.post("/contracts/:contract_id/renew", ...admin, async (request, response, next) => {
    try {
      const key = validateIdempotencyKey(request.header("Idempotency-Key"));
      const predecessorId = parseContractId(request.params.contract_id);
      const ownerId = adminOwner(request); const accountId = actor(request);
      const predecessor = await deps.contractRepository.findForOwner(ownerId, predecessorId);
      if (!predecessor) { foreignResourceNotFound(); }
      const input = validateRenewal(request.body); const expectedRevision = revision(request);
      const result = await deps.contractIdempotency.execute({
        ownerId, accountId, method: "POST", operationScope: `contracts.renew:${predecessorId}`, idempotencyKey: key,
        semanticInput: { body: input, if_match_revision: expectedRevision },
        executeMutation: async (tx) => {
          const renewed = await deps.contractRepository.renew(ownerId, predecessorId, expectedRevision, input, tx);
          if (!renewed) foreignResourceNotFound();
          return { status: 201, body: { data: contractDto(renewed) } };
        },
      });
      response.status(result.status).type("application/json").send(result.body);
    } catch (error) { handle(error, next); }
  });

  router.post("/contracts/:contract_id/terminate", ...admin, async (request, response, next) => {
    try {
      const key = validateIdempotencyKey(request.header("Idempotency-Key"));
      const ownerId = adminOwner(request); const accountId = actor(request); const contractId = parseContractId(request.params.contract_id);
      const current = await deps.contractRepository.findForOwner(ownerId, contractId);
      if (!current) { foreignResourceNotFound(); }
      const input = validateTermination(request.body); const expectedRevision = revision(request);
      const result = await deps.contractIdempotency.execute({
        ownerId, accountId, method: "POST", operationScope: `contracts.terminate:${contractId}`, idempotencyKey: key,
        semanticInput: { body: input, if_match_revision: expectedRevision },
        executeMutation: async (tx) => {
          const terminated = await deps.contractRepository.terminate(ownerId, accountId, contractId, expectedRevision, input, tx);
          if (!terminated) foreignResourceNotFound();
          return { status: 200, body: { data: contractDto(terminated) } };
        },
      });
      response.status(result.status).type("application/json").send(result.body);
    } catch (error) { handle(error, next); }
  });

  router.get("/contracts/:contract_id/history", ...admin, async (request, response, next) => {
    try {
      const contractId = parseContractId(request.params.contract_id); const q = paging(request.query as Record<string, unknown>);
      await deps.contractRepository.findForOwner(adminOwner(request), contractId, actor(request));
      const result = await deps.contractRepository.history(adminOwner(request), contractId, q.page, q.pageSize);
      if (!result) { foreignResourceNotFound(); }
      page(response, result.rows.map(historyDto), result.total, q.page, q.pageSize);
    } catch (error) { next(error); }
  });

  router.get("/contracts/:contract_id/documents", authenticated, async (request, response, next) => {
    try {
      const contractId = parseContractId(request.params.contract_id); const context = request.auth!;
      const result = context.role === "admin"
        ? await deps.contractRepository.listDocuments(context.ownerId, contractId)
        : await deps.contractRepository.listDocuments(context.ownerId, contractId, context.residentId);
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 200, { data: result.map(documentDto) });
    } catch (error) { next(error); }
  });

  router.post("/contracts/:contract_id/documents", ...admin, async (request, response, next) => {
    try {
      validateIdempotencyKey(request.header("Idempotency-Key"));
      const contractId = parseContractId(request.params.contract_id);
      const contract = await deps.contractRepository.findForOwner(adminOwner(request), contractId);
      if (!contract) { foreignResourceNotFound(); }
      if (!deps.objectStorage.available) throw resourceStorageUnavailable();
      const input = request.body as Record<string, unknown>;
      if (!input || Object.keys(input).some((key) => key !== "document_type") || typeof input.document_type !== "string") throw validationError("Upload chỉ nhận document_type và file.");
      const file = (request as express.Request & { file?: { originalname: string; mimetype: string; buffer: Buffer } }).file;
      if (!file || !Buffer.isBuffer(file.buffer)) throw validationError("Thiếu file multipart; upload adapter chưa được cấu hình.");
      async function* bytes() { yield new Uint8Array(file!.buffer); }
      const result = await deps.contractDocumentService.upload({ ownerId: adminOwner(request), accountId: actor(request), contractId, documentType: input.document_type, fileName: file.originalname, mimeType: file.mimetype, bytes: bytes() });
      if (!result) { foreignResourceNotFound(); }
      sendJson(response, 201, { data: documentDto(result) });
    } catch (error) { next(error); }
  });

  router.get("/contract-documents/:document_id", authenticated, async (request, response, next) => {
    try {
      const context = request.auth!; const documentId = id(request.params.document_id);
      const result = context.role === "admin"
        ? await deps.contractDocumentService.read(context.ownerId, documentId)
        : await deps.contractDocumentService.read(context.ownerId, documentId, context.residentId);
      if (!result) return foreignResourceNotFound();
      sendJson(response, 200, { data: { ...documentDto(result.metadata), download_url: result.downloadUrl } });
    } catch (error) { next(error); }
  });
  return router;
}
