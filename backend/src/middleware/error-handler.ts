import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { ApiError } from "./api-error.js";
import { sendJson } from "../utils/ids.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (response.headersSent) return;

  if (error instanceof ApiError) {
    sendJson(response, error.status, {
      error: { code: error.code, message: error.message, details: error.details, request_id: request.requestId },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2004" && JSON.stringify(error.meta ?? {}).includes("payment_transactions_provider_check")) {
      sendJson(response, 409, { error: { code: "DATABASE_VERSION_REQUIRED", message: "Database hiện chưa hỗ trợ thanh toán demo. Cần nâng database lên V1.12 sau khi xác minh backup.", details: {}, request_id: request.requestId } });
      return;
    }
    if (error.code === "P2002") {
      sendJson(response, 409, { error: { code: "CONFLICT", message: "Dữ liệu đã tồn tại.", details: {}, request_id: request.requestId } });
      return;
    }
    if (error.code === "P2003" || error.code === "P2014") {
      sendJson(response, 409, { error: { code: "CONFLICT", message: "Không thể thực hiện do dữ liệu đang được tham chiếu.", details: {}, request_id: request.requestId } });
      return;
    }
    if (error.code === "P2025") {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu.", details: {}, request_id: request.requestId } });
      return;
    }
  }

  if (error && typeof error === "object" && "type" in error && error.type === "entity.parse.failed") {
    sendJson(response, 400, { error: { code: "VALIDATION_ERROR", message: "JSON yêu cầu không hợp lệ.", details: {}, request_id: request.requestId } });
    return;
  }

  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    sendJson(response, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "Nội dung yêu cầu vượt giới hạn cho phép.", details: {}, request_id: request.requestId } });
    return;
  }

  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.error(JSON.stringify({ event: "request_failed", request_id: request.requestId, error_name: errorName }));
  sendJson(response, 500, { error: { code: "INTERNAL_ERROR", message: "Không thể xử lý yêu cầu lúc này.", details: {}, request_id: request.requestId } });
};
