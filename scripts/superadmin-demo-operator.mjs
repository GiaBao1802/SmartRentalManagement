// Local demo operator utility. Never persist or log the clear invitation token.
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';

if (process.env.NODE_ENV === 'production') throw new Error('Demo operator command is disabled in production');
if (!process.env.DATABASE_URL) throw new Error('Pass an explicit local disposable DATABASE_URL');
const [command, value, reference, operator] = process.argv.slice(2);
if (!['status', 'invite', 'reissue-invite', 'grant-audit', 'revoke-audit'].includes(command) || !value || (command !== 'status' && (!reference || !operator))) {
  throw new Error('Usage: node scripts/superadmin-demo-operator.mjs status <email> | invite|reissue-invite|grant-audit|revoke-audit <email|account-id> <owner-request-ref> <technical-operator>');
}
if (reference && reference.length > 200 || operator && operator.length > 200) throw new Error('Reference or operator is too long');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname) || !/^\/goctro_v116_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Demo operator target must be an explicit local goctro_v116_* disposable database');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const identity = await client.query('SELECT current_database() AS db');
  if (identity.rows[0].db !== url.pathname.slice(1)) throw new Error('Target identity mismatch');
  const actual = await client.query("SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname='public'");
  if (actual.rows[0].tables !== 56) throw new Error('Target is not the 56-table V1.16 rehearsal schema');
  if (command === 'status') {
    const email = value.trim().toLowerCase();
    const rows = await client.query("SELECT a.account_id,a.role,a.status, EXISTS (SELECT 1 FROM platform_permissions p WHERE p.account_id=a.account_id AND p.permission='PLATFORM_AUDIT_READ' AND p.revoked_at IS NULL) audit_permission FROM accounts a WHERE lower(trim(a.email))=$1", [email]);
    const pending = await client.query("SELECT count(*)::int pending_invites FROM platform_operator_invitations WHERE lower(trim(recipient_email))=$1 AND status='pending'", [email]);
    console.log(JSON.stringify({ database: identity.rows[0].db, account: rows.rows[0] ? { account_id: rows.rows[0].account_id, role: rows.rows[0].role, status: rows.rows[0].status, audit_permission: rows.rows[0].audit_permission } : null, pending_invites: pending.rows[0].pending_invites }));
    process.exit(0);
  }
  await client.query('BEGIN');
  let response = 'Updated';
  if (command === 'invite' || command === 'reissue-invite') {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Invalid email');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [email]);
    const conflicts = await client.query('SELECT 1 FROM accounts WHERE lower(trim(email))=$1 UNION ALL SELECT 1 FROM owners WHERE lower(trim(contact_email))=$1 LIMIT 1', [email]);
    if (conflicts.rowCount) throw new Error('Email already belongs to an Account or Owner');
    const pending = await client.query("SELECT invitation_id FROM platform_operator_invitations WHERE lower(trim(recipient_email))=$1 AND status='pending' FOR UPDATE", [email]);
    if (pending.rowCount && command === 'invite') throw new Error('Pending invitation exists; use reissue-invite to revoke it and create a new link');
    if (command === 'reissue-invite') await client.query("UPDATE platform_operator_invitations SET status='revoked' WHERE lower(trim(recipient_email))=$1 AND status='pending'", [email]);
    const raw = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw).digest('hex');
    await client.query('INSERT INTO platform_operator_invitations(recipient_email,token_hash,expires_at,request_reference,created_by) VALUES ($1,$2,now()+interval \'24 hours\',$3,$4)', [email,hash,reference,operator]);
    await client.query('INSERT INTO platform_audit_events(action,result,target_type,reason) VALUES ($1,$2,$3,$4)', [command === 'invite' ? 'OPERATOR_INVITE_CREATE' : 'OPERATOR_INVITE_REISSUE','SUCCESS','ACCOUNT',reference]);
    response = `Chưa gửi thật. Chỉ hiển thị một lần để người demo sao chép: ${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/operator-invitation#token=${encodeURIComponent(raw)}`;
  } else {
    if (!/^[1-9]\d*$/.test(value)) throw new Error('Account ID must be positive');
    const rows = await client.query("SELECT role FROM accounts WHERE account_id=$1 FOR UPDATE", [value]);
    if (rows.rows[0]?.role !== 'superadmin') throw new Error('Target is not a Superadmin');
    if (command === 'grant-audit') {
      await client.query("INSERT INTO platform_permissions(account_id,permission,granted_by,request_reference,reason) VALUES ($1,'PLATFORM_AUDIT_READ',$2,$3,$3)", [value,operator,reference]);
    } else {
      await client.query("UPDATE platform_permissions SET revoked_at=now(),revoked_by=$2 WHERE account_id=$1 AND permission='PLATFORM_AUDIT_READ' AND revoked_at IS NULL", [value,operator]);
      await client.query('DELETE FROM platform_audit_grants WHERE account_id=$1', [value]);
    }
    await client.query('INSERT INTO platform_audit_events(actor_account_id,action,result,target_type,target_id,reason) VALUES (NULL,$1,$2,$3,$4,$5)', [command === 'grant-audit' ? 'AUDIT_PERMISSION_GRANT' : 'AUDIT_PERMISSION_REVOKE','SUCCESS','ACCOUNT',value,reference]);
    response = `${command} complete for Account ${value}`;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ database: identity.rows[0].db, result: response }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.end(); }
