import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { Prisma, PrismaClient } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = parseEnv(await readFile(path.join(root, '.env.neon'), 'utf8'));
const database = new URL(env.DATABASE_URL ?? '');
if (env.NEON_BRANCH !== 'production'
  || database.pathname !== '/neondb'
  || database.hostname !== 'ep-polished-field-a1z99rb7-pooler.ap-southeast-1.aws.neon.tech') {
  throw new Error('Từ chối ghi: chỉ cho phép đúng Neon goctro-shared-dev / production / neondb đã xác minh.');
}
process.env.DATABASE_URL = env.DATABASE_URL;

const inputs = [
  { invoiceNo: 'INV-23-20260911', electricity: '342.8', water: '30.75' },
  { invoiceNo: 'INV-24-20260903', electricity: '242.4', water: '21.00' },
  { invoiceNo: 'INV-25-20260913', electricity: '363.0', water: '33.00' },
  { invoiceNo: 'INV-26-20260905', electricity: '277.0', water: '24.25' },
  { invoiceNo: 'INV-27-20260915', electricity: '385.6', water: '36.50' },
  { invoiceNo: 'INV-28-20260907', electricity: '290.9', water: '26.25' },
  { invoiceNo: 'INV-29-20260917', electricity: '459.2', water: '38.25' },
  { invoiceNo: 'INV-30-20260909', electricity: '310.9', water: '30.50' },
  { invoiceNo: 'INV-31-20260919', electricity: '472.1', water: '42.30' },
  { invoiceNo: 'INV-22-20260901', electricity: '203.1', water: '18.65' },
];

const prisma = new PrismaClient();
const select = {
  invoiceId: true, invoiceNo: true, ownerId: true, contractId: true, periodStart: true, periodEnd: true,
  status: true, snapshotKind: true, revision: true,
  electricityPreviousKwh: true, electricityCurrentKwh: true,
  waterPreviousM3: true, waterCurrentM3: true,
  contract: { select: {
    contractNo: true, status: true, initialElectricKwh: true, initialWaterM3: true,
    room: { select: { roomCode: true, status: true, roomResidents: { where: { status: 'active', endedAt: null }, select: { occupancyId: true } } } },
  } },
};

function canonical(value) { return value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(3); }
function validate(rows) {
  if (rows.length !== inputs.length) throw new Error(`Cần đúng ${inputs.length} hóa đơn demo; tìm thấy ${rows.length}. Không ghi gì.`);
  const byNo = new Map(rows.map((row) => [row.invoiceNo, row]));
  for (const input of inputs) {
    const row = byNo.get(input.invoiceNo);
    if (!row
      || row.status !== 'draft'
      || row.snapshotKind !== 'NOT_FINALIZED'
      || !row.contract.contractNo.startsWith('DEMO-RENT-2026-')
      || row.contract.status !== 'active'
      || row.contract.room.status !== 'occupied'
      || row.contract.room.roomResidents.length === 0
      || row.periodEnd.toISOString().slice(0, 10) >= new Date().toISOString().slice(0, 10)
      || row.electricityCurrentKwh !== null || row.waterCurrentM3 !== null
      || canonical(row.electricityPreviousKwh) !== canonical(row.contract.initialElectricKwh)
      || canonical(row.waterPreviousM3) !== canonical(row.contract.initialWaterM3)) {
      throw new Error(`Hóa đơn ${input.invoiceNo} không còn khớp tiền điều kiện demo/nháp; không ghi gì.`);
    }
    if (Number(input.electricity) <= Number(row.electricityPreviousKwh)
      || Number(input.water) <= Number(row.waterPreviousM3)) {
      throw new Error(`Chỉ số của ${input.invoiceNo} phải lớn hơn số đầu kỳ; không ghi gì.`);
    }
  }
  return byNo;
}

try {
  const run = async (db) => {
    const rows = await db.invoice.findMany({
      where: { invoiceNo: { in: inputs.map((item) => item.invoiceNo) } },
      select,
      orderBy: { invoiceNo: 'asc' },
    });
    const byNo = validate(rows);
    return inputs.map((input) => {
      const row = byNo.get(input.invoiceNo);
      return {
        invoice_no: row.invoiceNo,
        room_code: row.contract.room.roomCode,
        period_end: row.periodEnd.toISOString().slice(0, 10),
        electricity_previous_kwh: canonical(row.electricityPreviousKwh),
        electricity_current_kwh: input.electricity,
        water_previous_m3: canonical(row.waterPreviousM3),
        water_current_m3: input.water,
        status_remains: 'draft',
      };
    });
  };

  if (process.argv.includes('--verify')) {
    const rows = await prisma.invoice.findMany({
      where: { invoiceNo: { in: inputs.map((item) => item.invoiceNo) } },
      select,
      orderBy: { invoiceNo: 'asc' },
    });
    if (rows.length !== inputs.length) throw new Error('Không đủ hóa đơn để hậu kiểm; không có dữ liệu nào được ghi trong bước này.');
    const byNo = new Map(rows.map((row) => [row.invoiceNo, row]));
    const verified = inputs.map((input) => {
      const row = byNo.get(input.invoiceNo);
      if (!row || row.status !== 'draft'
        || row.snapshotKind !== 'NOT_FINALIZED'
        || canonical(row.electricityCurrentKwh) !== canonical(input.electricity)
        || canonical(row.waterCurrentM3) !== canonical(input.water)) {
        throw new Error(`Hậu kiểm chưa khớp cho ${input.invoiceNo}.`);
      }
      return { invoice_no: row.invoiceNo, room_code: row.contract.room.roomCode, electricity_kwh: canonical(row.electricityCurrentKwh), water_m3: canonical(row.waterCurrentM3), status: row.status };
    });
    console.log(JSON.stringify({ mode: 'verified-read-only', target: 'production/neondb', count: verified.length, invoices_finalized: 0, verified }, null, 2));
  } else {
  const preview = await run(prisma);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', target: 'production/neondb', data_source: 'synthetic demo readings', updates: preview }, null, 2));
    console.log('Chưa có dữ liệu nào được ghi. Thêm --apply để ghi giao dịch demo vào 10 hóa đơn nháp đã kiểm tra.');
    process.exitCode = 0;
  } else {
    const backupDir = path.join(root, '.local', 'setup-backups');
    await mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `neon-before-meter-demo-${Date.now()}.json`);
    const before = await prisma.invoice.findMany({
      where: { invoiceNo: { in: inputs.map((item) => item.invoiceNo) } },
      select: { invoiceId: true, invoiceNo: true, ownerId: true, contractId: true, status: true, revision: true, periodStart: true, periodEnd: true, electricityPreviousKwh: true, electricityCurrentKwh: true, waterPreviousM3: true, waterCurrentM3: true },
      orderBy: { invoiceNo: 'asc' },
    });
    const backupBody = JSON.stringify(before.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value?.toString?.() ?? value]))), null, 2) + '\n';
    await writeFile(backupPath, backupBody, { flag: 'wx', mode: 0o600 });
    const backupSha256 = createHash('sha256').update(backupBody).digest('hex');

    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE invoice_no IN (${Prisma.join(inputs.map((item) => item.invoiceNo))}) ORDER BY invoice_id FOR UPDATE`;
      if (locked.length !== inputs.length) throw new Error('Tập hóa đơn thay đổi trong lúc khóa; rollback.');
      const freshRows = await tx.invoice.findMany({
        where: { invoiceNo: { in: inputs.map((item) => item.invoiceNo) } },
        select,
        orderBy: { invoiceNo: 'asc' },
      });
      const freshByNo = validate(freshRows);
      for (const input of inputs) {
        const row = freshByNo.get(input.invoiceNo);
        await tx.invoice.update({
          where: { invoiceId: row.invoiceId },
          data: { electricityCurrentKwh: input.electricity, waterCurrentM3: input.water },
        });
      }
    }, { isolationLevel: 'Serializable' });

    const afterRows = await prisma.invoice.findMany({
      where: { invoiceNo: { in: inputs.map((item) => item.invoiceNo) } },
      select,
      orderBy: { invoiceNo: 'asc' },
    });
    const afterByNo = new Map(afterRows.map((row) => [row.invoiceNo, row]));
    const after = inputs.map((input) => {
      const row = afterByNo.get(input.invoiceNo);
      if (!row || row.status !== 'draft'
        || canonical(row.electricityCurrentKwh) !== input.electricity
        || canonical(row.waterCurrentM3) !== input.water) {
        throw new Error(`Không xác minh được số liệu sau ghi cho ${input.invoiceNo}.`);
      }
      return {
        invoice_no: row.invoiceNo,
        room_code: row.contract.room.roomCode,
        period_end: row.periodEnd.toISOString().slice(0, 10),
        electricity_previous_kwh: canonical(row.electricityPreviousKwh),
        electricity_current_kwh: canonical(row.electricityCurrentKwh),
        water_previous_m3: canonical(row.waterPreviousM3),
        water_current_m3: canonical(row.waterCurrentM3),
        status_remains: row.status,
      };
    });
    console.log(JSON.stringify({ mode: 'applied', target: 'production/neondb', data_source: 'synthetic demo readings', updated_drafts: after.length, meter_reading_rows_added: 0, invoices_finalized: 0, backup_path: path.relative(root, backupPath), backup_sha256: backupSha256, updates: after }, null, 2));
  }
  }
} finally {
  await prisma.$disconnect();
}
