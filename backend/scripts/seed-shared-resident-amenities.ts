import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: "../.env.neon", override: true });

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Neon connection is not configured.");
const parsedUrl = new URL(url);
if (!parsedUrl.hostname.endsWith(".neon.tech") || process.env.NEON_BRANCH !== "production") {
  throw new Error("Refusing to write outside the verified shared Neon production branch.");
}
if (parsedUrl.pathname !== "/neondb") throw new Error("Refusing an unexpected database.");

const demoNote = "Dữ liệu mô phỏng để kiểm thử, không xác nhận tiện ích thực tế và không dùng để thu phí.";
const effectiveFrom = "2026-10-29";

type Offering = {
  code: string;
  name: string;
  description: string;
  unitPrice: bigint;
  unit: string;
  opensAt: string;
  closesAt: string;
  weekdays: number[];
  duration: number;
  capacity: number;
  facilityName?: string;
  facilityLocation?: string;
};

const makeAmenity = (code: string, name: string, hours: [string, string], duration: number, capacity: number): Offering => ({
  code: `DEMO_${code}_BOOKING`,
  name: `${name} · đặt lịch (demo)`,
  description: `${demoNote} Chọn khung giờ; lịch chờ chủ trọ duyệt, miễn phí.`,
  unitPrice: 0n,
  unit: "lượt",
  opensAt: hours[0],
  closesAt: hours[1],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  duration,
  capacity,
  facilityName: `${name} (demo)`,
  facilityLocation: "Khu vực mẫu",
});

const makeIncident = (code: "HAIRCUT" | "GARDENING"): Offering => code === "HAIRCUT" ? {
  code: "DEMO_HAIRCUT",
  name: "Cắt tóc theo lịch (demo)",
  description: `${demoNote} Miễn phí; lịch chỉ được xác nhận sau khi chủ trọ duyệt.`,
  unitPrice: 0n,
  unit: "lượt",
  opensAt: "09:00",
  closesAt: "19:00",
  weekdays: [2, 3, 4, 5, 6, 7],
  duration: 30,
  capacity: 1,
} : {
  code: "DEMO_GARDENING",
  name: "Tỉa cây theo lịch (demo)",
  description: `${demoNote} Miễn phí; lịch chỉ được xác nhận sau khi chủ trọ duyệt.`,
  unitPrice: 0n,
  unit: "lượt",
  opensAt: "08:00",
  closesAt: "17:00",
  weekdays: [1, 2, 3, 4, 5, 6],
  duration: 60,
  capacity: 1,
};

// The 11 existing Property rows belong to the synthetic shared-dev dataset.
// Every area gets a different mix while the Owner 6 test Property retains its
// existing laundry booking. No Resident booking is seeded; all sample slots
// remain open until a logged-in Resident requests one.
const plans: Record<number, Offering[]> = {
  2: [makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeIncident("HAIRCUT")],
  3: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeIncident("GARDENING")],
  4: [makeAmenity("SOCCER", "Sân bóng mini", ["06:00", "22:00"], 60, 10), makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeIncident("HAIRCUT"), makeIncident("GARDENING")],
  5: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeIncident("HAIRCUT"), makeIncident("GARDENING")],
  6: [makeAmenity("SOCCER", "Sân bóng mini", ["06:00", "22:00"], 60, 10), makeIncident("GARDENING")],
  7: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeIncident("HAIRCUT")],
  8: [makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeAmenity("SOCCER", "Sân bóng mini", ["06:00", "22:00"], 60, 10), makeIncident("GARDENING")],
  9: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeIncident("HAIRCUT"), makeIncident("GARDENING")],
  10: [makeAmenity("SOCCER", "Sân bóng mini", ["06:00", "22:00"], 60, 10), makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeIncident("HAIRCUT")],
  11: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeIncident("GARDENING")],
  12: [makeAmenity("POOL", "Hồ bơi", ["06:00", "21:00"], 60, 8), makeAmenity("TENNIS", "Sân tennis", ["06:00", "21:00"], 60, 4), makeIncident("HAIRCUT"), makeIncident("GARDENING")],
};

const expectedProperties: Record<number, { ownerId: number; name: string }> = {
  2: { ownerId: 6, name: "An Bình Biên Hòa" },
  3: { ownerId: 6, name: "Bến Nắng Thủ Đức" },
  4: { ownerId: 7, name: "Vườn Xanh Long Thành" },
  5: { ownerId: 7, name: "Phố Nhỏ Gò Vấp" },
  6: { ownerId: 8, name: "Mộc Lan Trảng Bom" },
  7: { ownerId: 8, name: "Sông Xanh Bình Thạnh" },
  8: { ownerId: 9, name: "Cánh Đồng Nhơn Trạch" },
  9: { ownerId: 9, name: "Ánh Dương Tân Bình" },
  10: { ownerId: 10, name: "Phố Vườn Long Khánh" },
  11: { ownerId: 10, name: "Bình Minh Quận 7" },
  12: { ownerId: 6, name: "Khu thử nghiệm đa dạng phòng" },
};

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 12_000 });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await client.query("SELECT pg_advisory_xact_lock(29471029, 1162026)");
  const catalog = await client.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  const properties = await client.query(`SELECT property_id,owner_id,name,status FROM properties WHERE property_id BETWEEN 2 AND 12 ORDER BY property_id FOR SHARE`);
  if (catalog.rows[0]?.count !== 47 || properties.rowCount !== 11) throw new Error("Expected exact V1.16 catalog and the 11 approved shared demo Properties.");
  for (const property of properties.rows) {
    const expected = expectedProperties[Number(property.property_id)];
    if (!expected || Number(property.owner_id) !== expected.ownerId || property.name !== expected.name || property.status !== "active") {
      throw new Error(`Property scope check failed for property ${property.property_id}.`);
    }
  }

  const owners = [...new Set(properties.rows.map((row) => Number(row.owner_id)))];
  const admins = await client.query(`SELECT account_id,owner_id FROM accounts WHERE owner_id=ANY($1::bigint[]) AND role='admin' AND status='active' ORDER BY owner_id,account_id FOR SHARE`, [owners]);
  const adminByOwner = new Map<number, bigint>();
  for (const admin of admins.rows) {
    const ownerId = Number(admin.owner_id);
    if (adminByOwner.has(ownerId)) throw new Error(`More than one active Admin account for Owner ${ownerId}; refusing ambiguous audit attribution.`);
    adminByOwner.set(ownerId, BigInt(admin.account_id));
  }
  if (adminByOwner.size !== owners.length) throw new Error("Every demo Owner must have exactly one active Admin account.");

  const additions: Array<{ propertyId: number; kind: string; name: string; unitPrice: string; facility: boolean }> = [];
  const priceVersionsAdded: Array<{ propertyId: number; code: string; versionNo: number }> = [];
  for (const property of properties.rows) {
    const propertyId = Number(property.property_id);
    const ownerId = Number(property.owner_id);
    const actorAccountId = adminByOwner.get(ownerId)!;
    for (const offering of plans[propertyId]!) {
      if (offering.facilityName) {
        const existingFacility = await client.query(`SELECT property_facility_id,description,active FROM property_facilities WHERE property_id=$1 AND owner_id=$2 AND name=$3`, [propertyId, ownerId, offering.facilityName]);
        if (existingFacility.rowCount) {
          if (!existingFacility.rows[0].active || !existingFacility.rows[0].description?.includes(demoNote)) throw new Error(`Existing Facility conflicts with the marked demo fixture: ${offering.facilityName}.`);
        } else {
          await client.query(`INSERT INTO property_facilities(owner_id,property_id,name,description,location) VALUES($1,$2,$3,$4,$5)`, [ownerId, propertyId, offering.facilityName, demoNote, offering.facilityLocation]);
          additions.push({ propertyId, kind: "Facility", name: offering.facilityName, unitPrice: "—", facility: true });
        }
      }

      const existing = await client.query(`
        SELECT i.property_pricing_item_id,i.name,i.description,i.unit,i.status,
          c.service_mode,to_char(c.opens_at,'HH24:MI') opens_at,to_char(c.closes_at,'HH24:MI') closes_at,c.slot_duration_minutes,c.capacity_per_slot,
          v.version_no,v.unit_price,to_char(v.effective_from,'YYYY-MM-DD') effective_from,v.source_name,v.reason
        FROM property_pricing_items i
        LEFT JOIN property_flexible_service_configurations c ON c.property_pricing_item_id=i.property_pricing_item_id
        LEFT JOIN LATERAL (
          SELECT pv.version_no,pv.unit_price,pv.effective_from,pv.source_name,pv.reason
          FROM property_price_versions pv
          WHERE pv.property_pricing_item_id=i.property_pricing_item_id
          ORDER BY pv.effective_from DESC,pv.version_no DESC LIMIT 1
        ) v ON true
        WHERE i.property_id=$1 AND i.owner_id=$2 AND i.code=$3
      `, [propertyId, ownerId, offering.code]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        const good = row.name === offering.name && row.description?.includes(demoNote) && row.unit === offering.unit && row.status === "active"
          && row.service_mode === "BOOKING" && row.opens_at === offering.opensAt && row.closes_at === offering.closesAt
          && row.slot_duration_minutes === offering.duration && row.capacity_per_slot === offering.capacity
          && row.effective_from === effectiveFrom && row.source_name === "Dữ liệu mô phỏng";
        if (!good) throw new Error(`Existing service conflicts with expected demo fixture: ${offering.code} at Property ${propertyId}.`);
        if (String(row.unit_price) !== String(offering.unitPrice)) {
          if (!(offering.code === "DEMO_HAIRCUT" || offering.code === "DEMO_GARDENING") || Number(row.version_no) !== 1 || !row.reason?.includes(demoNote)) {
            throw new Error(`Unexpected price history for ${offering.code} at Property ${propertyId} (version ${row.version_no}, current ${row.unit_price}, demo provenance ${Boolean(row.reason?.includes(demoNote))}); refusing to overwrite it.`);
          }
          const correctionReason = `${demoNote} Cập nhật về miễn phí theo lựa chọn đã duyệt; đặt lịch vẫn chờ chủ trọ xác nhận.`;
          await client.query(`
            INSERT INTO property_price_versions(
              property_pricing_item_id,owner_id,property_id,kind,version_no,effective_from,unit_price,
              source_name,source_reference,published_at,published_by_account_id,reason,created_by_account_id
            ) VALUES($1,$2,$3,'FLEXIBLE_SERVICE',2,$4::date,0,'Dữ liệu mô phỏng',$5,now(),$6,$7,$6)
          `, [row.property_pricing_item_id, ownerId, propertyId, effectiveFrom, correctionReason, actorAccountId, correctionReason]);
          await client.query(`UPDATE property_pricing_items SET description=$1 WHERE property_pricing_item_id=$2`, [offering.description, row.property_pricing_item_id]);
          priceVersionsAdded.push({ propertyId, code: offering.code, versionNo: 2 });
        } else if (!row.reason?.includes(demoNote)) {
          throw new Error(`Missing demo provenance for ${offering.code} at Property ${propertyId}.`);
        }
        continue;
      }

      const item = await client.query(`INSERT INTO property_pricing_items(owner_id,property_id,kind,code,name,description,unit) VALUES($1,$2,'FLEXIBLE_SERVICE',$3,$4,$5,$6) RETURNING property_pricing_item_id`, [ownerId, propertyId, offering.code, offering.name, offering.description, offering.unit]);
      const itemId = item.rows[0].property_pricing_item_id;
      await client.query(`
        INSERT INTO property_flexible_service_configurations(
          property_pricing_item_id,owner_id,property_id,kind,service_mode,opens_at,closes_at,
          open_monday,open_tuesday,open_wednesday,open_thursday,open_friday,open_saturday,open_sunday,
          slot_duration_minutes,capacity_per_slot,package_duration_count,package_duration_unit
        ) VALUES($1,$2,$3,'FLEXIBLE_SERVICE','BOOKING',$4::time,$5::time,$6,$7,$8,$9,$10,$11,$12,$13,$14,NULL,NULL)
      `, [itemId, ownerId, propertyId, offering.opensAt, offering.closesAt, ...[1, 2, 3, 4, 5, 6, 7].map((day) => offering.weekdays.includes(day)), offering.duration, offering.capacity]);
      await client.query(`
        INSERT INTO property_price_versions(
          property_pricing_item_id,owner_id,property_id,kind,version_no,effective_from,unit_price,
          source_name,source_reference,published_at,published_by_account_id,reason,created_by_account_id
        ) VALUES($1,$2,$3,'FLEXIBLE_SERVICE',1,$4::date,$5,'Dữ liệu mô phỏng',$6,now(),$7,$8,$7)
      `, [itemId, ownerId, propertyId, effectiveFrom, offering.unitPrice.toString(), demoNote, actorAccountId, demoNote]);
      additions.push({ propertyId, kind: "BOOKING", name: offering.name, unitPrice: offering.unitPrice.toString(), facility: false });
    }
  }

  const verify = await client.query(`
    SELECT p.property_id,p.name,
      count(DISTINCT f.property_facility_id) FILTER(WHERE f.active AND f.description LIKE '%Dữ liệu mô phỏng để kiểm thử%')::int demo_facilities,
      count(DISTINCT i.property_pricing_item_id) FILTER(WHERE i.status='active' AND i.code LIKE 'DEMO_%' AND i.code<>'DEMO_LAUNDRY')::int demo_services,
      count(DISTINCT i.property_pricing_item_id) FILTER(WHERE i.status='active' AND i.code LIKE 'DEMO_%' AND i.code<>'DEMO_LAUNDRY' AND v.unit_price=0)::int free_bookings,
      count(DISTINCT i.property_pricing_item_id) FILTER(WHERE i.status='active' AND i.code LIKE 'DEMO_%' AND i.code<>'DEMO_LAUNDRY' AND v.unit_price>0)::int paid_bookings
    FROM properties p LEFT JOIN property_facilities f ON f.property_id=p.property_id AND f.owner_id=p.owner_id
    LEFT JOIN property_pricing_items i ON i.property_id=p.property_id AND i.owner_id=p.owner_id AND i.kind='FLEXIBLE_SERVICE'
    LEFT JOIN LATERAL (
      SELECT pv.unit_price FROM property_price_versions pv
      WHERE pv.property_pricing_item_id=i.property_pricing_item_id
      ORDER BY pv.effective_from DESC,pv.version_no DESC LIMIT 1
    ) v ON true
    WHERE p.property_id BETWEEN 2 AND 12 GROUP BY p.property_id ORDER BY p.property_id
  `);
  if (verify.rowCount !== 11 || verify.rows.some((row) => row.demo_facilities < 1 || row.free_bookings < 1 || row.paid_bookings !== 0)) {
    throw new Error(`Post-insert verification failed; rolling back (${JSON.stringify(verify.rows)}).`);
  }
  const tableCount = await client.query(`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  if (tableCount.rows[0]?.count !== 47) throw new Error("Unexpected catalog change; rolling back.");

  if (apply) await client.query("COMMIT");
  else await client.query("ROLLBACK");
  console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY_RUN_ROLLED_BACK", properties: verify.rows, planned_or_added: additions.length, price_versions_added: priceVersionsAdded, catalog_tables: tableCount.rows[0].count, booking_rows_seeded: 0 }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`SEED_FAILED; transaction rolled back: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
