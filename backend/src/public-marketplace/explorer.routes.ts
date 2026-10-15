import express from "express";
import type { PrismaClient } from "@prisma/client";
import { publicAvailableRoomWhere } from "../properties/room-status.js";
import { validationError } from "../middleware/api-error.js";
import { PrismaPublicMarketplaceRepository } from "./public-marketplace.repository.js";
import { parsePublicRoomListQuery } from "./public-marketplace.validation.js";
import { serializePublicRoom } from "./public-marketplace.routes.js";
import { provinces, provinceCode } from "./explorer-provinces.js";

export function createExplorerRouter(prisma: PrismaClient) {
  const router = express.Router();
  const repository = new PrismaPublicMarketplaceRepository(prisma);
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/", async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw validationError("Thống kê không nhận bộ lọc.");
      // Only properties with eligible public rooms participate. No internal adoption counts.
      const rows = await prisma.property.findMany({
        where: { status: "active", rooms: { some: publicAvailableRoomWhere() } },
        select: { province: true, _count: { select: { rooms: { where: publicAvailableRoomWhere() } } } },
      });
      const data = provinces.map(([code, name]) => ({ code, name, public_properties: 0, public_rooms: 0,
        system_properties: null, boarding_properties: null, apartment_properties: null }));
      let unmappedRooms = 0;
      for (const row of rows) {
        const target = data.find(p => p.code === provinceCode(row.province));
        if (target) { target.public_properties++; target.public_rooms += row._count.rooms; }
        else unmappedRooms += row._count.rooms;
      }
      res.json({ data: { mode: "live", provinces: data, unmapped_rooms: unmappedRooms,
        note: "Chỉ đếm cơ sở có phòng công khai khả dụng. Không có quyền công khai tổng cơ sở dùng hệ thống hoặc dữ liệu phân loại cơ sở." } });
    } catch (error) { next(error); }
  });
  router.get("/rooms", async (req, res, next) => {
    try {
      const { province_code, ...raw } = req.query;
      if (typeof province_code !== "string" || !provinces.some(([code]) => code === province_code)) throw validationError("province_code phải là mã tỉnh hai chữ số trong danh mục 34 tỉnh.");
      if (raw.province !== undefined) throw validationError("Dùng province_code thay cho province.");
      const query = parsePublicRoomListQuery(raw as Record<string, unknown>);
      const names = await prisma.property.findMany({ where: { status: "active", rooms: { some: publicAvailableRoomWhere() } }, distinct: ["province"], select: { province: true } });
      const provinceNames = names.filter(p => provinceCode(p.province) === province_code).map(p => p.province);
      const result = await repository.listPublicRooms({ ...query, provinceNames });
      res.json({ data: result.rows.map(row => serializePublicRoom(row, false)), meta: {
        page: query.page, page_size: query.page_size, total_items: result.total, total_pages: Math.ceil(result.total / query.page_size),
      } });
    } catch (error) { next(error); }
  });
  return router;
}
