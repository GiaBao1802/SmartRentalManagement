import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";
import { PrismaPropertyRoomRepository } from "../src/properties/property-room.repository.js";
import { validateRoomCreate } from "../src/properties/property-room.validation.js";
import { PrismaContractRepository } from "../src/contracts/contract.repository.js";
import { validateContractCreate } from "../src/contracts/contract.validation.js";
import { PrismaResidentOccupancyRepository } from "../src/residents/resident.repository.js";
import { PrismaRoomImageRepository } from "../src/room-images/room-image.repository.js";
import { LocalRoomImageStorage } from "../src/room-images/storage.js";
import { LocalResidentAvatarStorage } from "../src/residents/resident-avatar.storage.js";
import { PrismaResidentAvatarRepository } from "../src/residents/resident-avatar.repository.js";
import { validateImage } from "../src/room-images/validation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env.neon") });
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
if (!databaseUrl) throw new Error("Missing DATABASE_URL_UNPOOLED in root .env.neon.");
const url = new URL(databaseUrl);
if (url.hostname !== "ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech" || url.pathname !== "/neondb") {
  throw new Error("Refusing to write: target is not the verified Neon shared-dev neondb endpoint.");
}

const OWNER_ID = 6n;
const ADMIN_ID = 6n;
const PROPERTY_ID = 12n;
const PROPERTY_CODE = "DEMO-OWNER6-202610";
const FIXTURE_TAG = "DEMO-OWNER6-202610";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const roomPhotoUrls = [
  "https://images.unsplash.com/photo-1720565861831-693be6962331?auto=format&fit=crop&fm=jpg&q=65&w=1200",
  "https://images.unsplash.com/photo-1757742690834-aa581b9f53b2?auto=format&fit=crop&fm=jpg&q=65&w=1200",
  "https://images.unsplash.com/photo-1775241186452-c3d99b09f223?auto=format&fit=crop&fm=jpg&q=65&w=1200",
  "https://images.unsplash.com/photo-1771327811795-6197403af846?auto=format&fit=crop&fm=jpg&q=65&w=1200",
  "https://images.unsplash.com/photo-1773368807946-b1837900939c?auto=format&fit=crop&fm=jpg&q=65&w=1200",
  "https://images.unsplash.com/photo-1750271336580-f11df678e840?auto=format&fit=crop&fm=jpg&q=65&w=1200",
];
const avatarUrls = [
  "https://randomuser.me/api/portraits/women/44.jpg",
  "https://randomuser.me/api/portraits/men/32.jpg",
  "https://randomuser.me/api/portraits/women/68.jpg",
  "https://randomuser.me/api/portraits/men/75.jpg",
  "https://randomuser.me/api/portraits/women/21.jpg",
  "https://randomuser.me/api/portraits/men/11.jpg",
  "https://randomuser.me/api/portraits/women/50.jpg",
  "https://randomuser.me/api/portraits/men/55.jpg",
];

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "GoctroDemoSeed/1.0" } });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Image source unavailable: ${new URL(url).host} (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return validateImage(bytes, response.headers.get("content-type")!.split(";")[0]!, "photo.jpg");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const roomStorage = new LocalRoomImageStorage();
const avatarStorage = new LocalResidentAvatarStorage();
const roomImages = new PrismaRoomImageRepository(prisma);
const avatars = new PrismaResidentAvatarRepository(prisma);

async function main() {
  const target = await prisma.$queryRaw<Array<{ database: string; branchId: string }>>`SELECT current_database() AS database, current_setting('neon.branch_id', true) AS "branchId"`;
  if (target[0]?.database !== "neondb" || target[0]?.branchId !== "br-spring-frog-a1rqjhvq") throw new Error("Refusing to write: Neon branch/database is not the verified shared-dev target.");
  const admin = await prisma.account.findFirst({ where: { accountId: ADMIN_ID, ownerId: OWNER_ID, role: "admin", status: "active" }, select: { accountId: true } });
  const property = await prisma.property.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, propertyCode: PROPERTY_CODE }, select: { propertyId: true, rooms: { select: { roomId: true, roomCode: true, images: { select: { roomImageId: true } } } } } });
  if (!admin || !property) throw new Error("The expected Owner 6 demo admin/property was not found.");
  if (property.rooms.length !== 10 || property.rooms.some((room) => room.images.length !== 0)) throw new Error("Fixture changed since review; expected the original 10 rooms without photos. No writes made.");
  const duplicate = await prisma.room.findFirst({ where: { ownerId: OWNER_ID, propertyId: PROPERTY_ID, roomCode: { in: ["T11", "T12", "T13", "T14", "T15"] } }, select: { roomId: true } });
  if (duplicate) throw new Error("T11–T15 already exist. No changes made; inspect the fixture before retrying.");
  const fixtureResidents = await prisma.resident.findMany({ where: { ownerId: OWNER_ID, archivedAt: null, email: { in: ["demo-owner6-t01@example.test", "demo-owner6-t02@example.test", "demo-owner6-t03@example.test"] } }, select: { residentId: true, avatarStorageKey: true, roomResidents: { where: { status: "active" }, select: { room: { select: { roomCode: true } } } } } });
  if (fixtureResidents.length !== 3 || fixtureResidents.some((resident) => resident.avatarStorageKey || resident.roomResidents.length !== 1 || !["T01", "T02", "T03"].includes(resident.roomResidents[0]!.room.roomCode))) throw new Error("Expected exactly the three synthetic T01–T03 residents without avatars; no writes made.");

  const roomImagesToDownload = await Promise.all(roomPhotoUrls.map(download));
  const avatarImagesToDownload = await Promise.all(avatarUrls.map(download));
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ result: "dry_run_passed", target: { project: "goctro-shared-dev", branch: "production", database: "neondb", owner_id: OWNER_ID.toString() }, existing_fixture_rooms: property.rooms.length, new_rooms_planned: 5, room_images_validated: roomImagesToDownload.length, avatars_validated: avatarImagesToDownload.length, existing_fixture_residents: fixtureResidents.length }));
    return;
  }
  const roomsRepository = new PrismaPropertyRoomRepository(prisma);
  const contractsRepository = new PrismaContractRepository(prisma);
  const occupancyRepository = new PrismaResidentOccupancyRepository(prisma);
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await hashPassword(password);
  const createdRooms: Array<{ roomId: bigint; roomCode: string; defaultRent: bigint; defaultCapacity: number }> = [];
  const residentIds: bigint[] = [];
  const accountEmails: string[] = [];
  const roomCodes = ["T11", "T12", "T13", "T14", "T15"];
  const amenities = [
    ["air_conditioning", "wifi", "private_bathroom", "water_heater"],
    ["parking", "washing_machine", "refrigerator", "balcony"],
    ["air_conditioning", "elevator", "private_kitchen", "cats_allowed"],
    ["wifi", "private_bathroom", "dogs_allowed"],
    ["refrigerator", "water_heater", "private_kitchen", "parking"],
  ];

  for (let index = 0; index < roomCodes.length; index++) {
    const roomCode = roomCodes[index]!;
    const rent = [2_800_000, 3_300_000, 3_900_000, 4_400_000, 4_900_000][index]!;
    const roomInput = validateRoomCreate({
      room_code: roomCode, default_rent: String(rent), area_m2: ["18.00", "21.50", "25.00", "29.00", "33.00"][index]!,
      default_capacity: index === 0 || index === 4 ? 2 : 1, is_active: true, is_public: false, status: "available",
      public_description: `[DỮ LIỆU MÔ PHỎNG] Phòng ${roomCode}, chỉ dùng kiểm thử nội bộ.`, marketplace_amenities: amenities[index],
    });
    const room = await roomsRepository.createRoom(OWNER_ID, PROPERTY_ID, roomInput);
    if (!room) throw new Error(`Could not create demo room ${roomCode}.`);
    createdRooms.push({ roomId: room.roomId, roomCode, defaultRent: room.defaultRent, defaultCapacity: room.defaultCapacity });

    const email = `demo-owner6-${roomCode.toLowerCase()}@example.test`;
    const resident = await prisma.resident.create({ data: { ownerId: OWNER_ID, fullName: `Người thuê thử nghiệm ${roomCode}`, email, residenceStatus: "left", residenceRegistrationStatus: "not_completed" } });
    const account = await prisma.account.create({ data: { residentId: resident.residentId, role: "resident", email, passwordHash, status: "active" }, select: { accountId: true } });
    if (!account.accountId) throw new Error(`Could not create synthetic account for ${roomCode}.`);
    residentIds.push(resident.residentId);
    accountEmails.push(email);

    const start = date("2026-10-29");
    const end = date("2027-10-28");
    const contractInput = validateContractCreate({
      contract_no: `${FIXTURE_TAG}-${roomCode}`, room_id: room.roomId.toString(), representative_resident_id: resident.residentId.toString(),
      start_date: "2026-10-29", end_date: "2027-10-28", rent_amount: room.defaultRent.toString(), deposit_amount: room.defaultRent.toString(),
      resident_capacity: room.defaultCapacity, initial_electric_kwh: `${310 + index * 35}.000`, initial_water_m3: `${30 + index * 3}.000`,
    });
    const draft = await contractsRepository.create(OWNER_ID, contractInput);
    if (!draft) throw new Error(`Could not create test contract ${roomCode}.`);
    const active = await contractsRepository.activate(OWNER_ID, ADMIN_ID, draft.contractId);
    if (!active) throw new Error(`Could not activate test contract ${roomCode}.`);
    const occupancy = await occupancyRepository.addOccupancy(OWNER_ID, room.roomId, resident.residentId, active.contractId, start);
    if (!occupancy || typeof occupancy === "string") throw new Error(`Could not create test occupancy ${roomCode}: ${String(occupancy)}.`);
  }

  const allRooms = [...property.rooms, ...createdRooms].sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  const savedKeys: string[] = [];
  try {
    for (let index = 0; index < allRooms.length; index++) {
      const item = roomImagesToDownload[index % roomImagesToDownload.length]!;
      const key = await roomStorage.put(item.bytes, item.contentType);
      savedKeys.push(key);
      const result = await roomImages.add(OWNER_ID, PROPERTY_ID, allRooms[index]!.roomId, key);
      if (result === "missing" || result === "limit") throw new Error(`Could not attach demo photo to ${allRooms[index]!.roomCode}: ${result}.`);
    }
    const avatarTargets = [...fixtureResidents.map((resident) => resident.residentId), ...residentIds];
    for (let index = 0; index < avatarTargets.length; index++) {
      const item = avatarImagesToDownload[index]!;
      const key = await avatarStorage.put(item.bytes, item.contentType);
      const result = await avatars.replace(OWNER_ID, avatarTargets[index]!, key);
      if (!result) { await avatarStorage.delete(key); throw new Error(`Could not attach demo avatar for Resident ${avatarTargets[index]}.`); }
    }
  } catch (error) {
    // Keep any keys still referenced by committed RoomImage rows; remove only unreferenced files.
    const references = await prisma.roomImage.findMany({ where: { storageKey: { in: savedKeys } }, select: { storageKey: true } });
    const referenced = new Set(references.map((row) => row.storageKey));
    await Promise.all(savedKeys.filter((key) => !referenced.has(key)).map((key) => roomStorage.delete(key).catch(() => {})));
    throw error;
  }

  console.log(JSON.stringify({
    result: "created", target: { project: "goctro-shared-dev", branch: "production", database: "neondb", owner_id: OWNER_ID.toString() },
    new_rooms: createdRooms.length, active_test_occupancies: residentIds.length, resident_test_accounts: accountEmails,
    total_fixture_rooms_with_images: allRooms.length, demo_avatars: fixtureResidents.length + residentIds.length,
    test_password: password, note: "For local/demo testing only; all new identities use the reserved example.test domain; none of these rooms is public.",
  }));
}

try { await main(); } finally { await prisma.$disconnect(); }
