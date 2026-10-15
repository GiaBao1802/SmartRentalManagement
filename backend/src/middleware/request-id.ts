import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  request.requestId = `req_${randomUUID()}`;
  response.setHeader("X-Request-Id", request.requestId);
  next();
};
