import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import dotenv from 'dotenv';
import { assertCatalog, loadBaseline, readCatalog, unwrapTransaction } from './database-v19.mjs';

const projectId = 'patient-scene-93926977';
const productionBranchId = 'br-spring-frog-a1rqjhvq';
const productionHost = 'ep-polished-field-a1z99rb7.ap-southeast-1.aws.neon.tech';
const backupBranchId = 'br-bold-truth-a1ca4n2p';
const backupBranchName = 'goctro-v115-ai-fixture-backup-20261028';
const expectedDatabase = 'neondb';
const config = dotenv.parse(await readFile('.env.neon'));

if (process.argv[2] !== '--apply-neon-v116') {
  throw new Error('Explicit command required: node scripts/promote-neon-v116.mjs --apply-neon-v116');
}
if (config.NEON_BRANCH !== 'production') throw new Error('Only the configured Neon production branch is supported.');
if (!config.DATABASE_URL_UNPOOLED) throw new Error('DATABASE_URL_UNPOOLED is required for schema promotion.');
const target = new URL(config.DATABASE_URL_UNPOOLED);
if (target.hostname !== productionHost || target.pathname !== `/${expectedDatabase}`) {
  throw new Error('Configured direct connection is not the verified goctro-shared-dev production endpoint.');
}
function neonCli(args) {
  return execFileSync('cmd.exe', ['/d', '/s', '/c', `neon.cmd ${args.join(' ')}`], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

const branchList = neonCli(['branches', 'list', '--project-id', projectId]);
if (!branchList.includes(productionBranchId) || !branchList.includes(backupBranchId)) {
  throw new Error('Neon CLI could not verify both the expected production and backup branches.');
}
const backupInfo = neonCli(['branches', 'get', backupBranchId, '--project-id', projectId]);
if (!/^Current State\s+ready$/m.test(backupInfo) || !new RegExp(`^Parent ID\\s+${productionBranchId}$`, 'm').test(backupInfo)) {
  throw new Error('The V1.15 backup branch is not ready or does not descend from production.');
}

const v115 = await loadBaseline('database/baselines/v1.15', '1.15');
const v116 = await loadBaseline('database/baselines/v1.16', '1.16');
const backupUrl = new URL(neonCli([
  'connection-string', backupBranchId, '--project-id', projectId,
  '--database-name', expectedDatabase, '--role-name', 'neondb_owner',
  '--endpoint-type', 'read_only', '--ssl', 'verify-full',
]).trim());
if (backupUrl.hostname === productionHost || backupUrl.pathname !== `/${expectedDatabase}`) {
  throw new Error('Neon backup connection did not resolve to a separate read-only snapshot endpoint.');
}
const migration = unwrapTransaction(await readFile(
  'database/baselines/v1.16/migrations/V1_15_to_V1_16_marketplace_amenities.sql',
  'utf8',
));
const client = new pg.Client({ connectionString: target.href, connectionTimeoutMillis: 10000, query_timeout: 120000 });
const backupClient = new pg.Client({ connectionString: backupUrl.href, connectionTimeoutMillis: 10000, query_timeout: 120000 });

async function fingerprints(connection) {
  const tables = v115.catalog.relations.filter((row) => row.kind === 'r').map((row) => row.name);
  const result = {};
  for (const table of tables) {
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const { rows: [row] } = await connection.query(
      `SELECT count(*)::text AS count,md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash ` +
      `FROM (SELECT md5((to_jsonb(t) - 'marketplace_amenities')::text) AS row_hash FROM ${quoted} t) x`,
    );
    result[table] = row;
  }
  return result;
}

const residents = [
  { ownerEmail: 'admin.owner01@example.test', nationalId: '079999999901', name: 'Cư dân kiểm thử Mai', phone: '+84000000901', email: 'ai.fixture.01@example.test', birthDate: '1996-04-12', gender: 'female', registration: 'temporary_resident', meterElectric: 810, meterWater: 35 },
  { ownerEmail: 'admin.owner02@example.test', nationalId: '079999999902', name: 'Cư dân kiểm thử Nam', phone: '+84000000902', email: 'ai.fixture.02@example.test', birthDate: '1993-08-21', gender: 'male', registration: 'not_completed', meterElectric: 1140, meterWater: 48 },
  { ownerEmail: 'admin.owner03@example.test', nationalId: '079999999903', name: 'Cư dân kiểm thử Linh', phone: '+84000000903', email: 'ai.fixture.03@example.test', birthDate: '2000-01-05', gender: 'female', registration: 'temporary_absence', meterElectric: 620, meterWater: 29 },
  { ownerEmail: 'admin.owner04@example.test', nationalId: '079999999904', name: 'Cư dân kiểm thử Huy', phone: '+84000000904', email: 'ai.fixture.04@example.test', birthDate: '1989-11-03', gender: 'male', registration: 'temporary_resident', meterElectric: 1530, meterWater: 62 },
  { ownerEmail: 'admin.owner05@example.test', nationalId: '079999999905', name: 'Cư dân kiểm thử Vy', phone: '+84000000905', email: 'ai.fixture.05@example.test', birthDate: '1998-06-18', gender: 'unspecified', registration: 'not_completed', meterElectric: 970, meterWater: 41 },
];

const amenityPalettes = [
  ['air_conditioning', 'wifi', 'refrigerator', 'water_heater'],
  ['parking', 'wifi', 'private_bathroom'],
  ['air_conditioning', 'elevator', 'balcony'],
  ['washing_machine', 'wifi', 'private_kitchen', 'water_heater'],
  ['refrigerator', 'water_heater', 'cats_allowed'],
  ['air_conditioning', 'parking', 'wifi', 'dogs_allowed'],
  ['elevator', 'private_bathroom', 'balcony'],
  ['washing_machine', 'private_kitchen', 'water_heater'],
  ['wifi', 'refrigerator', 'private_bathroom', 'air_conditioning'],
  ['parking', 'water_heater', 'dogs_allowed', 'balcony'],
];

try {
  await backupClient.connect();
  assertCatalog(await readCatalog(backupClient), v115.catalog);
  const snapshotRows = await fingerprints(backupClient);
  await client.connect();
  const identity = await client.query(
    "SELECT current_database() AS database, current_user AS role, current_setting('server_version_num') AS version",
  );
  if (identity.rows[0].database !== expectedDatabase || !identity.rows[0].role) {
    throw new Error('Connected database identity did not match the reviewed target.');
  }

  const currentCatalog = await readCatalog(client);
  let fromVersion;
  try {
    assertCatalog(currentCatalog, v116.catalog);
    fromVersion = '1.16';
  } catch (error) {
    if (!String(error.message).includes('Schema differs from the reviewed catalog')) throw error;
    assertCatalog(currentCatalog, v115.catalog);
    fromVersion = '1.15';
  }
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
    await client.query('SELECT pg_advisory_xact_lock(1800180020)');
    assertCatalog(await readCatalog(client), fromVersion === '1.15' ? v115.catalog : v116.catalog);
    const before = await fingerprints(client);
    if (JSON.stringify(snapshotRows) !== JSON.stringify(before)) {
      throw new Error('Production rows differ from the verified pre-change Neon snapshot. Review concurrent changes before seeding.');
    }
    const activeLeaseState = await client.query(`
      SELECT count(*)::int AS active_leases,
             count(*) FILTER (WHERE c.contract_no NOT LIKE 'DEMO-RENT-2026-%')::int AS non_demo_leases
        FROM contracts c WHERE c.status='active'`);
    if (activeLeaseState.rows[0].active_leases !== 10 || activeLeaseState.rows[0].non_demo_leases !== 0) {
      throw new Error('Expected exactly ten synthetic active demo leases before adding fixture residents.');
    }
    const normalized = await client.query(`
      UPDATE rooms r SET status='occupied', is_public=false, updated_at=now()
        FROM contracts c
       WHERE c.room_id=r.room_id AND c.status='active'
         AND c.contract_no LIKE 'DEMO-RENT-2026-%'
         AND (r.status <> 'occupied' OR r.is_public)`);
    const ownerRooms = await client.query(`
      SELECT a.owner_id, a.email AS owner_email, r.room_id, r.property_id, r.room_code, r.default_rent,
             r.default_capacity, r.area_m2
        FROM accounts a
        JOIN LATERAL (
          SELECT candidate.room_id, candidate.property_id, candidate.room_code,
                 candidate.default_rent, candidate.default_capacity, candidate.area_m2
            FROM rooms candidate
           WHERE candidate.owner_id = a.owner_id
             AND candidate.status = 'available' AND candidate.is_active AND candidate.is_public
           ORDER BY candidate.room_id
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        ) r ON true
       WHERE a.role = 'admin'
         AND a.email = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM residents existing
            WHERE existing.owner_id = a.owner_id
              AND existing.national_id = CASE a.email
                WHEN 'admin.owner01@example.test' THEN '079999999901'
                WHEN 'admin.owner02@example.test' THEN '079999999902'
                WHEN 'admin.owner03@example.test' THEN '079999999903'
                WHEN 'admin.owner04@example.test' THEN '079999999904'
                WHEN 'admin.owner05@example.test' THEN '079999999905' END
         )
         AND NOT EXISTS (SELECT 1 FROM contracts active WHERE active.room_id=r.room_id AND active.status='active')
         AND NOT EXISTS (SELECT 1 FROM room_residents current WHERE current.room_id=r.room_id AND current.status='active')
       ORDER BY a.owner_id`,
    [[...new Set(residents.map((resident) => resident.ownerEmail))]],
    );
    if (ownerRooms.rows.length !== 5 || new Set(ownerRooms.rows.map((row) => row.owner_id)).size !== 5) {
      throw new Error('Expected one available public room for each of the five synthetic Owner accounts.');
    }
    if (fromVersion === '1.15') {
      await client.query("SELECT set_config('goctro.allow_locked_db_migration','V1.16',true)");
      await client.query(migration);
      assertCatalog(await readCatalog(client), v116.catalog);
      const afterMigration = await fingerprints(client);
      if (JSON.stringify(before) !== JSON.stringify(afterMigration)) {
        throw new Error('V1.15 row fingerprints changed during migration; transaction rolled back.');
      }
    }

    const orderedRooms = await client.query(
      'SELECT room_id FROM rooms ORDER BY owner_id, property_id, room_code FOR UPDATE',
    );
    for (let i = 0; i < orderedRooms.rows.length; i += 1) {
      await client.query(
        'UPDATE rooms SET marketplace_amenities=$1::text[], updated_at=now() WHERE room_id=$2 AND marketplace_amenities=$3::text[]',
        [amenityPalettes[i % amenityPalettes.length], orderedRooms.rows[i].room_id, []],
      );
    }

    let newResidents = 0;
    let newOccupancies = 0;
    for (let i = 0; i < residents.length; i += 1) {
      const sample = residents[i];
      const ownerRoom = ownerRooms.rows.find((row) => row.owner_email === sample.ownerEmail);
      if (!ownerRoom) throw new Error(`No locked room found for ${sample.ownerEmail}.`);
      const residentResult = await client.query(`
        INSERT INTO residents(owner_id,national_id,full_name,phone,email,birth_date,gender,residence_status,residence_registration_status)
        SELECT owner_id,$2,$3,$4,$5,$6::date,$7,'living',$8 FROM accounts
         WHERE email=$1 AND role='admin'
        ON CONFLICT (owner_id,national_id) DO NOTHING
        RETURNING resident_id`,
      [sample.ownerEmail, sample.nationalId, sample.name, sample.phone, sample.email, sample.birthDate, sample.gender, sample.registration]);
      let residentId = residentResult.rows[0]?.resident_id;
      if (residentId) newResidents += 1;
      else {
        const existing = await client.query('SELECT resident_id FROM residents WHERE owner_id=$1 AND national_id=$2', [ownerRoom.owner_id, sample.nationalId]);
        residentId = existing.rows[0]?.resident_id;
      }
      if (!residentId) throw new Error(`Synthetic resident fixture ${sample.email} could not be resolved.`);

      const contractNo = `DEMO-AI-${sample.nationalId.slice(-3)}-20261028`;
      const contractResult = await client.query(`
        INSERT INTO contracts(contract_no,room_id,property_id,owner_id,representative_resident_id,start_date,end_date,status,revision,rent_amount,deposit_amount,resident_capacity,initial_electric_kwh,initial_water_m3)
        VALUES($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE+364,'active',1,$6,$6,$7,$8,$9)
        ON CONFLICT (contract_no) DO NOTHING
        RETURNING contract_id`,
      [contractNo, ownerRoom.room_id, ownerRoom.property_id, ownerRoom.owner_id, residentId, ownerRoom.default_rent, ownerRoom.default_capacity, sample.meterElectric, sample.meterWater]);
      let contractId = contractResult.rows[0]?.contract_id;
      if (!contractId) {
        const existing = await client.query('SELECT contract_id FROM contracts WHERE contract_no=$1 AND status=\'active\'', [contractNo]);
        contractId = existing.rows[0]?.contract_id;
      }
      if (!contractId) throw new Error(`Synthetic contract ${contractNo} could not be resolved.`);

      const occupancy = await client.query(`
        INSERT INTO room_residents(room_id,property_id,owner_id,resident_id,contract_id,started_at,status)
        VALUES($1,$2,$3,$4,$5,CURRENT_DATE,'active')
        ON CONFLICT (resident_id,room_id,started_at) DO NOTHING
        RETURNING occupancy_id`,
      [ownerRoom.room_id, ownerRoom.property_id, ownerRoom.owner_id, residentId, contractId]);
      if (occupancy.rowCount) newOccupancies += 1;
      await client.query("UPDATE rooms SET status='occupied',is_public=false,updated_at=now() WHERE room_id=$1 AND owner_id=$2", [ownerRoom.room_id, ownerRoom.owner_id]);
    }

    const validation = await client.query(`
      SELECT (SELECT count(*)::int FROM rooms) AS rooms,
             (SELECT count(*)::int FROM rooms WHERE marketplace_amenities <> '{}'::text[]) AS amenity_rooms,
             (SELECT count(DISTINCT code)::int FROM rooms r CROSS JOIN LATERAL unnest(r.marketplace_amenities) AS code) AS distinct_codes,
             (SELECT count(*)::int FROM residents WHERE email LIKE 'ai.fixture.%@example.test') AS added_residents,
             (SELECT count(*)::int FROM room_residents WHERE status='active') AS active_occupancies,
             (SELECT count(*)::int FROM contracts WHERE status='active') AS active_contracts,
             (SELECT count(*)::int FROM rooms WHERE is_active AND is_public AND status='available') AS public_available_rooms,
             (SELECT count(*)::int FROM contracts c JOIN rooms r USING(room_id) WHERE c.status='active' AND (r.status <> 'occupied' OR r.is_public)) AS leased_rooms_marked_available`);
    const summary = validation.rows[0];
    if (summary.rooms !== 100 || summary.amenity_rooms !== 100 || summary.distinct_codes !== 12 ||
        summary.added_residents !== 5 || summary.active_occupancies !== 15 || summary.active_contracts !== 15 ||
        summary.public_available_rooms !== 85 || summary.leased_rooms_marked_available !== 0 ||
        normalized.rowCount !== 10 || newResidents !== 5 || newOccupancies !== 5) {
      throw new Error(`Post-seed validation failed: ${JSON.stringify(summary)}`);
    }
    assertCatalog(await readCatalog(client), v116.catalog);
    await client.query('COMMIT');

    const evidenceDir = path.resolve('.local/setup-backups');
    await mkdir(evidenceDir, { recursive: true });
    const evidence = {
      appliedAt: new Date().toISOString(),
      projectId,
      productionBranchId,
      database: expectedDatabase,
      from: 'V1.15',
      to: 'V1.16',
      migrationAppliedByThisTask: fromVersion === '1.15',
      verifiedSnapshotBranch: { id: backupBranchId, name: backupBranchName, parentId: productionBranchId },
      preexistingRowsMatchedSnapshotBeforeSeeding: true,
      previouslyMisclassifiedDemoRoomsCorrected: normalized.rowCount,
      syntheticAmenityDataForAITesting: true,
      actualPropertyClaims: false,
      addedResidents: newResidents,
      addedActiveOccupancies: newOccupancies,
      summary,
      exactCatalog: 'PASS',
    };
    await writeFile(path.join(evidenceDir, 'neon-v116-promotion-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ result: 'applied_and_verified', identity: identity.rows[0], evidence }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} finally {
  await client.end();
  await backupClient.end();
}
