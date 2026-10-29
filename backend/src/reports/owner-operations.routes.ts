import express, { type RequestHandler } from "express";
import type { AuthDependencies } from "../middleware/auth.js";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin } from "../middleware/auth.js";
import { validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { OwnerOperationsReportRepository } from "./owner-operations.repository.js";

function propertyFilter(value: unknown, required = false): bigint | undefined {
  if ((value === undefined || value === "") && !required) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw validationError("property_id phải là mã khu trọ hợp lệ.");
  try { return parseBigIntId(value); } catch { throw validationError("property_id phải là mã khu trọ hợp lệ."); }
}

export function createOwnerOperationsReportRouter(deps: AuthDependencies, repository: OwnerOperationsReportRepository): express.Router {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(deps), requireAdmin];
  const overview: RequestHandler = async (request, response, next) => {
    try {
      const propertyId = request.params.property_id === undefined ? undefined : propertyFilter(request.params.property_id, true);
      const result = await repository.getOverview(getAdminOwnerId(request.auth!), propertyId);
      if (!result) return foreignResourceNotFound();
      sendJson(response, 200, { data: result });
    } catch (error) { next(error); }
  };
  router.get("/dashboard/summary", ...admin, overview);
  router.get("/properties/:property_id/dashboard", ...admin, overview);
  return router;
}
