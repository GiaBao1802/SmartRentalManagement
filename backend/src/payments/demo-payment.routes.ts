import express, { type RequestHandler } from "express";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, requireResident } from "../middleware/auth.js";
import { conflict, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { DemoPaymentRepository, ResidentFeedbackRepository } from "./demo-payment.repository.js";

type Dependencies = AuthDependencies & { demoPaymentRepository: DemoPaymentRepository; feedbackRepository: ResidentFeedbackRepository; demoEnabled: boolean };
function parseId(value: string | string[]) { try { return parseBigIntId(typeof value === "string" ? value : ""); } catch { throw validationError("Mã hóa đơn không hợp lệ."); } }

export function createDemoPaymentRouter(deps: Dependencies): express.Router {
  const router = express.Router();
  const resident: RequestHandler[] = [authenticateRequest(deps), requireResident];

  router.get("/invoices/:invoice_id/demo-payments", ...resident, async (request, response, next) => {
    try {
      if (!deps.demoEnabled) throw conflict("Thanh toán mô phỏng chỉ bật trong môi trường demo.");
      const result = await deps.demoPaymentRepository.list(request.auth!.ownerId, request.auth!.residentId!, parseId(request.params.invoice_id));
      if (!result) foreignResourceNotFound();
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  });

  router.post("/invoices/:invoice_id/demo-payments", ...resident, async (request, response, next) => {
    try {
      if (!deps.demoEnabled) throw conflict("Thanh toán mô phỏng chỉ bật trong môi trường demo.");
      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length !== 1 || !["success", "failed"].includes(request.body.outcome)) throw validationError("Kết quả mô phỏng không hợp lệ.");
      const result = await deps.demoPaymentRepository.simulate(request.auth!.ownerId, request.auth!.residentId!, parseId(request.params.invoice_id), request.body.outcome);
      if (!result) foreignResourceNotFound();
      if (result.notPayable) throw conflict("Chỉ hóa đơn đã phát hành và chưa thanh toán mới dùng được luồng demo.");
      sendJson(response, 201, { data: result.transaction });
    } catch (error) { next(error); }
  });

  router.post("/me/feedback", ...resident, async (request, response, next) => {
    try {
      const input = request.body as Record<string, unknown>;
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["category", "content"].includes(key))) throw validationError("Nội dung phản hồi không hợp lệ.");
      const category = typeof input.category === "string" ? input.category.trim() : "";
      const content = typeof input.content === "string" ? input.content.trim() : "";
      if (!category || category.length > 100 || content.length < 5 || content.length > 5000) throw validationError("Chọn loại phản hồi và nhập nội dung từ 5 đến 5.000 ký tự.");
      const result = await deps.feedbackRepository.create(request.auth!.ownerId, request.auth!.residentId!, request.auth!.accountId, category, content);
      if (!result) throw conflict("Chỉ cư dân đang có lưu trú hoạt động mới gửi được phản hồi.");
      sendJson(response, 201, { data: result });
    } catch (error) { next(error); }
  });

  return router;
}
