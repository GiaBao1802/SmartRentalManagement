import express, { type RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, getResidentContext, requireAdmin, requireResident } from "../middleware/auth.js";
import { ApiError, conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { InvoicePricing, PrismaInvoiceRepository } from "./invoice.repository.js";
import { validateBillingWorkspaceQuery, validateCreateInvoice, validateDraftPatch, validateEmptyInvoiceCommand, validateIdempotencyKey, validateInvoicePageQuery } from "./invoice.validation.js";
import type { InvoiceZaloService } from "../zalo/invoice-zalo.service.js";
import type { PrismaBillingWorkspaceRepository } from "./billing-workspace.repository.js";

type Deps = AuthDependencies & { invoiceRepository: PrismaInvoiceRepository; billingWorkspaceRepository: PrismaBillingWorkspaceRepository; invoicePricing: InvoicePricing; invoiceZalo: InvoiceZaloService };
const dateFields = new Set(["periodStart", "periodEnd", "dueDate"]);
function jsonValue(value: any, key?: string): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString(10);
  if (value instanceof Date) return dateFields.has(key ?? "") ? value.toISOString().slice(0, 10) : value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([field, item]) => [field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), jsonValue(item, field)]));
  return value;
}
function invoiceDto(invoice: any, residentView = false, includeAdminItemization = false) {
  const { contract, paymentSummary, amountProvisional, isOverdue, ownerId, invoiceItems, ...fields } = invoice;
  const itemizationAvailable = includeAdminItemization && invoice.snapshotKind === "ITEMIZED";
  return {
    ...jsonValue(fields),
    ...(residentView ? {} : { owner_id: jsonValue(ownerId) }),
    is_overdue: Boolean(isOverdue),
    amount_provisional: Boolean(amountProvisional),
    contract: contract ? jsonValue({
      contractId: contract.contractId, contractNo: contract.contractNo, roomId: contract.roomId, propertyId: contract.propertyId,
      roomCode: contract.room?.roomCode, property: contract.room?.property,
      ...(residentView ? {} : { representativeResidentId: contract.representativeResidentId }),
    }) : undefined,
    payment_summary: jsonValue(paymentSummary),
    ...(includeAdminItemization ? {
      itemization_available: itemizationAvailable,
      invoice_items: itemizationAvailable ? (invoiceItems ?? []).map((item: any) => ({
        invoice_item_id: jsonValue(item.invoiceItemId), category: item.category, item_key: item.itemKey,
        label: item.labelSnapshot, description: item.descriptionSnapshot,
        quantity: jsonValue(item.quantity), unit: item.unit,
        unit_price: jsonValue(item.unitPriceSnapshot), amount: jsonValue(item.amount),
        ...(item.category === "ELECTRICITY" ? { electricity_tiers: (item.electricityTiers ?? []).map((tier: any) => ({
          tier_no: tier.tierNo, lower_kwh: jsonValue(tier.lowerKwh), upper_kwh: jsonValue(tier.upperKwh),
          quantity: jsonValue(tier.quantity), unit_price: jsonValue(tier.unitPriceSnapshot), amount: jsonValue(tier.amount),
        })) } : {}),
      })) : [],
    } : {}),
  };
}
function parseId(value: unknown, name: string): bigint {
  try { return parseBigIntId(value); } catch { throw validationError(`${name} không hợp lệ.`); }
}
function page(response: express.Response, rows: any[], total: number, pageNo: number, pageSize: number, residentView: boolean) {
  sendJson(response, 200, { data: rows.map((row) => invoiceDto(row, residentView)), meta: { page: pageNo, page_size: pageSize, total_items: total, total_pages: Math.ceil(total / pageSize) } });
}
function idempotency(request: express.Request) { validateIdempotencyKey(request.header("Idempotency-Key")); }
function handle(error: unknown, next: express.NextFunction) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    const targetText = Array.isArray(target) ? target.join(" ") : typeof target === "string" ? target : "";
    if (/contractId.*periodStart.*periodEnd|contract_id.*period_start.*period_end|invoices_contract_id_period_start_period_end/i.test(targetText)) {
      next(new ApiError(409, "INVOICE_PERIOD_CONFLICT", "Hóa đơn cho kỳ này đã tồn tại."));
      return;
    }
    next(new ApiError(409, "CONFLICT", "Hóa đơn có khoản thu bị trùng theo dữ liệu nguồn."));
    return;
  }
  if (error instanceof Error && error.message === "ZALO_PROVIDER_UNAVAILABLE") { next(new ApiError(503, "SERVICE_UNAVAILABLE", "Dịch vụ gửi Zalo OA hiện chưa được cấu hình.")); return; }
  next(error);
}

export function createInvoiceRouter(deps: Deps): express.Router {
  const router = express.Router();
  const authenticated: RequestHandler = authenticateRequest(deps);
  const admin: RequestHandler[] = [authenticated, requireAdmin];
  const resident: RequestHandler[] = [authenticated, requireResident];

  router.get("/billing/workspace", ...admin, async (request, response, next) => {
    try {
      const filters = validateBillingWorkspaceQuery(request.query as Record<string, unknown>);
      const result = await deps.billingWorkspaceRepository.list(getAdminOwnerId(request.auth!), filters);
      sendJson(response, 200, result);
    } catch (error) { next(error); }
  });

  router.get("/invoices", authenticated, async (request, response, next) => {
    try {
      const context = request.auth!;
      const filter = validateInvoicePageQuery(request.query as Record<string, unknown>, context.role);
      const result = await deps.invoiceRepository.list(context.ownerId, filter, context.role === "resident" ? context.residentId : undefined);
      page(response, result.rows, result.total, filter.page, filter.pageSize, context.role === "resident");
    } catch (error) { next(error); }
  });

  router.post("/invoices", ...admin, async (request, response, next) => {
    try {
      idempotency(request);
      const result = await deps.invoiceRepository.createDraft(getAdminOwnerId(request.auth!), validateCreateInvoice(request.body));
      sendJson(response, 201, { data: invoiceDto(result) });
    } catch (error) { handle(error, next); }
  });

  router.post("/contracts/:contract_id/invoices/generate", ...admin, async (request, response, next) => {
    try {
      idempotency(request);
      validateEmptyInvoiceCommand(request.body);
      const result = await deps.invoiceRepository.ensureNextDraft(getAdminOwnerId(request.auth!), parseId(request.params.contract_id, "contract_id"));
      sendJson(response, 200, { data: invoiceDto(result) });
    } catch (error) { handle(error, next); }
  });

  router.get("/invoices/:invoice_id", authenticated, async (request, response, next) => {
    try {
      const context = request.auth!;
      const invoiceId = parseId(request.params.invoice_id, "invoice_id");
      const result = context.role === "admin"
        ? await deps.invoiceRepository.findForOwner(context.ownerId, invoiceId)
        : await deps.invoiceRepository.findForResident(context.ownerId, context.residentId, invoiceId);
      if (!result) return foreignResourceNotFound();
      sendJson(response, 200, { data: invoiceDto(result, context.role === "resident", context.role === "admin") });
    } catch (error) { next(error); }
  });

  router.patch("/invoices/:invoice_id", ...admin, async (request, response, next) => {
    try {
      const result = await deps.invoiceRepository.patchDraft(getAdminOwnerId(request.auth!), parseId(request.params.invoice_id, "invoice_id"), validateDraftPatch(request.body));
      if (!result) return foreignResourceNotFound();
      sendJson(response, 200, { data: invoiceDto(result) });
    } catch (error) { handle(error, next); }
  });

  router.post("/invoices/:invoice_id/finalize", ...admin, async (request, response, next) => {
    try {
      idempotency(request);
      const result = await deps.invoiceRepository.finalize(getAdminOwnerId(request.auth!), parseId(request.params.invoice_id, "invoice_id"), validateDraftPatch(request.body, false), deps.invoicePricing, request.auth!.accountId);
      if (!result) return foreignResourceNotFound();
      // finalize() returns only after its transaction commits. Zalo enqueue is best-effort post-commit;
      // unresolved recipient/provider configuration must never roll back or misreport the finalized Invoice.
      try { await deps.invoiceZalo.send(getAdminOwnerId(request.auth!), result.invoiceId); } catch { /* recorded as unavailable until policy/provider is configured */ }
      sendJson(response, 200, { data: invoiceDto(result) });
    } catch (error) { handle(error, next); }
  });

  router.post("/invoices/:invoice_id/send-zalo", ...admin, async (request, response, next) => {
    try {
      idempotency(request);
      validateEmptyInvoiceCommand(request.body);
      const result = await deps.invoiceZalo.send(getAdminOwnerId(request.auth!), parseId(request.params.invoice_id, "invoice_id"));
      if (!result) return foreignResourceNotFound();
      sendJson(response, 202, { data: jsonValue(result) });
    } catch (error) { handle(error, next); }
  });

  router.get("/invoices/:invoice_id/zalo-send-logs", authenticated, async (request, response, next) => {
    try {
      const context = request.auth!;
      const result = await deps.invoiceRepository.listSendLogs(context.ownerId, parseId(request.params.invoice_id, "invoice_id"), context.role === "resident" ? context.residentId : undefined);
      if (!result) return foreignResourceNotFound();
      sendJson(response, 200, { data: jsonValue(result) });
    } catch (error) { next(error); }
  });

  router.use((_request, _response, next) => next(conflict("Invoice endpoint không được hỗ trợ.")));
  return router;
}
