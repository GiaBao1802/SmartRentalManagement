import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
// @ts-expect-error Shared operational JavaScript; intentionally no generated declaration.
import { loadBaseline, readCatalog, assertCatalog, parseTarget } from '../../scripts/database-v18.mjs';

export const demoPassword = 'Goctro123456789';
const emails = ['admin.one@example.test', 'resident.one@example.test'] as const;
const root = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: process.env.GOCTRO_SETUP_CONFIG_DIR ? path.join(process.env.GOCTRO_SETUP_CONFIG_DIR, 'backend.env') : path.join(root, 'backend/.env') });

export async function provisionDemo(mode: string, database: string, confirmedTarget: string, resetConfirmation?: string) {
  if (process.env.NODE_ENV !== 'development') throw new Error('Chỉ cho phép NODE_ENV=development.');
  if (!['INITIAL', 'RESET', 'STATUS'].includes(mode)) throw new Error('Chọn INITIAL, RESET hoặc STATUS.');
  const target = parseTarget(process.env.DATABASE_URL, database);
  const label = `${target.host}:${target.port}/${target.database}`;
  if (confirmedTarget !== label) throw new Error('Target xác nhận không khớp; chưa đổi credential.');
  if (mode === 'RESET' && resetConfirmation !== `RESET ${label} ${emails.join(' ')}`) throw new Error('Thiếu xác nhận RESET đúng target và hai tài khoản.');
  if (demoPassword.length < 12 || demoPassword.length > 1024) throw new Error('Mật khẩu demo không đạt policy 12–1024 ký tự.');
  const baseline = await loadBaseline();
  // Exact reviewed seed credentials are evidence of the untouched fixture; hash format is not evidence.
  const seedHashes = emails.map(email => {
    const match = baseline.seedSql.match(new RegExp(`'${email.replaceAll('.', '\\.')}','[^']*','([^']+)','active'`));
    if (!match) throw new Error('Không xác định được credential fixture từ seed đã review.');
    return match[1]!;
  });
  const pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      await client.query(mode === 'STATUS' ? 'BEGIN READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query("SET LOCAL search_path=public,pg_catalog; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
      const server = (await client.query("SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port, current_setting('server_version_num')::int AS version")).rows[0];
      if (server.database !== target.database || server.port !== target.port || !['127.0.0.1', '::1'].includes(server.address) || server.version < 180006 || server.version >= 190000) throw new Error('Instance không đúng local PostgreSQL 18.6+ đã xác nhận.');
      assertCatalog(await readCatalog(client), baseline.catalog);
      const schemas = await client.query("SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_' LIMIT 1");
      if (schemas.rowCount) throw new Error('Có schema ngoài baseline.');
      if (mode !== 'STATUS') await client.query('SELECT pg_advisory_xact_lock(1800180018)');
      const lock = mode === 'STATUS' ? '' : ' FOR UPDATE OF a';
      const accounts = await client.query(`SELECT a.account_id::text,a.owner_id::text,a.resident_id::text,a.role,a.email,a.phone,a.status,a.password_hash FROM accounts a WHERE lower(a.email)=ANY($1::text[]) ORDER BY a.account_id${lock}`, [emails]);
      if (accounts.rowCount !== 2) throw new Error('Phải có đúng hai Account demo đã seed.');
      const [admin, resident] = accounts.rows;
      if (admin.account_id !== '1' || admin.email !== emails[0] || admin.role !== 'admin' || admin.status !== 'active' || admin.owner_id !== '1' || admin.resident_id !== null) throw new Error('Admin demo sai identity/role/trạng thái/Owner.');
      if (resident.account_id !== '2' || resident.email !== emails[1] || resident.role !== 'resident' || resident.status !== 'active' || resident.resident_id !== '1001' || resident.owner_id !== null || resident.phone !== '+84000000101') throw new Error('Resident demo sai identity/role/trạng thái/liên kết.');
      const fixture = await client.query(`SELECT 1 FROM owners o JOIN residents r ON r.owner_id=o.owner_id
        JOIN room_residents rr ON rr.owner_id=r.owner_id AND rr.resident_id=r.resident_id AND rr.status='active' AND rr.ended_at IS NULL
        JOIN rooms rm ON rm.room_id=rr.room_id AND rm.owner_id=o.owner_id
        JOIN properties p ON p.property_id=rm.property_id AND p.owner_id=o.owner_id
        JOIN contracts c ON c.owner_id=o.owner_id AND c.room_id=rr.room_id AND c.representative_resident_id=r.resident_id AND c.status='active' AND c.end_date>=CURRENT_DATE
        WHERE o.owner_id=1 AND r.resident_id=1001 AND r.archived_at IS NULL LIMIT 1`);
      if (!fixture.rowCount) throw new Error('Demo thiếu Owner/Resident/phòng/occupancy/hợp đồng hợp lệ để test portal.');
      const seeded = accounts.rows.every((account, i) => account.password_hash === seedHashes[i]);
      const provisioned = (await Promise.all(accounts.rows.map(account => verifyPassword(demoPassword, account.password_hash)))).every(Boolean);
      if (mode === 'STATUS') {
        await client.query('ROLLBACK');
        return seeded ? 'seeded' : provisioned ? 'provisioned' : 'unknown';
      }
      if (mode === 'INITIAL' && !seeded) throw new Error(provisioned ? 'Đã provision; INITIAL bị từ chối. Giữ mật khẩu hiện có hoặc chọn RESET có xác nhận.' : 'Credential không rõ/partial/đã thay đổi; INITIAL bị từ chối. Chỉ RESET sau xác nhận rõ.');
      for (const account of accounts.rows) await client.query('UPDATE accounts SET password_hash=$1,updated_at=now() WHERE account_id=$2', [await hashPassword(demoPassword), account.account_id]);
      await client.query('COMMIT');
      return 'updated';
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  provisionDemo(value('--mode') || '', value('--database') || '', value('--confirm-target') || '', value('--confirm-reset'))
    .then(state => {
      console.log(`DEMO_STATE=${state}`);
      if (state === 'updated') console.log(`Đã thiết lập credential demo.\nAdmin: ${emails[0]}\nResident: ${emails[1]}\nMật khẩu local/dev: ${demoPassword}\nResident dùng email; phone fixture không được Auth V1 chấp nhận. Không tạo tài khoản hoặc đổi role/status/hồ sơ.`);
    }).catch(error => {
      const message = error?.name === 'SetupError' ? 'Target/catalog không tương thích baseline V1.8 đã review; kiểm tra cấu hình và schema trước khi thử lại.' : error?.code ? `PostgreSQL từ chối thao tác (SQLSTATE ${error.code}); đã yêu cầu rollback, không in SQL/secret.` : error instanceof Error ? error.message : 'Lỗi không xác định.';
      console.error(`Không provision được credential demo: ${message}`); process.exitCode = 1;
    });
}
