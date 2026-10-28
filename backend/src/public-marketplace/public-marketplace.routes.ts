import express, { type RequestHandler } from "express";
import { authenticateRequest, foreignResourceNotFound, getAdminOwnerId, requireAdmin, type AuthDependencies } from "../middleware/auth.js";
import { ApiError, validationError } from "../middleware/api-error.js";
import { parseBigIntId, sendJson } from "../utils/ids.js";
import type { ContactListQuery, ContactRequestRepositoryPort } from "./public-marketplace.repository.js";
import { illustrativeRoomImageKeys } from "../room-images/illustrative-room-image-keys.js";
import { parseContactListQuery, parsePublicRoomListQuery, validateContactRequest, validateContactStatusPatch } from "./public-marketplace.validation.js";

type ContactRateBucket = { count: number; resetsAt: number };

class InMemoryContactRateLimiter {
  private readonly buckets = new Map<string, ContactRateBucket>();
  private checks = 0;
  constructor(private readonly max: number, private readonly windowMs: number) {}
  consume(key: string, now = Date.now()): number | null {
    this.checks++;
    if (this.checks % 128 === 0) for (const [address, bucket] of this.buckets) if (bucket.resetsAt <= now) this.buckets.delete(address);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) { this.buckets.set(key, { count: 1, resetsAt: now + this.windowMs }); return null; }
    bucket.count++;
    if (bucket.count > this.max) return Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000));
    return null;
  }
}

function parseId(value: unknown): bigint {
  try { return parseBigIntId(value); }
  catch { throw validationError("ID phải là chuỗi số nguyên dương hợp lệ."); }
}

function pageResponse(rows: unknown[], total: number, query: { page: number; page_size: number }) {
  return { data: rows, meta: { page: query.page, page_size: query.page_size, total_items: total, total_pages: Math.ceil(total / query.page_size) } };
}

function imageUrl(imageId: bigint) { return `/api/v1/public/room-images/${imageId.toString()}`; }
function serializePublicImage(image: { roomImageId: bigint; isCover: boolean; sortOrder: number; storageKey?: string }) {
  return { image_id: image.roomImageId.toString(), url: imageUrl(image.roomImageId), is_cover: image.isCover, sort_order: image.sortOrder, is_illustrative: image.storageKey ? illustrativeRoomImageKeys.has(image.storageKey) : false };
}
export function serializePublicRoom(row: any) {
  const images = Array.isArray(row.images) ? row.images.map(serializePublicImage) : [];
  const propertyFacilities = Array.isArray(row.property?.propertyFacilities) ? row.property.propertyFacilities.map((facility: { name: string }) => facility.name) : [];
  const cover = images.find((image: { is_cover: boolean }) => image.is_cover) ?? null;
  return {
    room_id: row.roomId.toString(), room_code: row.roomCode,
    property: { name: row.property.name, province: row.property.province, address: row.property.address },
    property_facilities: propertyFacilities,
    default_rent: row.defaultRent.toString(), area_m2: row.areaM2.toFixed(2), default_capacity: row.defaultCapacity,
    status: "available", public_description: row.publicDescription, amenities: row.marketplaceAmenities ?? [],
    cover_image: cover ? { image_id: cover.image_id, url: cover.url, is_illustrative: cover.is_illustrative } : null,
    images,
  };
}

function serializeContactAck(row: { contactRequestId: bigint; status: string }) {
  return { contact_request_id: row.contactRequestId.toString(), status: row.status };
}

function serializeAdminContactRequest(row: any) {
  return {
    contact_request_id: row.contactRequestId.toString(), property_id: row.propertyId.toString(),
    room_id: row.roomId?.toString() ?? null, requester_name: row.requesterName, phone: row.phone,
    email: row.email, message: row.message, status: row.status,
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    property: { property_id: row.property.propertyId.toString(), name: row.property.name, province: row.property.province, address: row.property.address },
    room: row.room ? { room_id: row.room.roomId.toString(), room_code: row.room.roomCode } : null,
  };
}

export function createPublicMarketplaceRouter(auth: AuthDependencies, repository: ContactRequestRepositoryPort): express.Router {
  const router = express.Router();
  const admin: RequestHandler[] = [authenticateRequest(auth), requireAdmin];
  const rateLimiter = new InMemoryContactRateLimiter(auth.config.loginMaxAttempts, auth.config.loginWindowMinutes * 60_000);

  router.get("/public/rooms", async (request, response, next) => {
    try {
      const query = parsePublicRoomListQuery(request.query as Record<string, unknown>);
      const result = await repository.listPublicRooms(query);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, pageResponse(result.rows.map((row) => serializePublicRoom(row)), result.total, query));
    } catch (error) { next(error); }
  });

  router.get("/public/property-facilities", async (_request, response, next) => {
    try {
      const facilities = await repository.listPublicPropertyFacilities();
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: facilities });
    } catch (error) { next(error); }
  });

  router.get("/public/rooms/:room_id", async (request, response, next) => {
    try {
      const row = await repository.findPublicRoom(parseId(request.params.room_id));
      if (!row) { foreignResourceNotFound(); }
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: serializePublicRoom(row) });
    } catch (error) { next(error); }
  });

  router.post("/public/contact-requests", async (request, response, next) => {
    try {
      const retryAfter = rateLimiter.consume(request.ip || request.socket.remoteAddress || "unknown");
      if (retryAfter !== null) {
        response.setHeader("Retry-After", String(retryAfter));
        throw new ApiError(429, "RATE_LIMITED", "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.", { retry_after_seconds: retryAfter });
      }
      const input = validateContactRequest(request.body);
      const row = await repository.createContactRequest(input);
      if (!row) { foreignResourceNotFound(); }
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 201, { data: serializeContactAck(row) });
    } catch (error) { next(error); }
  });

  router.get("/contact-requests", ...admin, async (request, response, next) => {
    try {
      const query = parseContactListQuery(request.query as Record<string, unknown>);
      const result = await repository.listContactRequests(getAdminOwnerId(request.auth!), query as ContactListQuery);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, pageResponse(result.rows.map(serializeAdminContactRequest), result.total, query));
    } catch (error) { next(error); }
  });

  router.get("/contact-requests/:contact_request_id", ...admin, async (request, response, next) => {
    try {
      const row = await repository.findContactRequest(getAdminOwnerId(request.auth!), parseId(request.params.contact_request_id));
      if (!row) { foreignResourceNotFound(); }
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: serializeAdminContactRequest(row) });
    } catch (error) { next(error); }
  });

  router.patch("/contact-requests/:contact_request_id", ...admin, async (request, response, next) => {
    try {
      const status = validateContactStatusPatch(request.body);
      const row = await repository.updateContactRequestStatus(getAdminOwnerId(request.auth!), parseId(request.params.contact_request_id), status);
      if (!row) { foreignResourceNotFound(); }
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { data: serializeAdminContactRequest(row) });
    } catch (error) { next(error); }
  });

  return router;
}
